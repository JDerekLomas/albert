#!/usr/bin/env node
/**
 * Build the book-level index — the "reduce" half of the map-reduce. Reads
 * every chapter's current summary (not raw chapter text — keeps this step
 * cheap, ~22 short summaries instead of 92k words) and synthesizes one
 * "what this book is about" document: throughlines, recurring images,
 * structural notes, key relationships. Stored in albert_book_index with a
 * snapshot of which summary generation each chapter contributed
 * (generated_from), so this index's own staleness can be checked later the
 * same way a chapter summary's is: does generated_from still match what's
 * actually in albert_chapter_summaries right now?
 *
 * Refuses to run if any chapter is missing a summary or has a stale one
 * (source_updated_at behind the chapter's updated_at) — run
 * summarize-chapter.mjs first. This is the read-time check load-bearing for
 * staleness in this whole system: nothing here is a background job.
 *
 * Usage: node scripts/reindex-book.mjs --book <book-id>
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGemini(system, userText) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userText }] }],
        systemInstruction: { parts: [{ text: system }] },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in Gemini response: ${JSON.stringify(data)}`);
  return text;
}

const args = process.argv.slice(2);
let bookId = null;
for (let i = 0; i < args.length; i++) if (args[i] === "--book") bookId = args[++i];
if (!bookId) {
  console.error("Usage: node scripts/reindex-book.mjs --book <book-id>");
  process.exit(1);
}

async function main() {
  const { data: chapters, error: chError } = await supabase
    .from("albert_documents")
    .select("id,title,chapter_number,part_number,updated_at")
    .eq("book_id", bookId)
    .not("chapter_number", "is", null)
    .order("chapter_number", { ascending: true });
  if (chError) {
    console.error(chError.message);
    process.exit(1);
  }

  const { data: summaries, error: sumError } = await supabase
    .from("albert_chapter_summaries")
    .select("*")
    .in("document_id", chapters.map((c) => c.id));
  if (sumError) {
    console.error(sumError.message);
    process.exit(1);
  }
  const byDoc = new Map(summaries.map((s) => [s.document_id, s]));

  const stale = chapters.filter((c) => {
    const s = byDoc.get(c.id);
    return !s || s.source_updated_at < c.updated_at;
  });
  if (stale.length > 0) {
    console.error(
      `${stale.length} chapter(s) missing a fresh summary — run summarize-chapter.mjs first:\n` +
        stale.map((c) => `  ch${c.chapter_number} "${c.title}" (${c.id})`).join("\n")
    );
    process.exit(1);
  }

  const digest = chapters
    .map((c) => {
      const s = byDoc.get(c.id);
      return (
        `Chapter ${c.chapter_number} (Part ${c.part_number}): ${c.title}\n` +
        `Synopsis: ${s.synopsis}\n` +
        `Themes: ${s.themes.join(", ")}\n` +
        `People: ${(s.entities.people || []).join("; ")}\n` +
        `Places: ${(s.entities.places || []).join("; ")}\n` +
        `Motifs: ${(s.entities.motifs || []).join("; ")}\n` +
        `Callbacks: ${(s.entities.callbacks || []).join("; ")}`
      );
    })
    .join("\n\n");

  const synthesis = await callGemini(
    "You are building a reference index for a memoir, from per-chapter summaries (not the raw manuscript). Write a synthesis a co-writer could read once to understand the whole book: the major throughlines across all parts, images/motifs that recur and evolve (name which chapters), the key relationships and how they develop, and the overall structural shape (how the parts build on each other). Be specific — name chapters and people, don't generalize. Plain prose with clear paragraph breaks, no headers needed.",
    digest
  );

  const generatedFrom = chapters.map((c) => ({
    document_id: c.id,
    source_updated_at: byDoc.get(c.id).source_updated_at,
  }));

  const { error: writeError } = await supabase.from("albert_book_index").upsert(
    {
      book_id: bookId,
      synthesis,
      generated_at: new Date().toISOString(),
      generated_from: generatedFrom,
    },
    { onConflict: "book_id" }
  );
  if (writeError) throw new Error(writeError.message);

  console.log(`Book index rebuilt from ${chapters.length} chapter summaries.`);
  console.log(`\n${synthesis}`);
}

main();
