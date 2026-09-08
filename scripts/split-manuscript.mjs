#!/usr/bin/env node
/**
 * Split Albert's four raw PART_*.txt drops into the text-in-git workspace
 * under manuscripts/<book-id>/, one file per chapter plus a 00-part-opener.txt
 * where a part has a title/epigraph. This is the source-of-truth conversion
 * step: everything in Supabase is imported FROM these files (import-book.mjs),
 * never the other way around, so corrections happen in git first.
 *
 * Usage:
 *   node scripts/split-manuscript.mjs --book <book-id> --files <part1.txt> <part2.txt> <part3.txt> <part4.txt>
 *
 * The four files are taken in part order. Each drop's shape:
 *
 *   PART II — THE FIRE            (optional part title)
 *   "quote…"                       (optional epigraph, one or more lines,
 *   —Attribution                   the last usually starting with an em dash)
 *
 *   CHAPTER 7
 *   The Breaking
 *
 *   prose…
 *
 * Two things the raw drops do that the split has to undo:
 *   - Part I's title page arrives *after* Chapter 1, which is a prologue. The
 *     part header is recognised wherever it appears, and lifted out of the
 *     chapter it lands in.
 *   - Everything is typed with straight quotes and three-dot ellipses. The
 *     git text gets book typography (“ ” ‘ ’ …) here, once, so the live
 *     chapter and the git file agree exactly and `chapter.mjs status` can
 *     tell real divergence from quote style.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { resolve } from "path";

const argv = process.argv.slice(2);
let bookId = null;
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--book") bookId = argv[++i];
  else if (argv[i] === "--files") {
    while (argv[i + 1] && !argv[i + 1].startsWith("--")) files.push(argv[++i]);
  }
}
if (!bookId || files.length === 0) {
  console.error("Usage: node scripts/split-manuscript.mjs --book <book-id> --files <part1> <part2> <part3> <part4>");
  process.exit(1);
}

const PART_HEADER = /^PART\s+([IVX]+|\d+)\s*[—–-]\s*.+$/;

function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Book typography: straight quotes -> curly, ... -> …, spaced hyphen dash -> em dash.
 *  Applied line by line, so an opening quote is one at line start or after
 *  whitespace / an opening bracket / a dash; everything else closes. */
export function smarten(line) {
  return line
    .replace(/\.\.\./g, "…")
    .replace(/ -- /g, " — ")
    .replace(/(^|[\s(\[{—–\-])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s(\[{—–\-])'/g, "$1‘")
    .replace(/'/g, "’");
}

function parsePart(raw) {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");

  // Locate the part header (anywhere) and every CHAPTER line.
  let partTitle = null;
  let epigraph = [];
  const headerAt = lines.findIndex((l) => PART_HEADER.test(l.trim()));
  if (headerAt !== -1) {
    partTitle = lines[headerAt].trim();
    // The epigraph is the run of non-blank lines that follows, up to the next
    // blank-then-CHAPTER (or a blank line followed by more prose).
    let i = headerAt + 1;
    while (i < lines.length && !lines[i].trim()) i++;
    while (i < lines.length && lines[i].trim() && !/^CHAPTER \d+$/.test(lines[i].trim())) {
      epigraph.push(lines[i].trim());
      i++;
    }
    lines.splice(headerAt, i - headerAt);
  }

  const chapters = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^CHAPTER (\d+)$/);
    if (m) {
      cur = { number: parseInt(m[1], 10), title: (lines[i + 1] || "").trim(), body: [] };
      chapters.push(cur);
      i++; // title line
      continue;
    }
    if (!cur) {
      if (lines[i].trim()) throw new Error(`Text before the first CHAPTER line: ${lines[i].slice(0, 80)}`);
      continue;
    }
    cur.body.push(lines[i]);
  }

  for (const ch of chapters) {
    ch.body = ch.body
      .map((l) => smarten(l.replace(/\s+$/, "")))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!ch.title) throw new Error(`Chapter ${ch.number} has no title line`);
  }

  return { partTitle, epigraph: epigraph.map(smarten), chapters };
}

const root = resolve(import.meta.dirname, "..", "manuscripts", bookId);
if (existsSync(root)) rmSync(root, { recursive: true });

files.forEach((file, idx) => {
  const part = idx + 1;
  const raw = readFileSync(resolve(file), "utf8");
  const { partTitle, epigraph, chapters } = parsePart(raw);

  const dir = resolve(root, `part${part}`);
  mkdirSync(dir, { recursive: true });

  if (partTitle) {
    const opener = epigraph.length ? `${partTitle}\n\n${epigraph.join("\n")}\n` : `${partTitle}\n`;
    writeFileSync(resolve(dir, "00-part-opener.txt"), opener);
  }

  for (const ch of chapters) {
    const filename = `ch${String(ch.number).padStart(2, "0")}-${slugify(ch.title)}.txt`;
    writeFileSync(resolve(dir, filename), `CHAPTER ${ch.number}\n${ch.title}\n\n${ch.body}\n`);
  }

  const nums = chapters.map((c) => c.number);
  const words = chapters.reduce((n, c) => n + c.body.split(/\s+/).filter(Boolean).length, 0);
  console.log(
    `part${part}: ${chapters.length} chapters (${nums.join(", ")}), ${words.toLocaleString()} words` +
      (partTitle ? ` — "${partTitle}"` : " — no part title in this file")
  );
});
console.log(`\nWrote manuscripts/${bookId}/`);
