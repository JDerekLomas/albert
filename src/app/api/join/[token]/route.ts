import { NextRequest } from "next/server";
import { db, ROLE_LEVEL, Role } from "@/lib/server/db";
import { errorResponse, HttpError, requireUser } from "@/lib/server/session";

/** A share link: join the book with the role the owner chose for the link. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const me = await requireUser();
    const { token } = await params;
    const { data: book } = await db().from("albert_books").select("id, title, share_role").eq("share_token", token).maybeSingle();
    if (!book) throw new HttpError(404, "This link is no longer valid");
    const role = (book.share_role === "viewer" ? "viewer" : "editor") as Role;
    const { data: existing } = await db().from("albert_book_members").select("role").eq("book_id", book.id).eq("email", me.email).maybeSingle();
    if (!existing || ROLE_LEVEL[existing.role as Role] < ROLE_LEVEL[role]) {
      const { error } = await db()
        .from("albert_book_members")
        .upsert({ book_id: book.id, email: me.email, role, invited_by: "share-link", accepted_at: new Date().toISOString() }, { onConflict: "book_id,email" });
      if (error) throw new Error(error.message);
    }
    return Response.json({ bookId: book.id, title: book.title });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Peek at the book a link points to (for the join page), without joining. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { data: book } = await db().from("albert_books").select("id, title, share_role").eq("share_token", token).maybeSingle();
    if (!book) throw new HttpError(404, "This link is no longer valid");
    return Response.json({ title: book.title, role: book.share_role });
  } catch (e) {
    return errorResponse(e);
  }
}
