import { NextRequest } from "next/server";
import { db, requireRole } from "@/lib/server/db";
import { errorResponse, HttpError, requireUser } from "@/lib/server/session";
import { siteUrl, letter, sendEmail } from "@/lib/server/email";

type Ctx = { params: Promise<{ id: string }> };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invite (or change the role of) a collaborator by email. Owner only. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id: bookId } = await params;
    await requireRole(bookId, me.email, "owner");
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const role = body.role === "owner" || body.role === "viewer" ? body.role : "editor";
    if (!EMAIL.test(email)) throw new HttpError(400, "That doesn't look like an email address");

    const { data: existing } = await db().from("albert_book_members").select("role").eq("book_id", bookId).eq("email", email).maybeSingle();
    const { error } = await db()
      .from("albert_book_members")
      .upsert({ book_id: bookId, email, role, invited_by: me.email }, { onConflict: "book_id,email" });
    if (error) throw new Error(error.message);

    if (!existing && body.notify !== false) {
      const { data: book } = await db().from("albert_books").select("title").eq("id", bookId).single();
      const url = `${siteUrl(req)}/b/${bookId}`;
      const { html, text } = letter({
        heading: `${me.name} invited you to work on “${book?.title}”`,
        lines: [
          `${me.name} (${me.email}) has added you as ${role === "viewer" ? "a reader" : "an editor"} of the manuscript “${book?.title}”.`,
          "Open the book, sign in with this email address, and it will be waiting for you.",
        ],
        cta: { label: "Open the book", url },
        footer: "The manuscript editor: chapters, suggestions you accept or reject, comments, and a map of the whole book.",
      });
      await sendEmail(email, `${me.name} invited you to “${book?.title}”`, html, text).catch((e) => console.error("invite email:", e.message));
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Remove a member. Owner only; the last owner cannot be removed. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const me = await requireUser();
    const { id: bookId } = await params;
    await requireRole(bookId, me.email, "owner");
    const { email } = await req.json();
    const target = String(email || "").toLowerCase();
    const { data: owners } = await db().from("albert_book_members").select("email").eq("book_id", bookId).eq("role", "owner");
    if ((owners || []).length <= 1 && owners?.[0]?.email === target) throw new HttpError(400, "A book needs at least one owner");
    await db().from("albert_book_members").delete().eq("book_id", bookId).eq("email", target);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
