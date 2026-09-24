import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./session";

/** Service-role client: bypasses RLS, so every route that uses it must check
 *  membership first (see `requireRole`). Server only — never import from a
 *  client component. */
let _db: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_db) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    _db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  }
  return _db;
}

export type Role = "owner" | "editor" | "viewer";
export const ROLE_LEVEL: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export async function roleFor(bookId: string, email: string): Promise<Role | null> {
  const { data } = await db()
    .from("albert_book_members")
    .select("role")
    .eq("book_id", bookId)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return (data?.role as Role) ?? null;
}

/** 404 (not 403) when the caller is not a member at all, so the existence of a
 *  book id leaks nothing. 403 when they are a member without enough rights. */
export async function requireRole(bookId: string, email: string, min: Role): Promise<Role> {
  const role = await roleFor(bookId, email);
  if (!role) throw new HttpError(404, "No such book, or you are not a member of it");
  if (ROLE_LEVEL[role] < ROLE_LEVEL[min]) throw new HttpError(403, `This needs the ${min} role`);
  return role;
}

/** The book a document belongs to, plus the caller's role in it. */
export async function requireDocRole(documentId: string, email: string, min: Role) {
  const { data: doc } = await db().from("albert_documents").select("id, book_id").eq("id", documentId).maybeSingle();
  if (!doc || !doc.book_id) throw new HttpError(404, "No such document");
  const role = await requireRole(doc.book_id, email, min);
  return { bookId: doc.book_id as string, role };
}

/** Mark an invite accepted the first time the invitee shows up. */
export async function touchMembership(bookId: string, email: string) {
  await db()
    .from("albert_book_members")
    .update({ accepted_at: new Date().toISOString() })
    .eq("book_id", bookId)
    .eq("email", email.toLowerCase())
    .is("accepted_at", null);
}
