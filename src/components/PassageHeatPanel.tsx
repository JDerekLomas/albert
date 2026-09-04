"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { heatBorder, heatColor, type ChapterVerdict, type Passage } from "@/lib/passage-heat";
import { CATEGORY_HELP, CATEGORY_LABEL, CHAPTER_STATE_HELP } from "@/lib/editorial-ui";

const STATE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  unwritten: { bg: "#fee2e2", fg: "#991b1b", label: "Not written yet" },
  sketch: { bg: "#ffedd5", fg: "#9a3412", label: "Sketch" },
  draft: { bg: "#fef3c7", fg: "#92400e", label: "Draft" },
  working: { bg: "#dbeafe", fg: "#1e40af", label: "Working" },
  finished: { bg: "#d1fae5", fg: "#065f46", label: "Finished" },
};

/**
 * The heat map as a panel. Three sections, in the order a person actually needs
 * them:
 *
 *   1. the chapter's verdict  — some chapters don't have a paragraph problem
 *   2. the findings, ranked   — what to do, hardest first
 *   3. the author's own notes — their to-do list, kept out of the AI's list
 *
 * (3) used to be mixed into (2), where a bracketed "I can't write this yet"
 * scored 0.90 and sat above every finding the pass had actually contributed.
 * Nothing here is stored on the manuscript; it is a view, not a comment thread.
 */
