#!/usr/bin/env node
/**
 * Import manuscript text files into Supabase as individual chapters.
 * Usage: node scripts/import-manuscript.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FILES = [
  resolve(process.env.HOME, "Downloads/block1_chapters_1-7.txt"),
  resolve(process.env.HOME, "Downloads/block2_chapters_8-12.txt"),
  resolve(process.env.HOME, "Downloads/block3_chapters_13-16 copy.txt"),
];

function parseChapters(text) {
  const chapters = [];
  // Split on "CHAPTER N" at the start of a line
  const parts = text.split(/^(?=CHAPTER \d+)/m);

  for (const part of parts) {
    const match = part.match(/^CHAPTER (\d+)\s*\n(.+)\n/);
    if (!match) continue;

    const num = parseInt(match[1], 10);
    const subtitle = match[2].trim();
    // Get the body (everything after the title line, trimmed)
    let body = part.slice(match[0].length).trim();
    // Remove trailing --- separators
    body = body.replace(/\n---\s*$/, "").trim();

    chapters.push({ num, subtitle, body });
  }
  return chapters;
}

function textToHtml(text) {
  // Convert plain text to HTML paragraphs
  return text
    .split(/\n\n+/)
    .map((para) => {
      para = para.trim();
      if (!para) return "";
      // Preserve italic markers
      para = para.replace(/\*(.+?)\*/g, "<em>$1</em>");
      return `<p>${para.replace(/\n/g, "<br>")}</p>`;
    })
    .filter(Boolean)
    .join("");
}

async function main() {
  console.log("Reading manuscript files...");

  let allChapters = [];
  for (const file of FILES) {
    try {
      const text = readFileSync(file, "utf-8");
      const chapters = parseChapters(text);
      console.log(`  ${file.split("/").pop()}: ${chapters.length} chapters`);
      allChapters.push(...chapters);
    } catch (err) {
      console.error(`  Error reading ${file}:`, err.message);
    }
  }

  // Also add the epilogue (in block3 after chapter 16)
  try {
    const block3 = readFileSync(FILES[2], "utf-8");
    const epilogueMatch = block3.match(/\nEPILOGUE\s*\n([\s\S]+)$/);
    if (epilogueMatch) {
      allChapters.push({
        num: 17,
        subtitle: "Epilogue",
        body: epilogueMatch[1].trim(),
      });
      console.log("  Found epilogue");
    }
  } catch {}

  console.log(`\nTotal chapters: ${allChapters.length}`);

  // Delete existing chapter documents (not the planning docs)
  const chapterIds = allChapters.map((c) => `ch-${String(c.num).padStart(2, "0")}`);
  console.log("\nClearing existing chapter documents...");
  await supabase.from("albert_versions").delete().in("document_id", chapterIds);
  await supabase.from("albert_documents").delete().in("id", chapterIds);

  console.log("Inserting chapters...");
  for (const ch of allChapters) {
    const id = `ch-${String(ch.num).padStart(2, "0")}`;
    const title =
      ch.num <= 16
        ? `Chapter ${ch.num}: ${ch.subtitle}`
        : ch.subtitle;
    const htmlContent = `<h1>${title}</h1>${textToHtml(ch.body)}`;

    const { error } = await supabase.from("albert_documents").upsert({
      id,
      title,
      content: htmlContent,
      chapter_number: ch.num,
      book_id: "albert-memoir",
    });

    if (error) {
      console.error(`  Error inserting ch ${ch.num}:`, error.message);
    } else {
      console.log(`  Ch ${ch.num}: ${ch.subtitle} (${ch.body.length} chars)`);
    }

    // Create initial version snapshot
    const { error: vErr } = await supabase.from("albert_versions").insert({
      document_id: id,
      content: htmlContent,
      title,
      message: "Original manuscript import",
    });
    if (vErr) console.error(`  Version error ch ${ch.num}:`, vErr.message);
  }

  console.log("\nDone! Chapters are now in the editor.");
}

main().catch(console.error);
