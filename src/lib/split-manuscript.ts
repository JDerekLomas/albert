/**
 * Turn an uploaded manuscript into chapters, ready to insert as
 * `albert_documents` rows. Pure functions: no I/O, no database.
 *
 * Three inputs are understood:
 *   - HTML (what mammoth produces from a .docx, or marked from .md)
 *   - plain text
 *   - several files, one per chapter, in the order they were given
 *
 * The split rule, in order of preference:
 *   1. the highest heading level present in the document (h1, else h2, else h3)
 *   2. paragraphs that are just "Chapter 3", "CHAPTER III", "Hoofdstuk 3", "3." …
 *   3. no split: the whole file is one chapter
 *
 * Anything before the first heading becomes a front-matter document with no
 * chapter number (a preface, a title page), so nothing is silently dropped.
 */

export type SplitChapter = {
  title: string;
  html: string;
  words: number;
  /** null for front matter that precedes the first chapter heading */
  chapter_number: number | null;
};

export const countWords = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").trim().split(/\s+/).filter(Boolean).length;

const stripTags = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "Chapter 3", "CHAPTER III", "Hoofdstuk 12", "Kapitel 2", "3." — a line that
 *  is only a chapter label, optionally followed by a title after a colon/dash. */
const CHAPTER_LINE = /^\s*(?:chapter|hoofdstuk|kapitel|chapitre|capítulo|capitolo)\s+([0-9]+|[ivxlc]+)\b\s*[:.\-–—]?\s*(.*)$/i;

/** Split rendered HTML into top-level blocks (p, h1..h6, blockquote, ul, ol, hr, table…). */
function topLevelBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<(h[1-6]|p|blockquote|ul|ol|hr|table|pre|div)\b[^>]*>[\s\S]*?<\/\1>|<hr\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) blocks.push(m[0]);
  if (!blocks.length && html.trim()) blocks.push(`<p>${html.trim()}</p>`);
  return blocks;
}

function headingLevel(block: string): number | null {
  const m = block.match(/^<h([1-6])\b/i);
  return m ? Number(m[1]) : null;
}

function chapterLine(block: string): { title: string } | null {
  if (!/^<p\b/i.test(block)) return null;
  const text = stripTags(block);
  if (text.length > 80) return null;
  const m = text.match(CHAPTER_LINE);
  if (!m) return null;
  return { title: m[2].trim() ? `${text.slice(0, m[0].length - m[2].length).trim().replace(/[:.\-–—]\s*$/, "")}: ${m[2].trim()}` : text };
}

/** Remove empty paragraphs and collapse whitespace between blocks. */
function tidy(blocks: string[]): string {
  return blocks
    .filter((b) => !/^<p\b[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>$/i.test(b))
    .join("\n");
}

export function splitHtml(html: string, fallbackTitle: string): SplitChapter[] {
  const blocks = topLevelBlocks(html);

  // 1. Headings: the highest level that appears at least once.
  const levels = blocks.map(headingLevel).filter((l): l is number => l != null);
  const splitLevel = levels.length ? Math.min(...levels) : null;

  // Only split on headings if they actually divide the text — a single
  // heading at the top is a book title, not a chapter break.
  const headingCount = splitLevel == null ? 0 : levels.filter((l) => l === splitLevel).length;
  const isBreak =
    splitLevel != null && headingCount >= 2
      ? (b: string) => (headingLevel(b) === splitLevel ? stripTags(b) : null)
      : blocks.filter((b) => chapterLine(b)).length >= 2
        ? (b: string) => chapterLine(b)?.title ?? null
        : null;

  if (!isBreak) {
    const body = tidy(blocks);
    return [{ title: fallbackTitle, html: body, words: countWords(body), chapter_number: 1 }];
  }

  const out: SplitChapter[] = [];
  let current: { title: string; blocks: string[]; isFront: boolean } = { title: "Front matter", blocks: [], isFront: true };
  const flush = () => {
    const body = tidy(current.blocks);
    if (current.isFront && !body.trim()) return;
    out.push({ title: current.title, html: body, words: countWords(body), chapter_number: null });
  };
  for (const b of blocks) {
    const title = isBreak(b);
    if (title != null) {
      flush();
      current = { title: title || "Untitled", blocks: [`<h1>${escapeHtml(title || "Untitled")}</h1>`], isFront: false };
      continue;
    }
    current.blocks.push(b);
  }
  flush();

  let n = 0;
  for (let i = 0; i < out.length; i++) {
    const isFront = i === 0 && out[0].title === "Front matter";
    out[i].chapter_number = isFront ? null : ++n;
  }
  return out;
}

/** Plain text → HTML paragraphs. A blank line separates paragraphs; a lone
 *  short line (a heading typed without markup) becomes an <h2> so the
 *  heading split can find it. `---`/`***` lines become scene breaks. */
export function plainTextToHtml(text: string): string {
  const paras = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return paras
    .map((p) => {
      const t = p.trim();
      if (!t) return "";
      if (/^(?:[-=_*]\s*){3,}$/.test(t)) return "<hr>";
      const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
      // "Chapter 1" on its own line, with the prose starting on the very next
      // line (no blank line between) — the heading still counts.
      if (CHAPTER_LINE.test(lines[0]) && lines[0].length <= 80) {
        const rest = lines.slice(1);
        return `<h1>${escapeHtml(lines[0])}</h1>` + (rest.length ? `\n<p>${rest.map(escapeHtml).join("<br>")}</p>` : "");
      }
      return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

/** Several files, each one chapter, in the order given. The chapter title is
 *  the file's first heading if it has one, else the file name. */
export function chaptersFromFiles(files: { name: string; html: string }[]): SplitChapter[] {
  return files.map((f, i) => {
    const blocks = topLevelBlocks(f.html);
    const first = blocks[0];
    const lvl = first ? headingLevel(first) : null;
    const title = lvl != null ? stripTags(first) : f.name.replace(/\.[^.]+$/, "").replace(/^\d+[\s._-]*/, "").replace(/[_-]+/g, " ").trim() || `Chapter ${i + 1}`;
    const body = tidy([`<h1>${escapeHtml(title)}</h1>`, ...(lvl != null ? blocks.slice(1) : blocks)]);
    return { title, html: body, words: countWords(body), chapter_number: i + 1 };
  });
}
