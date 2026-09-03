#!/usr/bin/env node
/**
 * Propose AI edits to a chapter as reviewable suggestions — never overwrites
 * the live text. Diffs a revised plain-text draft against the chapter's
 * current HTML in Supabase, wraps the changed spans in suggestion marks
 * (paragraph-paired, then word-level within each changed paragraph), snapshots
 * the pre-suggestion state as a version, and writes the suggestion-annotated
 * HTML back as the document's content. Albert/Derek review and accept/reject
 * each change in the web editor's Suggestions panel — nothing is final until
 * they click Accept.
 *
 * Usage:
 *   node scripts/suggest-chapter.mjs --chapter 14 revised-ch14.txt --reason "continuity pass"
 *   node scripts/suggest-chapter.mjs --doc <document-id> revised.txt --reason "tightened Cambridge section"
 *
 * Revised text format: plain text, paragraphs separated by one or more blank
 * lines — same convention as manuscript/part3/*.txt, including its leading
 * "CHAPTER N" / title lines (stripped automatically — the title lives in the
 * document's `title` column, not its body) and "---" scene-break markers
 * (matched against the stored document's <hr> blocks, not treated as prose).
 * Any paragraph copied unchanged from the current chapter is left alone
 * (matched by exact text — italic/bold markdown and em/strong tags are
 * normalized first, so formatting alone doesn't look like a change); only
 * genuinely changed paragraphs generate suggestions.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { diff_match_patch } from "diff-match-patch";
import { nanoid } from "nanoid";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- CLI args ----
const args = process.argv.slice(2);
let chapterNum = null;
let docId = null;
let filePath = null;
let reason = null;
let author = "claude";

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--chapter") chapterNum = parseInt(args[++i], 10);
  else if (a === "--doc") docId = args[++i];
  else if (a === "--reason") reason = args[++i];
  else if (a === "--author") author = args[++i];
  else if (!filePath) filePath = a;
}

if ((!chapterNum && !docId) || !filePath) {
  console.error(
    "Usage: node scripts/suggest-chapter.mjs --chapter <N> <revised.txt> [--reason \"...\"]\n" +
      "   or: node scripts/suggest-chapter.mjs --doc <document-id> <revised.txt> [--reason \"...\"]"
  );
  process.exit(1);
}

// ---- generic token-diff (works for both block-level and word-level) ----
// Encodes each token as one opaque character so diff-match-patch's char-level
// Myers diff gives us equal/insert/delete runs at token granularity.
function tokenDiff(oldTokens, newTokens) {
  const tokenToChar = new Map();
  const chars = [];
  function encode(tokens) {
    let s = "";
    for (const t of tokens) {
      let c = tokenToChar.get(t);
      if (c === undefined) {
        c = String.fromCharCode(chars.length + 0x100);
        tokenToChar.set(t, c);
        chars.push(t);
      }
      s += c;
    }
    return s;
  }
  const oldEnc = encode(oldTokens);
  const newEnc = encode(newTokens);
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(oldEnc, newEnc);
  const runs = [];
  for (const [op, encStr] of diffs) {
    if (!encStr) continue;
    const tokens = [...encStr].map((c) => chars[c.charCodeAt(0) - 0x100]);
    runs.push({
      type: op === 0 ? "equal" : op === -1 ? "delete" : "insert",
      items: tokens,
    });
  }
  return runs;
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** <em>/<i> -> *x*, <strong>/<b> -> **x** — so stored HTML and a plain-text
 * markdown-ish draft compare equal when only the tag/marker form differs. */
function htmlEmphasisToMarkdown(html) {
  return html
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function wordTokens(text) {
  return text.match(/\S+|\s+/g) || [];
}

function suggestionSpan(type, text, sid, reason, author) {
  const reasonAttr = reason ? ` data-reason="${escapeAttr(reason)}"` : "";
  return `<span data-suggest="${type}" data-sid="${sid}" data-author="${escapeAttr(
    author
  )}"${reasonAttr}>${escapeHtml(text)}</span>`;
}

/** Word-level diff between two paragraph plain-texts, rendered as suggestion-marked HTML. */
function wordDiffHtml(oldText, newText, sid, reason, author) {
  const runs = tokenDiff(wordTokens(oldText), wordTokens(newText));
  let html = "";
  for (const run of runs) {
    const text = run.items.join("");
    if (!text) continue;
    if (run.type === "equal") html += escapeHtml(text);
    else if (run.type === "delete")
      html += suggestionSpan("del", text, sid, reason, author);
    else html += suggestionSpan("ins", text, sid, reason, author);
  }
  return html;
}

// ---- split the current document's HTML into top-level blocks ----
// Real chapters embed a heading (<h1>Chapter N: Title</h1>) and Albert's
// yellow/purple query blocks (<div style="background:#fef3c7...">...</div>,
// with nested <p>/<ul> inside) alongside plain <p> prose. Only <p> blocks are
// diffed against the revised text; everything else is a fixed anchor that
// passes through untouched, at its original position.
function splitBlocks(html) {
  const re = /<(p|h[1-4]|blockquote|ul|ol|div)\b[^>]*>[\s\S]*?<\/\1>|<hr\s*\/?>/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(html))) {
    const raw = m[0];
    const tag = (m[1] || "hr").toLowerCase();
    const text = normalize(htmlEmphasisToMarkdown(raw).replace(/<[^>]+>/g, ""));
    blocks.push({ tag, html: raw, text });
  }
  return blocks;
}

