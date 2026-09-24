import { NextRequest } from "next/server";
import { db, requireDocRole } from "@/lib/server/db";
import { errorResponse, requireUser } from "@/lib/server/session";

/** Record an accept/reject of an AI suggestion (the audit trail behind the Suggestions panel). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireUser();
    const { id } = await params;
    await requireDocRole(id, me.email, "editor");
    const b = await req.json();
    const { error } = await db().from("albert_suggestion_log").insert({
      document_id: id,
      sid: String(b.sid || ""),
      action: b.action === "accepted" ? "accepted" : "rejected",
      del_text: b.del_text ?? null,
      ins_text: b.ins_text ?? null,
      reason: b.reason ?? null,
      author: b.author ?? null,
    });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
