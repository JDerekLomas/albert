import { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { currentUser, errorResponse, requireUser, setSessionCookie } from "@/lib/server/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user: { uid: user.uid, email: user.email, name: user.name, color: user.color } });
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireUser();
    const { name, color } = await req.json();
    const patch: Record<string, string> = {};
    if (typeof name === "string" && name.trim()) patch.name = name.trim().slice(0, 60);
    if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) patch.color = color;
    if (Object.keys(patch).length) await db().from("albert_users").update(patch).eq("id", me.uid);
    const next = { uid: me.uid, email: me.email, name: patch.name ?? me.name, color: patch.color ?? me.color };
    await setSessionCookie(next);
    return Response.json({ user: next });
  } catch (e) {
    return errorResponse(e);
  }
}
