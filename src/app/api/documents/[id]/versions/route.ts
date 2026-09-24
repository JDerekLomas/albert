import { NextRequest } from "next/server";
import { db, requireDocRole } from "@/lib/server/db";
import { errorResponse, requireUser } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await requireDocRole(id, me.email, "viewer");
    const { data } = await db().from("albert_versions").select("*").eq("document_id", id).order("created_at", { ascending: false });
    return Response.json({ versions: data || [] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await requireDocRole(id, me.email, "editor");
    const { content, title, message } = await req.json();
    const { data, error } = await db()
      .from("albert_versions")
      .insert({ document_id: id, content: String(content ?? ""), title: title ?? null, message: message ? String(message).slice(0, 200) : null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ version: data });
  } catch (e) {
    return errorResponse(e);
  }
}