async function main() {
  let doc;
  if (docId) {
    const { data, error } = await supabase
      .from("albert_documents")
      .select("*")
      .eq("id", docId)
      .single();
    if (error || !data) {
      console.error("Document not found:", error?.message);
      process.exit(1);
    }
    doc = data;
  } else {
    const { data, error } = await supabase
      .from("albert_documents")
      .select("*")
      .eq("chapter_number", chapterNum)
      .single();
    if (error || !data) {
      console.error(`Chapter ${chapterNum} not found:`, error?.message);
      process.exit(1);
    }
    doc = data;
  }

  const currentHtml = doc.content || "";
  let revisedText = readFileSync(filePath, "utf8");
  // Drop a leading "CHAPTER N" + title pair (manuscript/part3/*.txt convention)
  // — that's stored in the document's title column, not its body.
  revisedText = revisedText.replace(/^\s*CHAPTER\s+\d+\s*\n[^\n]*\n/i, "");
  const newParagraphs = revisedText
    .split(/\n\s*\n+/)
    .map((p) => normalize(p))
    .filter((p) => p && p !== "---"); // scene breaks are structural, not prose

  const oldBlocks = splitBlocks(currentHtml).map((b, origIndex) => ({
    ...b,
    origIndex,
  }));
  const oldPBlocks = oldBlocks.filter((b) => b.tag === "p");
  const oldPTexts = oldPBlocks.map((b) => b.text);

  const runs = tokenDiff(oldPTexts, newParagraphs);

  // Consume old <p> blocks in order for equal/delete/paired-replace runs
  // (anchoredHtml keyed by their original position in oldBlocks, so headings,
  // query-divs, and lists reinsert untouched at the right spot). Pure
  // insertions have no old anchor, so they're queued to appear right after
  // whichever old block was most recently matched (-1 = doc start).
  let pPointer = 0;
  let lastAnchoredOrigIndex = -1;
  const anchoredHtml = new Map();
  const floatingAfter = new Map();
  let suggestionCount = 0;

  function pushFloating(html) {
    const key = lastAnchoredOrigIndex;
    if (!floatingAfter.has(key)) floatingAfter.set(key, []);
    floatingAfter.get(key).push(html);
  }

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];

    if (run.type === "equal") {
      for (let k = 0; k < run.items.length; k++) {
        const block = oldPBlocks[pPointer++];
        anchoredHtml.set(block.origIndex, block.html); // reuse verbatim — keeps inline formatting
        lastAnchoredOrigIndex = block.origIndex;
      }
      continue;
    }

    if (run.type === "delete") {
      const next = runs[i + 1];
      if (next && next.type === "insert" && next.items.length === run.items.length) {
        // Paired paragraph edits — word-level diff, one suggestion per pair.
        for (let j = 0; j < run.items.length; j++) {
          const block = oldPBlocks[pPointer++];
          const sid = nanoid(8);
          suggestionCount++;
          const inner = wordDiffHtml(run.items[j], next.items[j], sid, reason, author);
          anchoredHtml.set(block.origIndex, `<p>${inner}</p>`);
          lastAnchoredOrigIndex = block.origIndex;
        }
        i++; // consume the paired insert run
        continue;
      }
      // Unpaired deletions — whole-paragraph removal suggestions.
      for (const text of run.items) {
        const block = oldPBlocks[pPointer++];
        const sid = nanoid(8);
        suggestionCount++;
        anchoredHtml.set(
          block.origIndex,
          `<p>${suggestionSpan("del", text, sid, reason, author)}</p>`
        );
        lastAnchoredOrigIndex = block.origIndex;
      }
      continue;
    }

    if (run.type === "insert") {
      // Unpaired insertions — whole-paragraph addition suggestions.
      for (const text of run.items) {
        const sid = nanoid(8);
        suggestionCount++;
        pushFloating(`<p>${suggestionSpan("ins", text, sid, reason, author)}</p>`);
      }
    }
  }

  if (suggestionCount === 0) {
    console.log("No differences found — nothing to suggest.");
    return;
  }

  const outputBlocks = [...(floatingAfter.get(-1) || [])];
  for (const block of oldBlocks) {
    outputBlocks.push(
      block.tag === "p" ? anchoredHtml.get(block.origIndex) ?? block.html : block.html
    );
    outputBlocks.push(...(floatingAfter.get(block.origIndex) || []));
  }

  const newHtml = outputBlocks.join("\n");

  // Snapshot the pre-suggestion state before touching the live document.
  await supabase.from("albert_versions").insert({
    document_id: doc.id,
    content: currentHtml,
    title: doc.title,
    message: `Before AI suggestions${reason ? `: ${reason}` : ""}`,
  });

  const { error: updateError } = await supabase
    .from("albert_documents")
    .update({ content: newHtml, updated_at: new Date().toISOString() })
    .eq("id", doc.id);

  if (updateError) {
    console.error("Failed to write suggestions:", updateError.message);
    process.exit(1);
  }

  console.log(
    `${suggestionCount} suggestion${suggestionCount === 1 ? "" : "s"} proposed on "${doc.title}" (${doc.id}).`
  );
  console.log("Review them in the web editor's Suggestions panel.");
}

main();
