import { NextRequest } from "next/server";
import { db, requireDocRole } from "@/lib/server/db";
import { errorResponse, HttpError, requireUser } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string }> };

async function locate(id: string, email: string) {
  const { data } = await db().from("albert_comments").select("id, document_id").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "No such comment");
  await requireDocRole(data.document_id, email, "editor");
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await locate(id, me.email);
    const { resolved } = await req.json();
    const { error } = await db().from("albert_comments").update({ resolved: !!resolved }).eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await locate(id, me.email);
    await db().from("albert_comments").delete().eq("id", id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
