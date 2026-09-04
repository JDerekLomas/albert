"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, Document } from "@/lib/supabase";
import {
  chapterStats,
  median,
  pages,
  readingMinutes,
  type ChapterStats,
} from "@/lib/book-stats";

/**
 * The book, seen from above.
 *
 * Until now the only view of a 22-chapter manuscript was a list of titles with
 * a word count, and the one genuinely structural question — where is this book,
 * which chapters aren't written — had no surface at all. The per-chapter heat
 * map answers it one chapter at a time and then throws the answer away.
 *
 * Two kinds of number live here, and the distinction is deliberate:
 *   - Free, exact, always current: length, open questions, pending suggestions,
 *     how much of a chapter is spoken aloud. Computed from the HTML on render.
 *   - The model's verdict on each chapter: stored, and marked stale the moment
 *     the prose moves under it. Never silently presented as current.
 */

type Verdict = {
  document_id: string;
  state: string;
  headline: string | null;
  next_action: string | null;
  finding_count: number;
  query_count: number;
  source_updated_at: string;
};

/**
 * Chapter state is ordinal WITH polarity — nothing on the page at one end,
 * finished at the other, ordinary draft in the middle — so it is drawn as a
 * diverging scale (warm pole → neutral midpoint → cool pole), not as five
 * categorical hues. That is not a stylistic call: five hues across red/orange/
 * yellow failed a colourblind-separation check outright, because "sketch" and
 * "draft" sit 9.6 ΔE apart even in normal vision. Diverging also says the true
 * thing — that these are positions on one axis, not five unrelated kinds.
 */
const STATE = {
  unwritten: { fill: "#b91c1c", chip: "#fee2e2", ink: "#991b1b", label: "Not written" },
  sketch: { fill: "#f87171", chip: "#fee2e2", ink: "#b91c1c", label: "Sketch" },
  draft: { fill: "#d4d4d8", chip: "#f4f4f5", ink: "#52525b", label: "Draft" },
  working: { fill: "#6ee7b7", chip: "#d1fae5", ink: "#047857", label: "Working" },
  finished: { fill: "#047857", chip: "#d1fae5", ink: "#065f46", label: "Finished" },
} as const;

const UNKNOWN = { fill: "#e4e4e7", chip: "#fafafa", ink: "#a1a1aa", label: "Not assessed" };
const STATE_ORDER = ["unwritten", "sketch", "draft", "working", "finished"] as const;

