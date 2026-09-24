import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { db, requireRole } from "@/lib/server/db";
import { errorResponse, requireUser } from "@/lib/server/session";

/** Add a document (chapter or note) to a book. Editor or owner. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireUser();
    const { id: bookId } = await params;
    await requireRole(bookId, me.email, "editor");
    const body = await req.json().catch(() => ({}));
    const doc = {
      id: nanoid(10),
      title: String(body.title || "Untitled").slice(0, 200),
      content: String(body.content || ""),
      chapter_number: Number.isInteger(body.chapter_number) ? body.chapter_number : null,
      part_number: Number.isInteger(body.part_number) ? body.part_number : null,
      book_id: bookId,
    };
    const { data, error } = await db().from("albert_documents").insert(doc).select().single();
    if (error) throw new Error(error.message);
    return Response.json({ document: data });
  } catch (e) {
    return errorResponse(e);
  }
}
