#!/usr/bin/env node
/**
 * Editorial heat map — score every paragraph of a chapter for how much
 * attention it needs, so the editor can shade the prose instead of burying
 * the judgement in a comment thread.
 *
 * Prints only — nothing is stored. The assessment is a lens over the current
 * text, not authored content, and one pass is cheap, so recomputing beats
 * keeping notes that can silently go stale against a rewritten paragraph.
 * The same pass renders as a heat map over the prose in the editor's Heat
 * panel (src/app/api/assess/route.ts holds the identical prompt and schema).
 *
 *   node scripts/assess-chapter.mjs --doc albert-lin-memoir-ch-14
 *   node scripts/assess-chapter.mjs --chapter 14
 *
 * Needs GEMINI_API_KEY — albert's own project-scoped secret-lover entry, not
 * the global one (see CLAUDE.md).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
for (const f of [".env.local", ".env"]) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}

const GEMINI_MODEL = "gemini-3-flash-preview";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
if (!process.env.GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY (albert's project-scoped secret-lover entry).");
  process.exit(1);
}

const args = process.argv.slice(2);
let docId = null;
let chapterNum = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--doc") docId = args[++i];
  else if (args[i] === "--chapter") chapterNum = parseInt(args[++i], 10);
}
if (!docId && !chapterNum) {
  console.error("Usage: assess-chapter.mjs --doc <id> | --chapter <n>");
  process.exit(1);
}

/** Categories double as the legend in the UI — keep in sync with PassageHeatPanel. */
const CATEGORIES = [
  "thin", // the moment is summarised where it should be dramatised
  "unclear", // the reader cannot follow what happened or who is speaking
  "pacing", // rushes or stalls relative to its weight in the chapter
  "continuity", // conflicts with, or should call back to, another chapter
  "voice", // reads as explanation rather than as Albert
  "query", // an open [bracketed] question or a request to the author
  "strong", // leave it alone; marks what is already working
];

const SCHEMA = {
  type: "object",
  properties: {
    passages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "The paragraph's index, exactly as given." },
          score: {
            type: "number",
            description:
              "0 to 1: how much editorial attention this paragraph needs. 0 = finished prose, leave it alone. 1 = must be addressed before this chapter is done. Most paragraphs in a competent draft are below 0.4; reserve above 0.7 for real problems.",
          },
          category: { type: "string", enum: CATEGORIES },
          note: {
            type: "string",
            description:
              "One sentence, max 25 words, naming the specific problem and what would fix it. Concrete, not praise. For 'strong', say what is working so it is protected.",
          },
        },
        required: ["index", "score", "category", "note"],
      },
    },
  },
  required: ["passages"],
};

const SYSTEM = `You are a developmental editor reading one chapter of a literary memoir by Albert Lin — a National Geographic explorer who lost a leg, searched for Genghis Khan's tomb, and whose son survived a traumatic brain injury.

You are marking a heat map: for EVERY paragraph, how much editorial attention does it need, and why?

Rules:
- Albert's voice is the entire asset. Odd constructions and fragments are usually his, not errors. Never flag prose merely for being unpolished, and never suggest making it smoother or more formal.
- Score the WRITING'S NEED FOR WORK, not its subject's importance. A quiet paragraph that does its job scores low.
- Be sparing at the top of the range. If everything is urgent, nothing is.
- Prefer "thin" when a significant moment is narrated in summary and the reader is told rather than shown.
- Use "query" for any paragraph containing bracketed [notes to the author] or highlighted questions.
- Use "strong" (with a low score) for the passages that are working, so they can be protected from later editing.
- Return exactly one entry per paragraph index given, in order.`;

async function callGemini(system, userText, schema) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return JSON.parse(text);
    }
    if (attempt === 3) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}


/** Paragraphs in document order, matching how the editor renders them, so
 *  para_index lines up with the Nth <p> node in TipTap. */
function paragraphs(html) {
  const out = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html))) {
    const text = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    out.push({ index: i++, text });
  }
  return out;
}

const query = supabase.from("albert_documents").select("*");
const { data: doc, error: docErr } = docId
  ? await query.eq("id", docId).single()
  : await query.eq("book_id", "albert-lin-memoir").eq("chapter_number", chapterNum).single();
if (docErr || !doc) {
  console.error("Document not found:", docErr?.message);
  process.exit(1);
}

if (/data-suggest/.test(doc.content || "")) {
  console.error(
    `"${doc.title}" has unresolved suggestions. Assessing now would score half-reviewed\n` +
      "text — resolve them first (chapter.mjs reject-all / accept-all)."
  );
  process.exit(1);
}

const paras = paragraphs(doc.content || "").filter((p) => p.text);
if (!paras.length) {
  console.error("No paragraphs found.");
  process.exit(1);
}

console.log(`"${doc.title}": ${paras.length} paragraphs`);

// One call per chapter: the model needs the whole chapter to judge pacing and
// what is thin relative to everything around it.
const numbered = paras.map((p) => `[${p.index}] ${p.text}`).join("\n\n");
const { passages } = await callGemini(SYSTEM, `${doc.title}\n\n${numbered}`, SCHEMA);

const byIndex = new Map(paras.map((p) => [p.index, p]));
const rows = (passages || [])
  .filter((p) => byIndex.has(p.index))
  .map((p) => ({
    index: p.index,
    score: Math.max(0, Math.min(1, p.score)),
    category: CATEGORIES.includes(p.category) ? p.category : "unclear",
    note: p.note,
  }));
if (!rows.length) {
  console.error("Model returned no usable passages.");
  process.exit(1);
}

const byCat = {};
for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;
console.log(
  "  " +
    Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c}:${n}`)
      .join("  ")
);

const ranked = rows.filter((r) => r.category !== "strong").sort((a, b) => b.score - a.score);
if (!ranked.length) {
  console.log("\n  Nothing flagged — every paragraph read as working.");
} else {
  console.log(`\n  ${ranked.length} paragraph(s) flagged:\n`);
  for (const r of ranked)
    console.log(
      `   ¶${String(r.index + 1).padStart(2)}  ${r.score.toFixed(2)}  ${r.category.padEnd(10)} ${r.note}`
    );
}
console.log(
  "\n  Shown here only — nothing was written. The same pass renders as a heat map\n" +
    "  over the prose in the editor's Heat panel."
);
