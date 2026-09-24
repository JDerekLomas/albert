import { NextRequest } from "next/server";
import { db, requireRole } from "@/lib/server/db";
import { errorResponse, requireUser } from "@/lib/server/session";

/** Chapter verdicts plus open-comment counts for the book map. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireUser();
    const { id: bookId } = await params;
    await requireRole(bookId, me.email, "viewer");
    const { data: docs } = await db().from("albert_documents").select("id").eq("book_id", bookId);
    const ids = (docs || []).map((d) => d.id);
    const [{ data: verdicts }, { data: comments }] = await Promise.all([
      db().from("albert_chapter_verdicts").select("*").eq("book_id", bookId),
      ids.length ? db().from("albert_comments").select("document_id").eq("resolved", false).in("document_id", ids) : { data: [] },
    ]);
    const openComments: Record<string, number> = {};
    for (const c of (comments || []) as { document_id: string }[]) openComments[c.document_id] = (openComments[c.document_id] || 0) + 1;
    return Response.json({ verdicts: verdicts || [], openComments });
  } catch (e) {
    return errorResponse(e);
  }
}
