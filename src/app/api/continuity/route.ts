import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runContinuity } from "@/lib/editorial.mjs";

/**
 * Continuity check — the only pass that reads the whole book at once.
 *
 * It exists because continuity was a *category* on the per-chapter heat map
 * until 2026-09-04, which was a promise the tool could not keep: that pass is
 * handed one chapter, so a character who is seven in Ch1 and eleven twenty
 * months later in Ch2 is invisible to it. A test fixture with two planted
 * cross-chapter errors missed both, every time. Contradiction is a property of
 * a book, so it gets a book-level pass and a book-level surface.
 *
 * Whole-book, uncompressed: summaries would drop exactly the small concrete
 * facts (an age, a colour, whether the ground was wet) that contradictions are
 * made of. ~92k words of memoir is well inside the model's context and costs a
 * fraction of a cent, so there is no reason to be clever about it.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { bookId } = await req.json();
  if (!bookId) return Response.json({ error: "bookId is required" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: docs, error } = await supabase
    .from("albert_documents")
    .select("*")
    .eq("book_id", bookId)
    .order("part_number", { ascending: true, nullsFirst: false })
    .order("chapter_number", { ascending: true, nullsFirst: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const chapters = (docs || []).filter(
    (d: { chapter_number: number | null; content: string | null }) =>
      d.chapter_number != null && d.content
  );
  if (chapters.length < 2) {
    return Response.json(
      { error: "A continuity check needs at least two chapters." },
      { status: 400 }
    );
  }

  const pending = chapters.filter((d: { content: string }) => /data-suggest/.test(d.content));
  if (pending.length) {
    return Response.json(
      {
        error: `Resolve pending suggestions first — ${pending
          .map((d: { chapter_number: number }) => `Ch${d.chapter_number}`)
          .join(", ")} would be read half-reviewed.`,
      },
      { status: 409 }
    );
  }

  const book = chapters
    .map(
      (d: { chapter_number: number; title: string; content: string }) =>
        `=== CHAPTER ${d.chapter_number}: ${d.title} ===\n\n` +
        d.content
          .replace(/<\/(p|h[1-6]|blockquote|li)>/gi, "\n\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
    )
    .join("\n\n");

  const words = book.split(/\s+/).filter(Boolean).length;

  try {
    const result = await runContinuity(book, { passes: 3 });
    const valid = new Set(chapters.map((d: { chapter_number: number }) => d.chapter_number));

    // Drop anything citing a chapter that isn't in the book — a hallucinated
    // reference is worse than a missing finding, because it costs a human the
    // trip to go look.
    const contradictions = result.contradictions
      .map((c: { chapters?: number[]; evidence?: { chapter: number }[] }) => ({
        ...c,
        chapters: (c.chapters || []).filter((n: number) => valid.has(n)),
        evidence: (c.evidence || []).filter((e) => valid.has(e.chapter)),
      }))
      .filter((c: { chapters: number[] }) => c.chapters.length >= 1);

    const ledger = result.ledger
      .map((l: { entries?: { chapter: number }[] }) => ({
        ...l,
        entries: (l.entries || []).filter((e) => valid.has(e.chapter)),
      }))
      .filter((l: { entries: unknown[] }) => l.entries.length >= 2);

    return Response.json({
      contradictions,
      ledger,
      chapterCount: chapters.length,
      wordCount: words,
      passes: result.passes,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Continuity check failed" },
      { status: 502 }
    );
  }
}
