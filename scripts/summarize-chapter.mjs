#!/usr/bin/env node
/**
 * Generate (or refresh) a structured summary for one or all chapters of a
 * book — the "map" half of the book-index map-reduce. Stored in
 * albert_chapter_summaries alongside source_updated_at, a copy of the
 * chapter's updated_at at generation time. A summary is stale exactly when
 * its source_updated_at no longer matches the chapter's current updated_at
 * — computed on read, never stored as a flag, so it can't silently drift
 * from reality. Skips chapters that are already fresh unless --force.
 *
 * Usage:
 *   node scripts/summarize-chapter.mjs --doc <document-id> [--force]
 *   node scripts/summarize-chapter.mjs --book <book-id> --all [--force]
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const args = process.argv.slice(2);
let docId = null;
let bookId = null;
let all = false;
let force = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--doc") docId = args[++i];
  else if (args[i] === "--book") bookId = args[++i];
  else if (args[i] === "--all") all = true;
  else if (args[i] === "--force") force = true;
}
if (!docId && !(bookId && all)) {
  console.error("Usage: node scripts/summarize-chapter.mjs --doc <id> [--force]");
  console.error("   or: node scripts/summarize-chapter.mjs --book <id> --all [--force]");
  process.exit(1);
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    synopsis: {
      type: "string",
      description: "2-4 sentences: what actually happens in this chapter, in reading order.",
    },
    themes: {
      type: "array",
      items: { type: "string" },
      description: "3-6 short theme/motif phrases this chapter develops (e.g. 'belonging vs exile', 'the body as instrument').",
    },
    people: { type: "array", items: { type: "string" }, description: "Named people who appear, with a 3-8 word role note each." },
    places: { type: "array", items: { type: "string" } },
    motifs: { type: "array", items: { type: "string" }, description: "Recurring images/objects/symbols (e.g. 'doors', 'drums', 'water')." },
    callbacks: {
      type: "array",
      items: { type: "string" },
      description: "Anything that explicitly echoes an earlier chapter or plants something for a later one.",
    },
  },
  required: ["synopsis", "themes", "people", "places", "motifs", "callbacks"],
};

async function callGemini(system, userText, schema) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userText }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { responseMimeType: "application/json", responseSchema: schema },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in Gemini response: ${JSON.stringify(data)}`);
  return JSON.parse(text);
}

async function summarizeOne(doc) {
  const { data: existing } = await supabase
    .from("albert_chapter_summaries")
    .select("source_updated_at")
    .eq("document_id", doc.id)
    .maybeSingle();

  if (!force && existing && existing.source_updated_at >= doc.updated_at) {
    console.log(`  ch${doc.chapter_number} "${doc.title}": fresh, skipping`);
    return;
  }

  const text = doc.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const { synopsis, themes, people, places, motifs, callbacks } = await callGemini(
    "You are a developmental editor building a reference index for a memoir. Read the chapter and extract a factual, specific summary — no praise, no critique, just what's there.",
    `${doc.title}\n\n${text}`,
    SUMMARY_SCHEMA
  );

  const { error } = await supabase.from("albert_chapter_summaries").upsert(
    {
      document_id: doc.id,
      synopsis,
      themes,
      entities: { people, places, motifs, callbacks },
      source_updated_at: doc.updated_at,
      generated_at: new Date().toISOString(),
      model: GEMINI_MODEL,
    },
    { onConflict: "document_id" }
  );
  if (error) throw new Error(`Write failed for ${doc.id}: ${error.message}`);

  console.log(`  ch${doc.chapter_number} "${doc.title}": summarized`);
}

async function main() {
  let docs;
  if (docId) {
    const { data, error } = await supabase.from("albert_documents").select("*").eq("id", docId).single();
    if (error || !data) {
      console.error("Document not found:", error?.message);
      process.exit(1);
    }
    docs = [data];
  } else {
    const { data, error } = await supabase
      .from("albert_documents")
      .select("*")
      .eq("book_id", bookId)
      .not("chapter_number", "is", null)
      .order("chapter_number", { ascending: true });
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    docs = data;
  }

  console.log(`Summarizing ${docs.length} chapter(s)${force ? " (forced)" : ""}...`);
  for (const doc of docs) {
    await summarizeOne(doc);
  }
  console.log("Done.");
}

main();
