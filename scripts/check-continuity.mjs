#!/usr/bin/env node
/**
 * Continuity check — the whole book, read at once, looking for the places it
 * contradicts itself.
 *
 *   node scripts/check-continuity.mjs --book sandbox-salt-line
 *   node scripts/check-continuity.mjs --book albert-lin-memoir --ledger
 *
 * This is the pass the per-chapter heat map cannot be. Ages, dates and the
 * state of the world only conflict *across* chapters, and the heat map is
 * handed one chapter at a time, so it can never see them — it scored a fixture
 * with two planted cross-chapter errors and missed both, twice out of twice.
 *
 * Prints only. Contradictions are a claim about the manuscript, and a claim
 * belongs in front of a human before it becomes an edit.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { runContinuity } from "../src/lib/editorial.mjs";

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

const args = process.argv.slice(2);
let bookId = "albert-lin-memoir";
let showLedger = false;
let passes = 3;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--book") bookId = args[++i];
  else if (args[i] === "--ledger") showLedger = true;
  else if (args[i] === "--passes") passes = Math.max(1, parseInt(args[++i], 10) || 1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
if (!process.env.GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY (albert's project-scoped secret-lover entry).");
  process.exit(1);
}

const { data: docs, error } = await supabase
  .from("albert_documents")
  .select("*")
  .eq("book_id", bookId)
  .not("chapter_number", "is", null)
  .order("chapter_number");
if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const chapters = (docs || []).filter((d) => d.content);
if (chapters.length < 2) {
  console.error(`Need at least two chapters in "${bookId}" — found ${chapters.length}.`);
  process.exit(1);
}

const pending = chapters.filter((d) => /data-suggest/.test(d.content));
if (pending.length) {
  console.error(
    `Unresolved suggestions in ${pending.map((d) => `Ch${d.chapter_number}`).join(", ")} — ` +
      "they would be read as half-reviewed text. Resolve them first."
  );
  process.exit(1);
}

function toText(html) {
  return html
    .replace(/<\/(p|h[1-6]|blockquote|li)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Uncompressed on purpose: summaries drop exactly the small concrete facts
// (an age, a colour, whether the ground was still wet) that contradictions are
// made of.
const book = chapters
  .map((d) => `=== CHAPTER ${d.chapter_number}: ${d.title} ===\n\n${toText(d.content)}`)
  .join("\n\n");
const words = book.split(/\s+/).filter(Boolean).length;

console.log(
  `Reading all ${chapters.length} chapters of "${bookId}" (~${words.toLocaleString()} words), ` +
    `${passes} independent pass${passes === 1 ? "" : "es"}…`
);

const result = await runContinuity(book, { passes });
const valid = new Set(chapters.map((d) => d.chapter_number));

const contradictions = result.contradictions
  .map((c) => ({
    ...c,
    chapters: (c.chapters || []).filter((n) => valid.has(n)),
    evidence: (c.evidence || []).filter((e) => valid.has(e.chapter)),
  }))
  .filter((c) => c.chapters.length);

if (result.passes < passes)
  console.log(`  (${passes - result.passes} pass(es) failed; merging the ${result.passes} that returned.)`);

if (!contradictions.length) {
  console.log("\n  No contradictions found.");
} else {
  console.log(`\n  ${contradictions.length} contradiction(s):\n`);
  for (const c of contradictions) {
    console.log(
      `  [${(c.confidence || "?").toUpperCase()}] ${c.title}  —  Ch${(c.chapters || []).join(", Ch")}` +
        `  (${c.agreed}/${result.passes} passes)`
    );
    console.log(`      ${c.detail}`);
    for (const e of c.evidence || []) console.log(`      Ch${e.chapter}: “${e.quote}”`);
    if (c.fix) console.log(`      → ${c.fix}`);
    console.log("");
  }
}

const ledger = result.ledger;
if (showLedger && ledger.length) {
  console.log(`  Ledger — what the book asserts more than once:\n`);
  for (const l of ledger.sort((a, b) => Number(a.consistent) - Number(b.consistent))) {
    console.log(
      `  ${l.consistent ? " " : "!"} ${l.subject} (${l.kind})`
    );
    for (const e of l.entries) console.log(`      Ch${e.chapter}: ${e.value}`);
  }
  console.log("");
} else if (ledger.length) {
  console.log(`  ${ledger.length} tracked facts in the ledger — re-run with --ledger to see them.`);
}

console.log("  Nothing was written. Every finding above is a claim to check, not an edit.");
