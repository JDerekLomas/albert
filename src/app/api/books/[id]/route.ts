import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { db, requireRole, touchMembership } from "@/lib/server/db";
import { errorResponse, HttpError, requireUser } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string }> };

/** The book, its documents, its members, and the caller's role. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    const role = await requireRole(id, me.email, "viewer");
    await touchMembership(id, me.email);
    const [{ data: book }, { data: documents }, { data: members }] = await Promise.all([
      db().from("albert_books").select("*").eq("id", id).single(),
      db()
        .from("albert_documents")
        .select("*")
        .eq("book_id", id)
        .order("part_number", { ascending: true, nullsFirst: false })
        .order("chapter_number", { ascending: true, nullsFirst: false }),
      db().from("albert_book_members").select("email, role, accepted_at, created_at").eq("book_id", id).order("created_at"),
    ]);
    if (!book) throw new HttpError(404, "No such book");
    const safe = role === "owner" ? book : { ...book, share_token: undefined };
    return Response.json({ book: safe, documents: documents || [], members: members || [], role });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Rename, or manage the share link. Owner only. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await requireRole(id, me.email, "owner");
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 200);
    if (body.share_role === "editor" || body.share_role === "viewer") patch.share_role = body.share_role;
    if (body.share_enabled === true) {
      const { data: cur } = await db().from("albert_books").select("share_token").eq("id", id).single();
      if (!cur?.share_token || body.rotate) patch.share_token = randomBytes(18).toString("base64url");
    }
    if (body.share_enabled === false) patch.share_token = null;
    if (Object.keys(patch).length) {
      const { error } = await db().from("albert_books").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    }
    const { data: book } = await db().from("albert_books").select("*").eq("id", id).single();
    return Response.json({ book });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Delete the book and everything in it (documents, versions, comments cascade). Owner only. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await requireRole(id, me.email, "owner");
    const { data: docs } = await db().from("albert_documents").select("id").eq("book_id", id);
    const docIds = (docs || []).map((d) => d.id);
    if (docIds.length) {
      await db().from("albert_versions").delete().in("document_id", docIds);
      await db().from("albert_comments").delete().in("document_id", docIds);
      await db().from("albert_chapter_verdicts").delete().eq("book_id", id);
      await db().from("albert_documents").delete().eq("book_id", id);
    }
    await db().from("albert_book_members").delete().eq("book_id", id);
    const { error } = await db().from("albert_books").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
