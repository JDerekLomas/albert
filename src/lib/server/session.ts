import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * A signed, stateless session: base64url(JSON) + "." + HMAC-SHA256. There is no
 * session table — signing out clears the cookie, and rotating SESSION_SECRET
 * signs everyone out at once. 90 days.
 */
export const COOKIE = "me_session";
const DAYS = 90;

export type SessionUser = { uid: string; email: string; name: string; color: string; exp: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(user: Omit<SessionUser, "exp">): string {
  const payload = b64(JSON.stringify({ ...user, exp: Date.now() + DAYS * 86400e3 }));
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined): SessionUser | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
    if (!user.email || !user.exp || user.exp < Date.now()) return null;
    return user;
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

export async function setSessionCookie(user: Omit<SessionUser, "exp">) {
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Throw a 401 unless there is a valid session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in to continue");
  return user;
}

/** Turn a thrown HttpError (or anything else) into a JSON response. */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  return Response.json({ error: message }, { status: 500 });
}
