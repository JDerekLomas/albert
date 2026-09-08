#!/usr/bin/env node
/**
 * Import one book's manuscripts/<book-id>/part{1..4}/*.txt workspace into
 * Supabase as a clean, correctly-numbered book. Scoped to that one book:
 * only rows with this book_id are replaced (cascading to their versions,
 * comments and suggestion log). Everything else in albert_documents — other
 * books, the sandbox — is untouched. Git is the source of truth; this is
 * always git -> DB, never the reverse (see split-manuscript.mjs, and
 * `chapter.mjs pull` for the one sanctioned reverse step).
 *
 * Usage: node scripts/import-book.mjs --book-id <id> --title "<title>" [--confirm]
 * Without --confirm, dry run: parses everything, reports counts, writes nothing.
 * Add --dump <doc-id> to print one document's rendered HTML instead.
 *
 * Rendering (manuscript text -> editor HTML):
 *   CHAPTER N / Title            <h1>Chapter N: Title</h1>   (chapter.mjs and
 *                                suggest-chapter.mjs both key on this shape)
 *   blank-line paragraphs        <p>…</p>
 *   ---  ===  * * *              <hr>  (a scene break; consecutive ones collapse)
 *   *italic*                     <em>
 *   [bracketed note]             <mark data-query="1">[…]</mark> — Albert's
 *                                open-question convention; a note may span
 *                                several lines, and then becomes one block
 *   quote line + —Attribution    <blockquote> (an epigraph inside a chapter)
 *   ... and straight quotes      already smartened by split-manuscript.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";

for (const f of [".env.local", ".env"]) {
  const p = resolve(import.meta.dirname, "..", f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and a Supabase key in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.slice(2);
let bookId = null;
let bookTitle = null;
let confirm = false;
let dump = null; // --dump <doc-id>: print that document's rendered HTML and stop
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--book-id") bookId = args[++i];
  else if (args[i] === "--title") bookTitle = args[++i];
  else if (args[i] === "--confirm") confirm = true;
  else if (args[i] === "--dump") dump = args[++i];
}
if (!bookId || !bookTitle) {
  console.error('Usage: node scripts/import-book.mjs --book-id <id> --title "<title>" [--confirm]');
  process.exit(1);
}

// ---- text -> HTML ----------------------------------------------------------

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SCENE_BREAK = /^\s*(?:[-=_*]\s*){3,}$/;
const ATTRIBUTION = /^[—–]\s*\S/;

function inlineProse(text) {
  return escapeHtml(text).replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

/** Positions of every `[` that never finds its `]` before the chapter ends.
 *  Two chapters have one — a bracket typed mid-sentence and never closed —
 *  and without this a single stray `[` would turn the rest of the chapter
 *  into one giant note. */
function unmatchedOpens(body) {
  const stack = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "[") stack.push(i);
    else if (body[i] === "]") stack.pop();
  }
  return new Set(stack);
}

/**
 * Chapter body -> blocks. A block is "hr" or a list of segments
 * [{ text, note }], one paragraph. Blank lines separate paragraphs. A single
 * newline inside prose is also a paragraph break (the author starting a new
 * paragraph without a blank line), except a —attribution line, which stays
 * with the quote above it. Inside a [note] a single newline is just a space,
 * a blank line a new note paragraph, so a multi-paragraph fact-check note
 * comes out as consecutive marked paragraphs rather than one wall of text.
 */
function toBlocks(body) {
  const literal = unmatchedOpens(body);
  const blocks = [];
  let para = []; // segments of the paragraph being built
  let depth = 0;
  const flush = () => {
    if (para.some((s) => s.text.trim())) blocks.push(para);
    para = [];
  };
  const push = (text, note) => {
    const last = para[para.length - 1];
    if (last && last.note === note) last.text += text;
    else para.push({ text, note });
  };

  const lines = body.split("\n");
  let offset = 0;
  for (const raw of lines) {
    const lineStart = offset;
    offset += raw.length + 1;
    const line = raw.trim();

    if (!line) { flush(); continue; }
    if (depth === 0 && SCENE_BREAK.test(line)) { flush(); blocks.push("hr"); continue; }

    if (para.length) {
      if (depth > 0) push(" ", true);
      else if (ATTRIBUTION.test(line)) push("\n", false);
      else flush();
    }

    const from = raw.indexOf(line);
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "[" && !literal.has(lineStart + from + i)) {
        depth++;
        push(ch, true);
      } else if (ch === "]" && depth > 0) {
        push(ch, true);
        depth--;
      } else {
        push(ch, depth > 0);
      }
    }
  }
  flush();
  return blocks;
}

function renderSegments(segs) {
  return segs
    .map((s) => (s.note ? `<mark data-query="1">${inlineProse(s.text)}</mark>` : inlineProse(s.text)))
    .join("");
}

