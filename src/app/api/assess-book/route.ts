import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assessChapter } from "@/lib/editorial.mjs";

/**
 * Assess every chapter of a book and store the verdicts, so the book map has
 * something to draw.
 *
 * The per-chapter heat map recomputes on every open and stores nothing — right
 * for a lens over prose you are editing right now, wrong for a view of 22
 * chapters at once, which would be 22 model calls on every page load. So the
 * verdict (and only the verdict — the paragraph scores stay ephemeral) is
 * persisted, with staleness computed on read exactly like the chapter index:
 * a verdict is stale iff source_updated_at < albert_documents.updated_at.
 * Nothing here is ever shown as current when the prose has moved on.
 */
export const maxDuration = 300;

const CONCURRENCY = 4;

export async function POST(req: NextRequest) {
  const { bookId, force } = await req.json();
  if (!bookId) return Response.json({ error: "bookId is required" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [{ data: docs }, { data: existing }] = await Promise.all([
    supabase
      .from("albert_documents")
      .select("*")
      .eq("book_id", bookId)
      .not("chapter_number", "is", null)
      .order("chapter_number"),
    supabase.from("albert_chapter_verdicts").select("*").eq("book_id", bookId),
  ]);

  const fresh = new Map(
    (existing || []).map((v: { document_id: string; source_updated_at: string }) => [
      v.document_id,
      v.source_updated_at,
    ])
  );

  const todo = (docs || []).filter(
    (d: { id: string; content: string | null; updated_at: string }) => {
      if (!d.content) return false;
      // Half-reviewed text would be scored as if the author wrote it.
      if (/data-suggest/.test(d.content)) return false;
      if (force) return true;
      const at = fresh.get(d.id);
      // Compare as instants: Postgres returns +00:00, toISOString writes Z, and
      // "+" sorts before "Z", so string comparison silently inverts.
      return !at || new Date(at).getTime() < new Date(d.updated_at).getTime();
    }
  );

  const results: { id: string; state: string }[] = [];
  const failures: { id: string; error: string }[] = [];

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(
        async (d: { id: string; title: string; content: string; updated_at: string }) => {
          try {
            const { chapter, passages } = await assessChapter(d.title, d.content);
            if (!chapter) return;
            const findings = passages.filter(
              (p: { category: string }) => p.category !== "strong" && p.category !== "query"
            ).length;
            const queries = passages.filter(
              (p: { category: string }) => p.category === "query"
            ).length;
            const { error } = await supabase.from("albert_chapter_verdicts").upsert(
              {
                document_id: d.id,
                book_id: bookId,
                state: chapter.state,
                headline: chapter.headline,
                diagnosis: chapter.diagnosis,
                next_action: chapter.next_action,
                finding_count: findings,
                query_count: queries,
                source_updated_at: d.updated_at,
              },
              { onConflict: "document_id" }
            );
            if (error) failures.push({ id: d.id, error: error.message });
            else results.push({ id: d.id, state: chapter.state });
          } catch (e) {
            failures.push({ id: d.id, error: e instanceof Error ? e.message : "failed" });
          }
        }
      )
    );
  }

  return Response.json({
    assessed: results.length,
    skipped: (docs || []).length - todo.length,
    failures,
  });
}
