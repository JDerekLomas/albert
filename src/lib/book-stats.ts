import { Document } from "@/lib/supabase";

/**
 * Everything the book map can know without asking a model anything.
 *
 * All of this is sitting in the HTML already — length, open questions, pending
 * suggestions, how much of a chapter is dialogue — and none of it was surfaced
 * anywhere. It is free, instant, and never stale, which makes it the right
 * spine for the view; the model's chapter verdict hangs off it as one more
 * column, and the page is useful even when no verdict has ever been computed.
 */

export type ChapterStats = {
  doc: Document;
  words: number;
  paragraphs: number;
  /** Bracketed [notes to self] — the author's own to-do list, already a
   *  convention in the manuscript (rendered as <mark data-query>). */
  queries: number;
  /** Distinct pending suggestion ids awaiting a human decision. */
  pendingSuggestions: number;
  /** Share of paragraphs containing direct speech. A memoir that has gone
   *  quiet — all summary, no scene — shows up here before anywhere else. */
  dialogueShare: number;
  sceneBreaks: number;
  longestParagraph: number;
};

const WORDS_PER_PAGE = 250;
const WORDS_PER_MINUTE = 250;

function textOf(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(html: string) {
  const t = textOf(html || "");
  return t ? t.split(/\s+/).length : 0;
}

export function chapterStats(doc: Document): ChapterStats {
  const html = doc.content || "";
  const paras = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => textOf(m[1]));
  const real = paras.filter(Boolean);

  // Suggestion marks are counted by distinct data-sid: one proposed change is
  // several spans, and counting spans would triple the number a reviewer sees.
  const sids = new Set<string>();
  for (const tag of html.match(/<span\b[^>]*>/g) || []) {
    if (!/data-suggest="(ins|del)"/.test(tag)) continue;
    sids.add(tag.match(/data-sid="([^"]+)"/)?.[1] ?? "unknown");
  }

  const withSpeech = real.filter((p) => /["“”]/.test(p)).length;

  return {
    doc,
    words: countWords(html),
    paragraphs: real.length,
    queries: (html.match(/data-query="1"/g) || []).length,
    pendingSuggestions: sids.size,
    dialogueShare: real.length ? withSpeech / real.length : 0,
    sceneBreaks: (html.match(/<hr\b/g) || []).length,
    longestParagraph: real.reduce((max, p) => Math.max(max, p.split(/\s+/).length), 0),
  };
}

export function pages(words: number) {
  return Math.max(1, Math.round(words / WORDS_PER_PAGE));
}

export function readingMinutes(words: number) {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
