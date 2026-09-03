#!/usr/bin/env node
/**
 * Import the full manuscript/part{1,2,3,4}/*.txt workspace into Supabase as
 * one clean, correctly-numbered book — replacing whatever's currently in
 * albert_documents. This is a full reset, not a merge: everything currently
 * online is snapshotted to notes/backups/<timestamp>/ first (see
 * scripts/backup-db.mjs), then albert_documents is cleared and rebuilt from
 * git, which is the source of truth (see split-manuscript.mjs).
 *
 * Usage: node scripts/import-book.mjs --book-id albert-lin-memoir --title "..." --confirm
 * Without --confirm, does a dry run: parses everything and reports counts,
 * writes nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.slice(2);
let bookId = null;
let bookTitle = null;
let confirm = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--book-id") bookId = args[++i];
  else if (args[i] === "--title") bookTitle = args[++i];
  else if (args[i] === "--confirm") confirm = true;
}
if (!bookId || !bookTitle) {
  console.error('Usage: node scripts/import-book.mjs --book-id <id> --title "<title>" [--confirm]');
  process.exit(1);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** *italic* -> <em>, [bracketed query] -> <mark> (Albert's open-question convention), scene breaks -> <hr> */
function bodyToHtml(body) {
  const blocks = body.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((b) => {
      if (b === "---") return "<hr>";
      let html = escapeHtml(b);
      html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      html = html.replace(/\[([^\]]+)\]/g, '<mark data-query="1">[$1]</mark>');
      return `<p>${html}</p>`;
    })
    .join("\n");
}

const manuscriptDir = resolve(import.meta.dirname, "..", "manuscript");
const parts = [1, 2, 3, 4];
const documents = []; // { title, content, chapter_number, part_number }

for (const part of parts) {
  const dir = resolve(manuscriptDir, `part${part}`);
  const files = readdirSync(dir).sort();

  const openerFile = files.find((f) => f.startsWith("00-part-opener"));
  if (openerFile) {
    const raw = readFileSync(resolve(dir, openerFile), "utf8").trim();
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const partTitle = lines[0];
    const epigraph = lines.slice(1).join("\n");
    const content = epigraph
      ? `<p><em>${escapeHtml(epigraph).replace(/\n/g, "<br>")}</em></p>`
      : "";
    documents.push({
      title: partTitle,
      content,
      chapter_number: null,
      part_number: part,
      is_part_opener: true,
    });
  }

  for (const f of files.filter((f) => f.startsWith("ch"))) {
    const raw = readFileSync(resolve(dir, f), "utf8");
    const m = raw.match(/^CHAPTER (\d+)\n(.+)\n\n([\s\S]*)$/);
    if (!m) throw new Error(`Couldn't parse ${f}`);
    const [, num, title, body] = m;
    documents.push({
      title: `Chapter ${num}: ${title.trim()}`,
      content: `<h1>Chapter ${num}: ${title.trim()}</h1>\n${bodyToHtml(body)}`,
      chapter_number: parseInt(num, 10),
      part_number: part,
      is_part_opener: false,
    });
  }
}

const totalWords = documents.reduce(
  (sum, d) => sum + d.content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length,
  0
);

console.log(
  `Parsed ${documents.length} documents (${documents.filter((d) => !d.is_part_opener).length} chapters, ` +
    `${documents.filter((d) => d.is_part_opener).length} part openers), ~${totalWords.toLocaleString()} words.`
);

if (!confirm) {
  console.log("\nDry run — no writes made. Re-run with --confirm to apply.");
  console.log("This will DELETE all rows in albert_documents (cascading to versions/comments) first.");
  process.exit(0);
}

const { count: existingCount } = await supabase
  .from("albert_documents")
  .select("*", { count: "exact", head: true });
console.log(`\nDeleting ${existingCount} existing documents...`);
const { error: delError } = await supabase.from("albert_documents").delete().neq("id", "__none__");
if (delError) {
  console.error("Delete failed:", delError.message);
  process.exit(1);
}

const { error: bookError } = await supabase
  .from("albert_books")
  .upsert({ id: bookId, title: bookTitle }, { onConflict: "id" });
if (bookError) {
  console.error("Book upsert failed:", bookError.message);
  process.exit(1);
}
console.log(`Book: ${bookTitle} (${bookId})`);

const rows = documents.map((d) => ({
  id: d.is_part_opener ? `${bookId}-part-${d.part_number}` : `${bookId}-ch-${String(d.chapter_number).padStart(2, "0")}`,
  book_id: bookId,
  title: d.title,
  content: d.content,
  chapter_number: d.chapter_number,
  part_number: d.part_number,
}));

const { error: insertError } = await supabase.from("albert_documents").insert(rows);
if (insertError) {
  console.error("Insert failed:", insertError.message);
  process.exit(1);
}

console.log(`Inserted ${rows.length} documents into book "${bookTitle}".`);