function bodyToHtml(body) {
  const out = [];
  for (const b of toBlocks(body)) {
    if (b === "hr") {
      if (out[out.length - 1] !== "<hr>") out.push("<hr>");
      continue;
    }
    // A quote with its —attribution on the next line is an epigraph.
    const joined = b.map((s) => s.text).join("");
    if (!b.some((s) => s.note) && joined.includes("\n")) {
      const ps = joined.split("\n").map((l) => `<p>${inlineProse(l.trim())}</p>`).join("");
      out.push(`<blockquote>${ps}</blockquote>`);
      continue;
    }
    out.push(`<p>${renderSegments(b).trim()}</p>`);
  }
  // A chapter never opens or closes on a scene break.
  while (out[0] === "<hr>") out.shift();
  while (out[out.length - 1] === "<hr>") out.pop();
  return out.join("\n");
}

function openerToHtml(epigraphLines) {
  if (!epigraphLines.length) return "";
  const ps = epigraphLines.map((l) => `<p>${renderSegments(toBlocks(l).flat())}</p>`).join("");
  return `<blockquote>${ps}</blockquote>`;
}

// ---- read the workspace -----------------------------------------------------

const manuscriptDir = resolve(import.meta.dirname, "..", "manuscripts", bookId);
if (!existsSync(manuscriptDir)) {
  console.error(`No manuscripts/${bookId}/ — run split-manuscript.mjs --book ${bookId} first.`);
  process.exit(1);
}
const documents = [];

for (const part of [1, 2, 3, 4]) {
  const dir = resolve(manuscriptDir, `part${part}`);
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).sort();

  const openerFile = files.find((f) => f.startsWith("00-part-opener"));
  if (openerFile) {
    const lines = readFileSync(resolve(dir, openerFile), "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    documents.push({
      id: `${bookId}-part-${part}`,
      title: lines[0],
      content: openerToHtml(lines.slice(1)),
      chapter_number: null,
      part_number: part,
    });
  }

  for (const f of files.filter((f) => f.startsWith("ch"))) {
    const raw = readFileSync(resolve(dir, f), "utf8");
    const m = raw.match(/^CHAPTER (\d+)\n(.+)\n\n([\s\S]*)$/);
    if (!m) throw new Error(`Couldn't parse ${f}`);
    const [, num, title, body] = m;
    const n = parseInt(num, 10);
    documents.push({
      id: `${bookId}-ch-${String(n).padStart(2, "0")}`,
      title: `Chapter ${n}: ${title.trim()}`,
      content: `<h1>Chapter ${n}: ${title.trim()}</h1>\n${bodyToHtml(body)}`,
      chapter_number: n,
      part_number: part,
    });
  }
}

if (dump) {
  const d = documents.find((d) => d.id === dump);
  if (!d) { console.error(`No document ${dump}`); process.exit(1); }
  console.log(d.content);
  process.exit(0);
}

const words = (html) => html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
for (const d of documents) {
  const c = d.content;
  const n = (re) => (c.match(re) || []).length;
  console.log(
    `  ${d.id.padEnd(30)} ${String(words(c)).padStart(6)} w  ${String(n(/<p\b/g)).padStart(3)} ¶  ` +
      `${String(n(/<hr>/g)).padStart(2)} breaks  ${String(n(/data-query/g)).padStart(2)} notes  ${d.title}`
  );
}
const chapters = documents.filter((d) => d.chapter_number != null);
console.log(
  `\nParsed ${documents.length} documents (${chapters.length} chapters, ${documents.length - chapters.length} part openers), ` +
    `~${documents.reduce((s, d) => s + words(d.content), 0).toLocaleString()} words.`
);

if (!confirm) {
  console.log(`\nDry run — no writes made. Re-run with --confirm to replace book "${bookId}".`);
  process.exit(0);
}

// ---- write, scoped to this book ------------------------------------------

const { count: existing } = await supabase
  .from("albert_documents")
  .select("*", { count: "exact", head: true })
  .eq("book_id", bookId);
if (existing) {
  console.log(`\nDeleting ${existing} existing documents in book "${bookId}" (other books untouched)...`);
  const { error } = await supabase.from("albert_documents").delete().eq("book_id", bookId);
  if (error) {
    console.error("Delete failed:", error.message);
    process.exit(1);
  }
}

const { error: bookError } = await supabase
  .from("albert_books")
  .upsert({ id: bookId, title: bookTitle }, { onConflict: "id" });
if (bookError) {
  console.error("Book upsert failed:", bookError.message);
  process.exit(1);
}

const rows = documents.map((d) => ({ ...d, book_id: bookId }));
const { data: inserted, error: insertError } = await supabase.from("albert_documents").insert(rows).select("id");
if (insertError) {
  console.error("Insert failed:", insertError.message);
  process.exit(1);
}
console.log(`Inserted ${inserted.length} documents into "${bookTitle}" (${bookId}).`);
console.log(`Open: https://albert-book.vercel.app/b/${bookId}`);
