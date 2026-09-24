import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/server/db";
import { errorResponse, HttpError, requireUser } from "@/lib/server/session";

const words = (html: string) => html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;

/** The caller's books, with their role and a size. */
export async function GET() {
  try {
    const me = await requireUser();
    const { data: memberships } = await db().from("albert_book_members").select("book_id, role").eq("email", me.email);
    const ids = (memberships || []).map((m) => m.book_id as string);
    if (!ids.length) return Response.json({ books: [] });
    const [{ data: books }, { data: docs }] = await Promise.all([
      db().from("albert_books").select("*").in("id", ids).order("created_at", { ascending: true }),
      db().from("albert_documents").select("book_id, chapter_number, content").in("book_id", ids),
    ]);
    const size: Record<string, { chapters: number; words: number }> = {};
    for (const d of docs || []) {
      if (d.chapter_number == null) continue;
      size[d.book_id] ??= { chapters: 0, words: 0 };
      size[d.book_id].chapters++;
      size[d.book_id].words += words(d.content);
    }
    const role = Object.fromEntries((memberships || []).map((m) => [m.book_id, m.role]));
    return Response.json({
      books: (books || []).map((b) => ({ ...b, share_token: undefined, role: role[b.id], ...(size[b.id] || { chapters: 0, words: 0 }) })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

type ChapterIn = { title: string; html: string; chapter_number: number | null };

/** Create a book (optionally with its chapters) owned by the caller. */
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const { title, chapters } = (await req.json()) as { title?: string; chapters?: ChapterIn[] };
    const name = String(title || "").trim();
    if (!name) throw new HttpError(400, "A title is required");
    const id = nanoid(12);
    const { error } = await db().from("albert_books").insert({ id, title: name, owner_email: me.email });
    if (error) throw new Error(error.message);
    await db().from("albert_book_members").insert({ book_id: id, email: me.email, role: "owner", accepted_at: new Date().toISOString() });

    if (Array.isArray(chapters) && chapters.length) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const rows = chapters.map((c, i) => ({
        id: c.chapter_number == null ? `${id}-front-${i}` : `${id}-ch-${pad(c.chapter_number)}`,
        title: String(c.title || "Untitled").slice(0, 200),
        content: String(c.html || ""),
        chapter_number: c.chapter_number,
        part_number: null,
        book_id: id,
      }));
      const { error: docErr } = await db().from("albert_documents").insert(rows);
      if (docErr) throw new Error(docErr.message);
    }
    return Response.json({ book: { id, title: name, role: "owner" } });
  } catch (e) {
    return errorResponse(e);
  }
}
