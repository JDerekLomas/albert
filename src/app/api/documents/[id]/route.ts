import { NextRequest } from "next/server";
import { db, requireDocRole } from "@/lib/server/db";
import { errorResponse, HttpError, requireUser } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    const { role } = await requireDocRole(id, me.email, "viewer");
    const { data } = await db().from("albert_documents").select("*").eq("id", id).single();
    if (!data) throw new HttpError(404, "No such document");
    return Response.json({ document: data, role });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Save content and/or title. Editor or owner. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await requireDocRole(id, me.email, "editor");
    const body = await req.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.content === "string") patch.content = body.content;
    if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
    if (Number.isInteger(body.chapter_number) || body.chapter_number === null) patch.chapter_number = body.chapter_number;
    if (Number.isInteger(body.part_number) || body.part_number === null) patch.part_number = body.part_number;
    const { data, error } = await db().from("albert_documents").update(patch).eq("id", id).select("id, updated_at").single();
    if (error) throw new Error(error.message);
    return Response.json({ document: data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await requireDocRole(id, me.email, "editor");
    await db().from("albert_versions").delete().eq("document_id", id);
    await db().from("albert_comments").delete().eq("document_id", id);
    const { error } = await db().from("albert_documents").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
