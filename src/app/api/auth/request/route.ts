import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/server/db";
import { errorResponse, HttpError } from "@/lib/server/session";
import { siteUrl, letter, sendEmail } from "@/lib/server/email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Send a sign-in link. Always answers 200 for a well-formed address, so the
 *  form can't be used to probe which emails exist. */
export async function POST(req: NextRequest) {
  try {
    const { email: raw, redirect } = await req.json();
    const email = String(raw || "").trim().toLowerCase();
    if (!EMAIL.test(email)) throw new HttpError(400, "That doesn't look like an email address");
    const safeRedirect = typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";

    const token = randomBytes(32).toString("base64url");
    const token_hash = createHash("sha256").update(token).digest("hex");
    const { error } = await db().from("albert_login_tokens").insert({
      token_hash,
      email,
      redirect: safeRedirect,
      expires_at: new Date(Date.now() + 15 * 60e3).toISOString(),
    });
    if (error) throw new Error(error.message);

    const url = `${siteUrl(req)}/auth/verify?t=${token}`;
    const { html, text } = letter({
      heading: "Your sign-in link",
      lines: ["Click the button to sign in to the manuscript editor. The link works once and expires in 15 minutes."],
      cta: { label: "Sign in", url },
      footer: "If you didn't ask for this, you can ignore it — nothing happens unless the link is used.",
    });
    await sendEmail(email, "Sign in to the manuscript editor", html, text);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
