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
// Service role isn't required — RLS on every albert_* table already allows
// full read/write, so the anon key (the one safe to hand to a guest AI
// session — see CLAUDE.md) works identically for this script.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)");
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

/** Inverse of htmlEmphasisToMarkdown. Diffing happens on markdown-normalized
 * text, so every rendered span has to convert the markers back — otherwise a
 * paragraph that merely *contains* italics loses them to literal asterisks the
 * moment any other part of it is edited. Only balanced pairs within this one
 * span convert; a marker split across a del/ins boundary stays literal rather
 * than emitting an unclosed tag. */
function markdownEmphasisToHtml(escaped) {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** Render prose text (markdown-normalized) as safe HTML with emphasis intact. */
function renderProse(s) {
  return markdownEmphasisToHtml(escapeHtml(s));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/** Words, whitespace runs, and whole emphasis runs. An emphasis run
 * (`*like this*`, trailing punctuation included) is one atomic token so a
 * word-level diff can't split it across a del/ins boundary and strand an
 * unbalanced marker, which renderProse would then have to leave literal. */
function wordTokens(text) {
  return text.match(/\*\*[^*]+\*\*\S*|\*[^*]+\*\S*|\S+|\s+/g) || [];
}

function suggestionSpan(type, text, sid, reason, author) {
  const reasonAttr = reason ? ` data-reason="${escapeAttr(reason)}"` : "";
  return `<span data-suggest="${type}" data-sid="${sid}" data-author="${escapeAttr(
    author
  )}"${reasonAttr}>${renderProse(text)}</span>`;
}

/**
 * Split into sentences by scanning for boundaries rather than matching whole
 * sentences, so the pieces always reassemble into the input. A terminal `.!?`
 * run may be followed by closing marks (`" ' ” ’ * ) ]`) before the boundary —
 * dialogue ending in `."` is the common case. The previous match-based regex
 * required whitespace immediately after the punctuation and, when it did not
 * find any, silently DROPPED everything up to the next place it could match:
 * `He said, "Stop."` reduced to a bare `"`.
 */
function splitSentences(text) {
  const out = [];
  const boundary = /[.!?]+["'”’*)\]]*(?=\s|$)/g;
  let start = 0;
  let m;
  while ((m = boundary.exec(text))) {
    const end = m.index + m[0].length;
    const piece = text.slice(start, end).trim();
    if (piece) out.push(piece);
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.length ? out : [text];
}

/** Fraction of words two sentences share — cheap proxy for "same sentence, lightly edited" vs. "rewritten". */
function wordOverlap(a, b) {
  const setA = new Set(wordTokens(a).map((w) => w.trim().toLowerCase()).filter(Boolean));
  const setB = new Set(wordTokens(b).map((w) => w.trim().toLowerCase()).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared++;
  return shared / Math.max(setA.size, setB.size);
}

/**
 * Align two lists of blocks (paragraphs, or sentences) by similarity instead of
 * by position, and return ops in document order.
 *
 * This exists because requiring `deleteRun.length === insertRun.length` — the
 * old test — fails the moment a revision *adds* blocks next to ones it edits.
 * Three edited paragraphs meeting five new ones would not pair at all, so each
 * edited paragraph was deleted whole and re-inserted whole: a one-word change
 * rendered as "delete 93 words, insert 93 words". Nobody can review that.
 *
 * Monotonic (no crossing) alignment maximising total overlap, so an edited
 * block still pairs with its own descendant across inserted neighbours, and a
 * genuinely new block stays a clean insertion.
 */
function alignByOverlap(oldItems, newItems, threshold = 0.35) {
  const n = oldItems.length;
  const m = newItems.length;
  const sim = oldItems.map((o) => newItems.map((x) => wordOverlap(o, x)));
  const scoreOf = (i, j) => (sim[i - 1][j - 1] >= threshold ? sim[i - 1][j - 1] : -Infinity);

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const paired = scoreOf(i, j) === -Infinity ? -Infinity : dp[i - 1][j - 1] + scoreOf(i, j);
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], paired);
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const paired = scoreOf(i, j) === -Infinity ? -Infinity : dp[i - 1][j - 1] + scoreOf(i, j);
    if (dp[i][j] === paired) {
      ops.push({ type: "pair", oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j]) {
      ops.push({ type: "del", oldIdx: --i });
    } else {
      ops.push({ type: "ins", newIdx: --j });
    }
  }
  while (i > 0) ops.push({ type: "del", oldIdx: --i });
  while (j > 0) ops.push({ type: "ins", newIdx: --j });
  return ops.reverse();
}

function fineWordDiffSpans(oldText, newText, sid, reason, author) {
  const runs = tokenDiff(wordTokens(oldText), wordTokens(newText));
  let html = "";
  for (const run of runs) {
    const text = run.items.join("");
    if (!text) continue;
    if (run.type === "equal") html += renderProse(text);
    else if (run.type === "delete") html += suggestionSpan("del", text, sid, reason, author);
    else html += suggestionSpan("ins", text, sid, reason, author);
  }
  return html;
}

/**
 * Word-level diff between two paragraph plain-texts, rendered as
 * suggestion-marked HTML — but tiered by sentence first, the same
 * equal/delete/insert alignment already used one level up for paragraphs
 * (reuses tokenDiff directly, with whole sentences as the tokens). A
 * lightly-edited sentence (one word swapped) gets a clean word-level diff.
 * A sentence rewritten from scratch shares almost no words with its old
 * version, so a pure word-level diff on it produces unreadable confetti —
 * dozens of tiny alternating del/ins pairs with no coherent shape — so a
 * paired rewrite (delete-run and insert-run of equal length, sentence
 * counts unchanged) gets one clean del + ins per sentence pair instead of
 * word-level diffing when the two share fewer than half their words.
 * Restructured spans (sentence count itself changes — one sentence split
 * into two, etc.) can't be paired positionally at all; those collapse to
 * one del + ins per unpaired run, so at least the untouched sentences
 * around them stay untouched instead of getting swept into the same block.
 */
function wordDiffHtml(oldText, newText, sid, reason, author) {
  const oldSentences = splitSentences(oldText);
  const newSentences = splitSentences(newText);
  const runs = tokenDiff(oldSentences, newSentences);

  let html = "";
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];

    if (run.type === "equal") {
      html += run.items.map((s) => renderProse(s)).join(" ") + " ";
      continue;
    }

    if (run.type === "delete") {
      const next = runs[i + 1];
      if (next && next.type === "insert") {
        // Same alignment as at paragraph level: a lightly-edited sentence keeps
        // a word-level diff even when a sentence was split or added next to it.
        for (const op of alignByOverlap(run.items, next.items)) {
          if (op.type === "pair") {
            const a = run.items[op.oldIdx];
            const b = next.items[op.newIdx];
            html +=
              (wordOverlap(a, b) >= 0.5
                ? fineWordDiffSpans(a, b, sid, reason, author)
                : suggestionSpan("del", a, sid, reason, author) +
                  suggestionSpan("ins", b, sid, reason, author)) + " ";
          } else if (op.type === "del") {
            html += suggestionSpan("del", run.items[op.oldIdx], sid, reason, author) + " ";
          } else {
            html += suggestionSpan("ins", next.items[op.newIdx], sid, reason, author) + " ";
          }
        }
        i++; // consume the paired insert run
        continue;
      }
      html += suggestionSpan("del", run.items.join(" "), sid, reason, author) + " ";
      continue;
    }

    if (run.type === "insert") {
      html += suggestionSpan("ins", run.items.join(" "), sid, reason, author) + " ";
    }
  }
  return html.trim();
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

  // Refuse to stack a second pass on unresolved suggestions. splitBlocks()
  // strips tags to get each paragraph's text, so a pending del/ins pair reads
  // as both wordings run together ("Derek, my old best friend from college,
  // Derek had been...") — diffing a clean draft against that yields nonsense
  // suggestions nested inside the existing ones. Attribute order varies
  // (the script writes data-suggest first, TipTap writes it after data-sid),
  // so match the attribute anywhere in the tag.
  const pendingSids = new Set(
    [...currentHtml.matchAll(/<span\b[^>]*\bdata-suggest="(?:ins|del)"[^>]*\bdata-sid="([^"]+)"/g)].map((m) => m[1])
  );
  for (const m of currentHtml.matchAll(/<span\b[^>]*\bdata-sid="([^"]+)"[^>]*\bdata-suggest="(?:ins|del)"/g)) {
    pendingSids.add(m[1]);
  }
  if (pendingSids.size > 0) {
    console.error(
      `"${doc.title}" already has ${pendingSids.size} unresolved suggestion(s).\n` +
        "Accept or reject them in the editor's Suggestions panel first — a second\n" +
        "pass would diff against the old and new wording run together and produce\n" +
        "garbage. (Reject All in the panel restores the chapter untouched.)"
    );
    process.exit(1);
  }

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
  // Empty <p></p> can survive a rejected whole-paragraph insertion. Diffing
  // against them produces empty del spans, so ignore them as prose anchors.
  const oldPBlocks = oldBlocks.filter((b) => b.tag === "p" && b.text);
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
      if (next && next.type === "insert") {
        // Align the two runs by similarity — an edited paragraph pairs with its
        // own descendant (word-level diff) even when new paragraphs were added
        // beside it; only genuinely new/removed paragraphs become whole blocks.
        for (const op of alignByOverlap(run.items, next.items)) {
          const sid = nanoid(8);
          suggestionCount++;
          if (op.type === "ins") {
            pushFloating(
              `<p>${suggestionSpan("ins", next.items[op.newIdx], sid, reason, author)}</p>`
            );
            continue;
          }
          const block = oldPBlocks[pPointer++];
          anchoredHtml.set(
            block.origIndex,
            op.type === "pair"
              ? `<p>${wordDiffHtml(run.items[op.oldIdx], next.items[op.newIdx], sid, reason, author)}</p>`
              : `<p>${suggestionSpan("del", run.items[op.oldIdx], sid, reason, author)}</p>`
          );
          lastAnchoredOrigIndex = block.origIndex;
        }
        i++; // consume the paired insert run
        continue;
      }
      // Deletions with no insert run following — whole-paragraph removals.
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
