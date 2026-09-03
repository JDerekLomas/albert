#!/usr/bin/env node
/**
 * Split the four PART_*.txt drafts (Albert's raw AirDrop exports) into the
 * text-in-git workspace under manuscript/, one file per chapter plus a part
 * opener where a part has a title/epigraph — same convention as the existing
 * manuscript/part3/*.txt files. This is the source-of-truth conversion step:
 * everything in Supabase is imported FROM these files (see import-book.mjs),
 * never the other way around, so corrections happen in git first.
 *
 * Usage: node scripts/split-manuscript.mjs
 * Reads from ~/Downloads/PART_I.txt, PART_II.txt, "PART_III 2.txt", PART_IV.txt.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

const SOURCES = [
  { file: "PART_I.txt", part: 1 },
  { file: "PART_II.txt", part: 2 },
  { file: "PART_III 2.txt", part: 3 },
  { file: "PART_IV.txt", part: 4 },
];

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePart(raw) {
  const chapterSplit = raw.split(/\n(?=CHAPTER \d+\n)/);
  const preamble = raw.startsWith("CHAPTER ") ? "" : chapterSplit.shift().trim();

  let partTitle = null;
  let epigraph = null;
  if (preamble) {
    const lines = preamble.split("\n").map((l) => l.trim()).filter(Boolean);
    partTitle = lines[0];
    if (lines.length > 1) epigraph = lines.slice(1).join("\n");
  }

  const chapters = chapterSplit.map((block) => {
    const m = block.match(/^CHAPTER (\d+)\n(.+)\n\n([\s\S]*)$/);
    if (!m) throw new Error(`Couldn't parse chapter block:\n${block.slice(0, 100)}`);
    return { number: parseInt(m[1], 10), title: m[2].trim(), body: m[3].trim() };
  });

  return { partTitle, epigraph, chapters };
}

for (const { file, part } of SOURCES) {
  const path = resolve(homedir(), "Downloads", file);
  const raw = readFileSync(path, "utf8");
  const { partTitle, epigraph, chapters } = parsePart(raw);

  const dir = resolve(import.meta.dirname, "..", "manuscript", `part${part}`);
  mkdirSync(dir, { recursive: true });

  if (partTitle) {
    const opener = epigraph ? `${partTitle}\n\n${epigraph}\n` : `${partTitle}\n`;
    writeFileSync(resolve(dir, "00-part-opener.txt"), opener);
  }

  for (const ch of chapters) {
    const slug = slugify(ch.title);
    const filename = `ch${String(ch.number).padStart(2, "0")}-${slug}.txt`;
    writeFileSync(resolve(dir, filename), `CHAPTER ${ch.number}\n${ch.title}\n\n${ch.body}\n`);
  }

  console.log(
    `part${part}: ${chapters.length} chapters (${chapters[0].number}–${chapters[chapters.length - 1].number})${
      partTitle ? ` — "${partTitle}"` : ""
    }`
  );
}
