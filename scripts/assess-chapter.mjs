#!/usr/bin/env node
/**
 * Editorial heat map — a verdict on a chapter, and a score for every paragraph
 * in it, so the editor can shade the prose instead of burying the judgement in
 * a comment thread.
 *
 * Prints only — nothing is stored. The assessment is a lens over the current
 * text, not authored content, and one pass is cheap, so recomputing beats
 * keeping notes that can silently go stale against a rewritten paragraph. The
 * same pass renders as a heat map over the prose in the editor's Heat panel;
 * both call the identical prompt in src/lib/editorial.mjs.
 *
 *   node scripts/assess-chapter.mjs --doc sandbox-salt-line-ch-02
 *   node scripts/assess-chapter.mjs --chapter 14
 *   node scripts/assess-chapter.mjs --book sandbox-salt-line --chapter 2
 *   node scripts/assess-chapter.mjs --book sandbox-salt-line --all
 *
 * Cross-chapter contradictions are NOT judged here — this pass only ever sees
 * one chapter. Run scripts/check-continuity.mjs for those.
 *
 * Needs GEMINI_API_KEY — albert's own project-scoped secret-lover entry, not
 * the global one (see CLAUDE.md).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  ASSESS_SCHEMA,
  ASSESS_SYSTEM,
  CHAPTER_STATE_HELP,
  callGemini,
  normalizeAssessment,
  paragraphs,
} from "../src/lib/editorial.mjs";

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
let bookId = "albert-lin-memoir";
let all = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--doc") docId = args[++i];
  else if (args[i] === "--chapter") chapterNum = parseInt(args[++i], 10);
  else if (args[i] === "--book") bookId = args[++i];
  else if (args[i] === "--all") all = true;
}
if (!docId && !chapterNum && !all) {
  console.error("Usage: assess-chapter.mjs --doc <id> | --chapter <n> | --all  [--book <id>]");
  process.exit(1);
}

const base = () => supabase.from("albert_documents").select("*");
let docs;
if (docId) {
  const { data, error } = await base().eq("id", docId).single();
  if (error || !data) {
    console.error("Document not found:", error?.message);
    process.exit(1);
  }
  docs = [data];
} else if (all) {
  const { data } = await base()
    .eq("book_id", bookId)
    .not("chapter_number", "is", null)
    .order("chapter_number");
  docs = data || [];
} else {
  const { data, error } = await base()
    .eq("book_id", bookId)
    .eq("chapter_number", chapterNum)
    .single();
  if (error || !data) {
    console.error("Chapter not found:", error?.message);
    process.exit(1);
  }
  docs = [data];
}

const BAR = "─".repeat(72);

for (const doc of docs) {
  console.log(`\n${BAR}\n${doc.title}`);

  if (/data-suggest/.test(doc.content || "")) {
    console.log(
      "  Skipped — unresolved suggestions would be scored as half-reviewed text.\n" +
        "  Resolve them first (chapter.mjs reject-all / accept-all)."
    );
    continue;
  }

  const paras = paragraphs(doc.content || "").filter((p) => p.text);
  if (!paras.length) {
    console.log("  No paragraphs.");
    continue;
  }

  // One call per chapter: the model needs the whole chapter to judge pacing and
  // what is thin relative to everything around it.
  const numbered = paras.map((p) => `[${p.index}] ${p.text}`).join("\n\n");
  const parsed = await callGemini(ASSESS_SYSTEM, `${doc.title}\n\n${numbered}`, ASSESS_SCHEMA);
  const { chapter, passages: rows } = normalizeAssessment(parsed, paras);

  if (chapter) {
    console.log(
      `\n  ${chapter.state.toUpperCase()} — ${chapter.headline}` +
        `\n  ${CHAPTER_STATE_HELP[chapter.state] || ""}` +
        `\n\n  ${chapter.diagnosis}` +
        `\n  → ${chapter.next_action}`
    );
  }

  const byCat = {};
  for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;
  console.log(
    `\n  ${paras.length} paragraphs   ` +
      Object.entries(byCat)
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${c}:${n}`)
        .join("  ")
  );

  // The author's own bracketed notes are listed separately: they are their
  // to-do list, not findings, and they used to sit at the top of this list and
  // crowd out everything the pass actually contributed.
  const findings = rows
    .filter((r) => r.category !== "strong" && r.category !== "query")
    .sort((a, b) => b.score - a.score);
  const queries = rows.filter((r) => r.category === "query");

  if (!findings.length) {
    console.log("\n  Nothing flagged — every paragraph read as working.");
  } else {
    console.log(`\n  ${findings.length} finding(s):\n`);
    for (const r of findings)
      console.log(
        `   ¶${String(r.index + 1).padStart(2)}  ${r.score.toFixed(2)}  ${r.category.padEnd(8)} ${r.note}`
      );
  }

  if (queries.length) {
    console.log(`\n  ${queries.length} open question(s) the author left:\n`);
    for (const r of queries) console.log(`   ¶${String(r.index + 1).padStart(2)}  ${r.note}`);
  }
}

console.log(
  `\n${BAR}\n  Shown here only — nothing was written. The same pass renders as a heat map\n` +
    "  over the prose in the editor's Heat panel. For cross-chapter contradictions,\n" +
    "  run: node scripts/check-continuity.mjs --book <id>"
);
