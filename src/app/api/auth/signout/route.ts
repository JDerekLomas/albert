import { clearSessionCookie } from "@/lib/server/session";
export async function POST() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
