"use client";

import { useMemo, useState } from "react";
import { heatBorder, heatColor, type Passage } from "@/lib/passage-heat";

const CATEGORY_LABEL: Record<string, string> = {
  thin: "Thin",
  unclear: "Unclear",
  pacing: "Pacing",
  continuity: "Continuity",
  voice: "Voice",
  query: "Open question",
  strong: "Working",
};

const CATEGORY_HELP: Record<string, string> = {
  thin: "Narrated in summary where it should be dramatised",
  unclear: "The reader can't follow what happened",
  pacing: "Rushes or stalls relative to its weight",
  continuity: "Conflicts with, or should call back to, another chapter",
  voice: "Reads as explanation rather than as Albert",
  query: "An open question left for the author",
  strong: "Already working — protect it",
};

/**
 * The heat map as a list. The tint on the prose shows *where* the work is; this
 * shows *what* it is, ranked, so it can be worked through top to bottom. Not a
 * comment thread: nothing here is a conversation, and none of it is stored on
 * the manuscript.
 */
export default function PassageHeatPanel({
  passages,
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
  loading: boolean;
  error: string | null;
  onRun: () => void;
  onFocus: (index: number | null) => void;
  focused: number | null;
  includeStrong: boolean;
  onIncludeStrong: (v: boolean) => void;
  onClose: () => void;
}) {
  const [minScore, setMinScore] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of passages) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [passages]);

  const visible = useMemo(
    () =>
      passages
        .filter((p) => p.score >= minScore && !hidden.has(p.category))
        .sort((a, b) => b.score - a.score || a.index - b.index),
    [passages, minScore, hidden]
  );

  const needsWork = passages.filter((p) => p.score >= 0.5).length;

  function toggleCategory(c: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }

  return (
    <>
      <header className="px-4 h-11 flex items-center justify-between border-b border-zinc-100 shrink-0">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xs font-semibold text-zinc-700">Heat map</h2>
          {passages.length > 0 && (
            <span className="text-[10px] text-zinc-400">
              {needsWork} of {passages.length} need work
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
          Scores every paragraph for how much editing it needs. A view only — nothing is
          written to the manuscript.
        </p>
        {error && <p className="text-[10px] text-red-600 mt-2">{error}</p>}
      </div>

      {passages.length > 0 && (
        <div className="px-4 py-3 border-b border-zinc-100 shrink-0 space-y-3">
          <div className="flex flex-wrap gap-1">
            {Object.keys(CATEGORY_LABEL)
              .filter((c) => counts[c])
              .map((c) => {
                const off = hidden.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCategory(c)}
                    title={CATEGORY_HELP[c]}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-opacity ${
                      off ? "opacity-30" : ""
                    }`}
                    style={{
                      backgroundColor: heatColor(c, 0.55, 1.6),
                      borderColor: heatBorder(c),
                    }}
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
          <label className="block">
            <span className="text-[10px] text-zinc-400">
              Only show at or above {Math.round(minScore * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.05}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-zinc-900 mt-1"
            />
          </label>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {passages.length === 0 && !loading && (
          <p className="text-[11px] text-zinc-400 px-4 py-6 leading-relaxed">
            Nothing assessed yet. Running this shades each paragraph by how much attention it
            needs, and lists the reasons here.
          </p>
        )}

        {visible.map((p) => (
          <button
            key={p.index}
            onClick={() => onFocus(focused === p.index ? null : p.index)}
            className={`w-full text-left px-4 py-2.5 border-b border-zinc-50 hover:bg-zinc-50 transition-colors ${
              focused === p.index ? "bg-zinc-50" : ""
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: heatBorder(p.category) }}
              />
              <span className="text-[10px] font-medium text-zinc-600">
                {CATEGORY_LABEL[p.category] ?? p.category}
              </span>
              <span className="text-[10px] text-zinc-300 ml-auto tabular-nums">
                ¶{p.index + 1} · {Math.round(p.score * 100)}%
              </span>
            </div>
            <p className="text-[11px] text-zinc-700 leading-snug">{p.note}</p>
            {p.quote && (
              <p className="text-[10px] text-zinc-400 mt-1 leading-snug line-clamp-2 italic">
                “{p.quote}”
              </p>
            )}
          </button>
        ))}

        {passages.length > 0 && visible.length === 0 && (
          <p className="text-[11px] text-zinc-400 px-4 py-6">
            Nothing at this threshold. Lower the slider or re-enable a category.
          </p>
        )}
      </div>
    </>
  );
}