export default function PassageHeatPanel({
  passages,
  verdict,
  loading,
  error,
  onRun,
  onFocus,
  focused,
  includeStrong,
  onIncludeStrong,
  onClose,
}: {
  passages: Passage[];
  verdict: ChapterVerdict | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
  onFocus: (index: number | null) => void;
  focused: number | null;
  includeStrong: boolean;
  onIncludeStrong: (v: boolean) => void;
  onClose: () => void;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set(["strong"]));
  const listRef = useRef<HTMLDivElement>(null);

  // When a finding is selected by clicking the prose, bring it into view here.
  useEffect(() => {
    if (focused === null) return;
    listRef.current
      ?.querySelector(`[data-finding="${focused}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of passages) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [passages]);

  // Ranked, not scored. The model separates "most urgent" from "least urgent"
  // far more reliably than it lands an absolute number, so the list shows a
  // position and the tint shows a magnitude — and no percentage is printed
  // anywhere, because it implied a precision that isn't there.
  const findings = useMemo(
    () =>
      passages
        .filter((p) => p.category !== "query" && !hidden.has(p.category))
        .sort((a, b) => b.score - a.score || a.index - b.index),
    [passages, hidden]
  );

  const queries = useMemo(
    () => passages.filter((p) => p.category === "query").sort((a, b) => a.index - b.index),
    [passages]
  );

  const realFindings = passages.filter(
    (p) => p.category !== "query" && p.category !== "strong"
  ).length;

  function toggleCategory(c: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }

  const style = verdict ? STATE_STYLE[verdict.state] ?? STATE_STYLE.draft : null;

  return (
    <>
      <header className="px-4 h-11 flex items-center justify-between border-b border-zinc-100 shrink-0">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xs font-semibold text-zinc-700">Heat map</h2>
          {passages.length > 0 && (
            <span className="text-[10px] text-zinc-400">
              {realFindings} finding{realFindings === 1 ? "" : "s"} in {passages.length} ¶
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-zinc-300 hover:text-zinc-600 text-sm leading-none"
          title="Close"
        >
          ×
        </button>
      </header>

      <div className="px-4 py-3 border-b border-zinc-100 shrink-0">
        <button
          onClick={onRun}
          disabled={loading}
          className="w-full text-[11px] bg-zinc-900 text-white rounded px-3 py-1.5 font-medium disabled:opacity-40"
        >
          {loading ? "Reading the chapter…" : passages.length ? "Re-assess" : "Assess this chapter"}
        </button>
        <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed">
          Reads this chapter alone. A view only — nothing is written to the manuscript. For
          contradictions across chapters, run the continuity check from the book page.
        </p>
        {error && <p className="text-[10px] text-red-600 mt-2">{error}</p>}
      </div>

      {/* 1. The chapter itself. Above the paragraph list on purpose: when a
          chapter is unwritten, every per-paragraph note is the wrong advice. */}
      {verdict && style && (
        <div className="px-4 py-3 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: style.bg, color: style.fg }}
              title={CHAPTER_STATE_HELP[verdict.state]}
            >
              {style.label}
            </span>
            <span className="text-[10px] text-zinc-400">the chapter as a whole</span>
          </div>
          <p className="text-[11px] font-medium text-zinc-800 leading-snug">{verdict.headline}</p>
          <p className="text-[11px] text-zinc-600 leading-snug mt-1">{verdict.diagnosis}</p>
          {verdict.next_action && (
            <p className="text-[11px] text-zinc-800 leading-snug mt-2 pl-2 border-l-2 border-zinc-300">
              {verdict.next_action}
            </p>
          )}
        </div>
      )}

      {passages.length > 0 && (
        <div className="px-4 py-2.5 border-b border-zinc-100 shrink-0 space-y-2">
          <div className="flex flex-wrap gap-1">
            {Object.keys(CATEGORY_LABEL)
              .filter((c) => c !== "query" && counts[c])
              .map((c) => {
                const off = hidden.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCategory(c)}
                    title={CATEGORY_HELP[c]}
                    className={`text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-600 transition-opacity ${
                      off ? "opacity-30" : ""
                    }`}
                  >
                    {CATEGORY_LABEL[c]} {counts[c]}
                  </button>
                );
              })}
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeStrong}
              onChange={(e) => onIncludeStrong(e.target.checked)}
              className="w-3 h-3 accent-emerald-600 cursor-pointer"
            />
            <span className="text-[10px] text-zinc-400">
              Also shade what&rsquo;s already working
            </span>
          </label>
        </div>
      )}

      <div className="flex-1 overflow-y-auto" ref={listRef}>
        {passages.length === 0 && !loading && (
          <p className="text-[11px] text-zinc-400 px-4 py-6 leading-relaxed">
            Nothing assessed yet. Running this gives a verdict on the chapter, then shades each
            paragraph by how much attention it needs.
          </p>
        )}

        {/* 2. The findings, hardest first. */}
        {findings.map((p, rank) => (
          <button
            key={p.index}
            onClick={() => onFocus(focused === p.index ? null : p.index)}
            data-finding={p.index}
            className={`w-full text-left px-4 py-2.5 border-b border-zinc-50 hover:bg-zinc-50 transition-colors ${
              focused === p.index ? "bg-zinc-50" : ""
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {p.category !== "strong" && (
                <span className="text-[10px] text-zinc-300 tabular-nums w-3">{rank + 1}</span>
              )}
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: heatBorder(p.category) }}
              />
              <span className="text-[10px] font-medium text-zinc-600">
                {CATEGORY_LABEL[p.category] ?? p.category}
              </span>
              <span className="text-[10px] text-zinc-300 ml-auto tabular-nums">¶{p.index + 1}</span>
            </div>
            <p className="text-[11px] text-zinc-700 leading-snug">{p.note}</p>
            {p.quote && (
              <p className="text-[10px] text-zinc-400 mt-1 leading-snug line-clamp-2 italic">
                “{p.quote}”
              </p>
            )}
          </button>
        ))}

        {passages.length > 0 && findings.length === 0 && (
          <p className="text-[11px] text-zinc-400 px-4 py-6">
            Nothing flagged. Re-enable a category above to see the rest.
          </p>
        )}

        {/* 3. The author's own notes — theirs, not the machine's. */}
        {queries.length > 0 && (
          <div className="border-t-4 border-zinc-100">
            <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-zinc-500">
              Your own open questions
            </p>
            <p className="px-4 pb-2 text-[10px] text-zinc-400 leading-snug">
              Bracketed notes you left in the text. Not editorial findings — listed so they
              don&rsquo;t get lost.
            </p>
            {queries.map((p) => (
              <button
                key={p.index}
                onClick={() => onFocus(focused === p.index ? null : p.index)}
                data-finding={p.index}
                className={`w-full text-left px-4 py-2.5 border-b border-zinc-50 hover:bg-zinc-50 transition-colors ${
                  focused === p.index ? "bg-zinc-50" : ""
                }`}
                style={{ backgroundColor: focused === p.index ? undefined : heatColor("query", 0, 1.2) }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium text-zinc-600">
                    {CATEGORY_LABEL.query}
                  </span>
                  <span className="text-[10px] text-zinc-300 ml-auto tabular-nums">
                    ¶{p.index + 1}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-700 leading-snug">{p.note}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