function stateStyle(state: string | undefined) {
  return (STATE as Record<string, (typeof STATE)[keyof typeof STATE]>)[state ?? ""] ?? UNKNOWN;
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function BookMap({
  bookId,
  chapters,
  partLabels,
  onDelete,
}: {
  bookId: string;
  chapters: Document[];
  partLabels: Record<number, string>;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [comments, setComments] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapters.length]);

  async function load() {
    const [{ data: v }, { data: c }] = await Promise.all([
      supabase.from("albert_chapter_verdicts").select("*").eq("book_id", bookId),
      supabase
        .from("albert_comments")
        .select("document_id")
        .eq("resolved", false)
        .in("document_id", chapters.map((d) => d.id)),
    ]);
    setVerdicts(Object.fromEntries((v || []).map((r: Verdict) => [r.document_id, r])));
    const counts: Record<string, number> = {};
    for (const row of (c || []) as { document_id: string }[])
      counts[row.document_id] = (counts[row.document_id] || 0) + 1;
    setComments(counts);
  }

  async function assessAll() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/assess-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      if (data.failures?.length)
        setError(`${data.failures.length} chapter(s) failed: ${data.failures[0].error}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setRunning(false);
    }
  }

  const stats = useMemo(() => chapters.map(chapterStats), [chapters]);

  const totals = useMemo(() => {
    const words = stats.reduce((s, c) => s + c.words, 0);
    return {
      words,
      queries: stats.reduce((s, c) => s + c.queries, 0),
      suggestions: stats.reduce((s, c) => s + c.pendingSuggestions, 0),
      comments: Object.values(comments).reduce((s, n) => s + n, 0),
      median: median(stats.map((c) => c.words)),
      longest: stats.reduce<ChapterStats | null>(
        (a, c) => (!a || c.words > a.words ? c : a),
        null
      ),
      shortest: stats.reduce<ChapterStats | null>(
        (a, c) => (!a || c.words < a.words ? c : a),
        null
      ),
    };
  }, [stats, comments]);

  const isStale = (c: ChapterStats) => {
    const v = verdicts[c.doc.id];
    return v ? new Date(v.source_updated_at).getTime() < new Date(c.doc.updated_at).getTime() : false;
  };

  const assessed = stats.filter((c) => verdicts[c.doc.id] && !isStale(c));
  const stateCounts = STATE_ORDER.map((s) => ({
    state: s,
    n: assessed.filter((c) => verdicts[c.doc.id]?.state === s).length,
  })).filter((r) => r.n);

  // Parts, in order, with their share of the whole.
  const parts = useMemo(() => {
    const byPart = new Map<number, ChapterStats[]>();
    for (const c of stats) {
      const key = c.doc.part_number ?? 0;
      if (!byPart.has(key)) byPart.set(key, []);
      byPart.get(key)!.push(c);
    }
    return [...byPart.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([num, cs]) => ({
        num,
        label: partLabels[num] || (num ? `Part ${num}` : "Unsorted"),
        chapters: cs,
        words: cs.reduce((s, c) => s + c.words, 0),
      }));
  }, [stats, partLabels]);

  const maxWords = Math.max(1, ...stats.map((c) => c.words));

  if (!chapters.length) return null;

  return (
    <div className="mb-12 space-y-6">
      {/* Headline numbers. A stat tile, not a chart — these are single values
          with no shape to show. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-zinc-100 border border-zinc-100 rounded-lg overflow-hidden">
        {[
          { label: "words", value: totals.words.toLocaleString() },
          { label: "chapters", value: String(chapters.length) },
          { label: "pages", value: `~${pages(totals.words)}` },
          {
            label: "read time",
            value:
              readingMinutes(totals.words) >= 90
                ? `${Math.round(readingMinutes(totals.words) / 60)}h`
                : `${readingMinutes(totals.words)}m`,
          },
          { label: "open questions", value: String(totals.queries), warn: totals.queries > 0 },
          {
            label: "awaiting review",
            value: String(totals.suggestions + totals.comments),
            warn: totals.suggestions + totals.comments > 0,
          },
        ].map((t) => (
          <div key={t.label} className="bg-white px-3 py-2.5">
            <div
              className={`text-lg font-semibold tabular-nums leading-none ${
                t.warn ? "text-amber-600" : "text-zinc-800"
              }`}
            >
              {t.value}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">{t.label}</div>
          </div>
        ))}
      </div>

      {/* The spine: every chapter in order, width proportional to its length.
          This is the "sense of it" view — where the book is thick, where it
          thins out, and which of those thin places are thin because nothing has
          been written there yet. */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-xs font-semibold text-zinc-700">
            The spine
            <span className="font-normal text-zinc-400 ml-2">
              every chapter in order, sized by length
            </span>
          </h2>
          <button
            onClick={assessAll}
            disabled={running}
            className="text-[11px] bg-zinc-900 text-white rounded px-2.5 py-1 font-medium disabled:opacity-40"
          >
            {running
              ? "Reading every chapter…"
              : assessed.length
                ? "Re-assess stale"
                : "Assess all chapters"}
          </button>
        </div>

        <div className="flex gap-[2px] h-12 items-stretch">
          {stats.map((c) => {
            const v = verdicts[c.doc.id];
            const style = stateStyle(isStale(c) ? undefined : v?.state);
            return (
              <Link
                key={c.doc.id}
                href={`/d/${c.doc.id}`}
                onMouseEnter={() => setHover(c.doc.id)}
                onMouseLeave={() => setHover(null)}
                title={`${c.doc.title} — ${c.words.toLocaleString()} words · ${style.label}`}
                className="rounded-[3px] relative transition-opacity hover:opacity-80"
                style={{
                  flexGrow: Math.max(c.words, maxWords * 0.04),
                  flexBasis: 0,
                  backgroundColor: style.fill,
                  outline: hover === c.doc.id ? "2px solid #18181b" : undefined,
                  outlineOffset: 1,
                }}
              >
                <span className="absolute inset-x-0 -bottom-4 text-[9px] text-zinc-400 text-center tabular-nums">
                  {c.doc.chapter_number}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="h-4" />

        {/* Legend. Identity is never colour alone — every segment is also
            reachable as a labelled row in the table below. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          {(stateCounts.length ? stateCounts : []).map(({ state, n }) => (
            <span key={state} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span
                className="w-2.5 h-2.5 rounded-[2px]"
                style={{ backgroundColor: stateStyle(state).fill }}
              />
              {stateStyle(state).label} {n}
            </span>
          ))}
          {assessed.length < chapters.length && (
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: UNKNOWN.fill }} />
              {UNKNOWN.label} {chapters.length - assessed.length}
            </span>
          )}
        </div>
        {error && <p className="text-[10px] text-red-600 mt-2">{error}</p>}
      </div>

      {/* Part balance — the question "is Part 3 carrying too much?" */}
      {parts.length > 1 && (
        <div>
          <h2 className="text-xs font-semibold text-zinc-700 mb-2">
            Balance
            <span className="font-normal text-zinc-400 ml-2">share of the book by part</span>
          </h2>
          <div className="space-y-1.5">
            {parts.map((p) => (
              <div key={p.num} className="flex items-center gap-3">
                <span className="text-[11px] text-zinc-500 w-32 truncate shrink-0" title={p.label}>
                  {p.label}
                </span>
                <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-400 rounded-full"
                    style={{ width: `${(p.words / Math.max(1, totals.words)) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 tabular-nums w-32 text-right shrink-0">
                  {p.words.toLocaleString()}w ·{" "}
                  {Math.round((p.words / Math.max(1, totals.words)) * 100)}% · {p.chapters.length} ch
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chapter by chapter. Same data as the spine, in the form you can read
          a number off. */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-700 mb-2">
          Chapters
          <span className="font-normal text-zinc-400 ml-2">
            median {totals.median.toLocaleString()}w
            {totals.longest && totals.shortest
              ? ` · longest ${totals.longest.words.toLocaleString()}w · shortest ${totals.shortest.words.toLocaleString()}w`
              : ""}
          </span>
        </h2>
        <div className="border border-zinc-100 rounded-lg overflow-hidden">
          {parts.map((p) => (
            <div key={p.num}>
              {parts.length > 1 && (
                <div className="px-3 py-1.5 bg-zinc-50 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-100">
                  {p.label}
                </div>
              )}
              {p.chapters.map((c) => {
                const v = verdicts[c.doc.id];
                const stale = isStale(c);
                const style = stateStyle(stale ? undefined : v?.state);
                const openComments = comments[c.doc.id] || 0;
                return (
                  <Link
                    key={c.doc.id}
                    href={`/d/${c.doc.id}`}
                    className="flex items-center gap-3 px-3 py-2 border-b border-zinc-50 last:border-b-0 hover:bg-zinc-50 transition-colors group"
                  >
                    <span className="text-[10px] text-zinc-300 font-mono w-5 text-right shrink-0 tabular-nums">
                      {c.doc.chapter_number}
                    </span>
                    <span className="text-[13px] text-zinc-800 w-56 truncate shrink-0">
                      {c.doc.title?.replace(/^Chapter \d+:\s*/, "") || "Untitled"}
                    </span>

                    <div className="flex-1 min-w-[60px] h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(c.words / maxWords) * 100}%`,
                          backgroundColor: style.fill,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400 tabular-nums w-14 text-right shrink-0">
                      {c.words.toLocaleString()}w
                    </span>

                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded shrink-0 w-24 text-center"
                      style={{ backgroundColor: style.chip, color: style.ink }}
                      title={v?.headline || undefined}
                    >
                      {style.label}
                      {stale ? " ·" : ""}
                    </span>

                    {/* Counts that always mean "someone has to do something". */}
                    <span className="flex items-center gap-2 text-[10px] tabular-nums w-28 shrink-0 justify-end">
                      {c.queries > 0 && (
                        <span className="text-amber-600" title={`${c.queries} open question(s)`}>
                          ?{c.queries}
                        </span>
                      )}
                      {c.pendingSuggestions > 0 && (
                        <span
                          className="text-emerald-700"
                          title={`${c.pendingSuggestions} pending suggestion(s)`}
                        >
                          ±{c.pendingSuggestions}
                        </span>
                      )}
                      {openComments > 0 && (
                        <span className="text-blue-600" title={`${openComments} open comment(s)`}>
                          ✻{openComments}
                        </span>
                      )}
                      <span
                        className="text-zinc-300"
                        title={`${Math.round(c.dialogueShare * 100)}% of paragraphs contain speech`}
                      >
                        {Math.round(c.dialogueShare * 100)}%
                      </span>
                    </span>

                    <span className="text-[10px] text-zinc-300 tabular-nums w-8 text-right shrink-0">
                      {timeAgo(c.doc.updated_at)}
                    </span>
                    <button
                      onClick={(e) => onDelete(c.doc.id, e)}
                      className="text-[10px] text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 w-8 text-right"
                    >
                      Delete
                    </button>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-zinc-400 mt-1.5">
          ? open questions · ± pending suggestions · ✻ open comments · % of paragraphs with
          dialogue. A chapter marked · has changed since it was assessed.
        </p>
      </div>

      {/* What to do next — the verdicts turned into a queue, worst first. */}
      {assessed.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-zinc-700 mb-2">
            Next
            <span className="font-normal text-zinc-400 ml-2">
              the chapters furthest from done
            </span>
          </h2>
          <div className="space-y-1.5">
            {[...assessed]
              // Always the furthest-from-done, whatever state that is. Filtering
              // to "unwritten" left the memoir's queue empty and the panel
              // saying nothing needed writing, on a book where every chapter is
              // a draft — technically true, useless as an answer to "what now?".
              .sort(
                (a, b) =>
                  STATE_ORDER.indexOf(verdicts[a.doc.id].state as "draft") -
                    STATE_ORDER.indexOf(verdicts[b.doc.id].state as "draft") ||
                  verdicts[b.doc.id].finding_count - verdicts[a.doc.id].finding_count
              )
              .slice(0, 4)
              .map((c) => {
                const v = verdicts[c.doc.id];
                return (
                  <Link
                    key={c.doc.id}
                    href={`/d/${c.doc.id}`}
                    className="block border border-zinc-100 rounded-lg px-3 py-2 hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: stateStyle(v.state).chip,
                          color: stateStyle(v.state).ink,
                        }}
                      >
                        {stateStyle(v.state).label}
                      </span>
                      <span className="text-[12px] font-medium text-zinc-800">
                        {c.doc.title}
                      </span>
                      <span className="text-[10px] text-zinc-300 ml-auto tabular-nums">
                        {c.words.toLocaleString()}w
                      </span>
                    </div>
                    {v.next_action && (
                      <p className="text-[11px] text-zinc-600 leading-snug">{v.next_action}</p>
                    )}
                  </Link>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
