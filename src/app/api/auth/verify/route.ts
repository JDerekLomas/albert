import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/server/db";
import { errorResponse, HttpError, setSessionCookie } from "@/lib/server/session";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

/** Consume a sign-in token: one use, 15 minutes. Creates the user on first sign-in. */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") throw new HttpError(400, "Missing token");
    const token_hash = createHash("sha256").update(token).digest("hex");
    const { data: row } = await db().from("albert_login_tokens").select("*").eq("token_hash", token_hash).maybeSingle();
    if (!row) throw new HttpError(400, "This link is not valid. Request a new one.");
    if (row.used_at) throw new HttpError(400, "This link was already used. Request a new one.");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new HttpError(400, "This link has expired. Request a new one.");
    await db().from("albert_login_tokens").update({ used_at: new Date().toISOString() }).eq("token_hash", token_hash);

    const email = row.email as string;
    let { data: user } = await db().from("albert_users").select("*").eq("email", email).maybeSingle();
    let isNew = false;
    if (!user) {
      isNew = true;
      const created = await db()
        .from("albert_users")
        .insert({ email, name: email.split("@")[0], color: COLORS[Math.floor(Math.random() * COLORS.length)] })
        .select()
        .single();
      if (created.error) throw new Error(created.error.message);
      user = created.data;
    }
    await db().from("albert_users").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
    // Any invite addressed to this email is now accepted.
    await db().from("albert_book_members").update({ accepted_at: new Date().toISOString() }).eq("email", email).is("accepted_at", null);

    await setSessionCookie({ uid: user.id, email, name: user.name, color: user.color });
    // A brand-new account has no real name yet (just the email's local part);
    // the verify page asks for one before moving on.
    return Response.json({
      ok: true,
      redirect: row.redirect || "/",
      needsName: isNew,
      user: { uid: user.id, email, name: user.name, color: user.color },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
