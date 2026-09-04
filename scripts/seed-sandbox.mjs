#!/usr/bin/env node
/**
 * Seed the synthetic test book into Supabase, so the editorial tooling can be
 * exercised against prose whose flaws are known in advance. See
 * sandbox/the-salt-line/GROUND-TRUTH.md for the answer key.
 *
 *   node scripts/seed-sandbox.mjs            # dry run
 *   node scripts/seed-sandbox.mjs --confirm  # write
 *   node scripts/seed-sandbox.mjs --reset --confirm   # back to pristine fixture
 *
 * Deliberately NOT import-book.mjs: that one deletes every row in
 * albert_documents regardless of book, which was safe when there was one book
 * and would destroy the memoir now. Everything here is scoped to BOOK_ID, and
 * the delete is `.eq("book_id", BOOK_ID)` — never a bare table clear.
 *
 * Uses the anon key on purpose. RLS on albert_* is permissive enough, and this
 * is a toy book; there is no reason to reach for the service role.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
for (const f of [".env.local", ".env"]) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}

const BOOK_ID = "sandbox-salt-line";
const BOOK_TITLE = "The Salt Line — test fixture (not a real book)";
const SRC = join(ROOT, "sandbox", "the-salt-line");

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const reset = args.includes("--reset");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Same conventions as the memoir importer: *italic*, [bracketed query], --- scene break. */
function bodyToHtml(body) {
  return body
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      if (b === "---") return "<hr>";
      let html = escapeHtml(b);
      html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      html = html.replace(/\[([^\]]+)\]/g, '<mark data-query="1">[$1]</mark>');
      return `<p>${html}</p>`;
    })
    .join("\n");
}

const documents = [];
for (const f of readdirSync(SRC).filter((f) => f.startsWith("ch")).sort()) {
  const raw = readFileSync(join(SRC, f), "utf8");
  const m = raw.match(/^CHAPTER (\d+)\n(.+)\n\n([\s\S]*)$/);
  if (!m) throw new Error(`Couldn't parse ${f}`);
  const [, num, title, body] = m;
  const n = parseInt(num, 10);
  documents.push({
    id: `${BOOK_ID}-ch-${String(n).padStart(2, "0")}`,
    book_id: BOOK_ID,
    title: `Chapter ${n}: ${title.trim()}`,
    content: `<h1>Chapter ${n}: ${title.trim()}</h1>\n${bodyToHtml(body)}`,
    chapter_number: n,
    part_number: 1,
  });
}

for (const d of documents) {
  const paras = (d.content.match(/<p\b/g) || []).length;
  const words = d.content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  console.log(`  ${d.id}  ${String(paras).padStart(2)} ¶  ${String(words).padStart(4)} words  ${d.title}`);
}

if (!confirm) {
  console.log(`\nDry run — nothing written. Re-run with --confirm.`);
  console.log(`Would ${reset ? "delete and rebuild" : "upsert"} ${documents.length} documents in book "${BOOK_ID}".`);
  process.exit(0);
}

const { error: bookErr } = await supabase
  .from("albert_books")
  .upsert({ id: BOOK_ID, title: BOOK_TITLE }, { onConflict: "id" });
if (bookErr) {
  console.error("Book upsert failed:", bookErr.message);
  process.exit(1);
}

if (reset) {
  // Scoped to this book. Cascades to its versions/comments/suggestion log.
  const { error } = await supabase.from("albert_documents").delete().eq("book_id", BOOK_ID);
  if (error) {
    console.error("Reset failed:", error.message);
    process.exit(1);
  }
  console.log(`\nCleared book "${BOOK_ID}".`);
}

const { error: upErr } = await supabase
  .from("albert_documents")
  .upsert(documents, { onConflict: "id" });
if (upErr) {
  console.error("Upsert failed:", upErr.message);
  process.exit(1);
}

console.log(`\nSeeded ${documents.length} chapters into "${BOOK_TITLE}".`);
console.log(`Answer key: sandbox/the-salt-line/GROUND-TRUTH.md`);
console.log(`Open: https://albert-book.vercel.app/b/${BOOK_ID}`);
