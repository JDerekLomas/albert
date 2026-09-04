"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * The continuity check, on the book page rather than in the editor.
 *
 * Placement is the point. This used to be a *category* inside the per-chapter
 * heat map, which was a promise the tool could not keep: that pass sees one
 * chapter, so a boy who is seven in Ch1 and eleven twenty months later in Ch2
 * is invisible to it — a fixture with two planted cross-chapter errors missed
 * both, every run. A contradiction is a fact about the book, so it is checked
 * over the whole book and shown where the whole book is.
 */

type Evidence = { chapter: number; quote: string };
type Contradiction = {
  title: string;
  chapters: number[];
  confidence: "certain" | "likely" | "possible";
  detail: string;
  evidence: Evidence[];
  fix: string;
  /** How many independent passes found this. Runs disagree more than you'd
   *  expect, so agreement is shown rather than hidden behind one result. */
  agreed: number;
};
type LedgerEntry = {
  subject: string;
  kind: string;
  consistent: boolean;
  entries: { chapter: number; value: string }[];
};

const CONFIDENCE_STYLE: Record<string, string> = {
  certain: "bg-red-50 text-red-700 border-red-200",
  likely: "bg-amber-50 text-amber-700 border-amber-200",
  possible: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

export default function ContinuityPanel({
  bookId,
  chapterIds,
}: {
  bookId: string;
  /** chapter_number -> document id, so a finding can link to the chapter. */
  chapterIds: Record<number, string>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    contradictions: Contradiction[];
    ledger: LedgerEntry[];
    chapterCount: number;
    wordCount: number;
    passes: number;
  } | null>(null);
  const [showLedger, setShowLedger] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/continuity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Continuity check failed");
    } finally {
      setLoading(false);
    }
  }

  function chapterLink(n: number) {
    const id = chapterIds[n];
    const label = `Ch${n}`;
    return id ? (
      <Link key={n} href={`/d/${id}`} className="underline hover:text-zinc-900">
        {label}
      </Link>
    ) : (
      <span key={n}>{label}</span>
    );
  }

  const RANK = { certain: 0, likely: 1, possible: 2 } as const;
  const sorted = result
    ? [...result.contradictions].sort(
        (a, b) => b.agreed - a.agreed || RANK[a.confidence] - RANK[b.confidence]
      )
    : [];

  return (
    <div className="mb-12 border border-zinc-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">Continuity</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Reads every chapter in one pass, looking for places the book contradicts itself —
            ages, dates, and what it has already established.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="text-xs bg-zinc-900 text-white rounded px-3 py-1.5 font-medium disabled:opacity-40 shrink-0 ml-4"
        >
          {loading ? "Reading the book…" : result ? "Re-check" : "Check the book"}
        </button>
      </div>

      {error && <p className="px-4 py-3 text-xs text-red-600">{error}</p>}

      {loading && !result && (
        <p className="px-4 py-6 text-xs text-zinc-400">
          Reading the whole manuscript. This takes longer than a chapter assessment — a minute or
          so on a full-length book.
        </p>
      )}

      {result && (
        <div>
          <p className="px-4 py-2 text-[11px] text-zinc-400 border-b border-zinc-100">
            {result.chapterCount} chapters · {result.wordCount.toLocaleString()} words ·{" "}
            {result.passes} independent readings · {sorted.length} contradiction
            {sorted.length === 1 ? "" : "s"}
          </p>

          {sorted.length === 0 && (
            <p className="px-4 py-6 text-xs text-zinc-500">
              Nothing contradictory found. That is not proof the book is consistent — it is one
              careful reader&rsquo;s pass.
            </p>
          )}

          {sorted.map((c, i) => (
            <div key={i} className="px-4 py-3 border-b border-zinc-100">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                    CONFIDENCE_STYLE[c.confidence] || CONFIDENCE_STYLE.possible
                  }`}
                >
                  {c.confidence}
                </span>
                <span className="text-sm font-medium text-zinc-800">{c.title}</span>
                {result.passes > 1 && (
                  <span
                    className="text-[10px] text-zinc-400 tabular-nums"
                    title={`Found by ${c.agreed} of ${result.passes} independent readings. Runs disagree; a finding all of them made is the surest.`}
                  >
                    {c.agreed}/{result.passes}
                  </span>
                )}
                <span className="text-[11px] text-zinc-400 ml-auto flex gap-1.5">
                  {c.chapters.map(chapterLink)}
                </span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">{c.detail}</p>
              <div className="mt-2 space-y-1">
                {c.evidence.map((e, j) => (
                  <p key={j} className="text-[11px] text-zinc-500 italic pl-2 border-l-2 border-zinc-200">
                    <span className="not-italic text-zinc-400 tabular-nums">Ch{e.chapter} </span>
                    “{e.quote}”
                  </p>
                ))}
              </div>
              {c.fix && (
                <p className="text-[11px] text-zinc-700 mt-2">
                  <span className="text-zinc-400">Suggested fix — </span>
                  {c.fix}
                </p>
              )}
            </div>
          ))}

          {result.ledger.length > 0 && (
            <div className="border-t border-zinc-100">
              <button
                onClick={() => setShowLedger((v) => !v)}
                className="w-full text-left px-4 py-2.5 text-[11px] text-zinc-500 hover:bg-zinc-50"
              >
                {showLedger ? "▾" : "▸"} What the book asserts more than once ({result.ledger.length})
              </button>
              {showLedger && (
                <div className="px-4 pb-3">
                  <p className="text-[11px] text-zinc-400 mb-2">
                    The book&rsquo;s own record, so you can see it at a glance instead of holding it
                    in your head.
                  </p>
                  <div className="space-y-2">
                    {[...result.ledger]
                      .sort((a, b) => Number(a.consistent) - Number(b.consistent))
                      .map((l, i) => (
                        <div key={i} className="text-[11px]">
                          <span
                            className={`font-medium ${
                              l.consistent ? "text-zinc-600" : "text-red-600"
                            }`}
                          >
                            {l.consistent ? "" : "⚠ "}
                            {l.subject}
                          </span>
                          <span className="text-zinc-300"> · {l.kind}</span>
                          <div className="flex flex-wrap gap-x-3 text-zinc-500 mt-0.5">
                            {l.entries.map((e, j) => (
                              <span key={j}>
                                <span className="text-zinc-300 tabular-nums">Ch{e.chapter}</span>{" "}
                                {e.value}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="px-4 py-2.5 text-[10px] text-zinc-400 bg-zinc-50 border-t border-zinc-100">
            Nothing here was written to the manuscript. Every finding is a claim to check.
          </p>
        </div>
      )}
    </div>
  );
}
