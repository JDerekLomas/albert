import { NextRequest } from "next/server";
import { db, requireDocRole } from "@/lib/server/db";
import { errorResponse, HttpError, requireUser } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await requireDocRole(id, me.email, "viewer");
    const { data } = await db().from("albert_comments").select("*").eq("document_id", id).order("created_at", { ascending: false });
    return Response.json({ comments: data || [] });
  } catch (e) {
    return errorResponse(e);
  }
}

/** The author is always the signed-in user; the client cannot choose it. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await requireDocRole(id, me.email, "editor");
    const body = await req.json();
    const content = String(body.content || "").trim();
    if (!content) throw new HttpError(400, "Empty comment");
    const { data, error } = await db()
      .from("albert_comments")
      .insert({
        document_id: id,
        content,
        author: me.name,
        from_pos: Number.isInteger(body.from_pos) ? body.from_pos : 0,
        to_pos: Number.isInteger(body.to_pos) ? body.to_pos : 0,
        quote: body.quote ? String(body.quote) : null,
        resolved: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ comment: data });
  } catch (e) {
    return errorResponse(e);
  }
}
