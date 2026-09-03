"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ChapterSummary = {
  document_id: string;
  synopsis: string;
  outline: string[] | null;
  themes: string[];
  entities: {
    people?: string[];
    places?: string[];
    motifs?: string[];
    callbacks?: string[];
  };
  source_updated_at: string;
  generated_at: string;
  editor_notes: string;
};

/**
 * Read-mostly view of what `summarize-chapter.mjs` generated for this
 * chapter (outline, themes, entities), plus an editable notes scratch pad
 * that's never touched by regeneration — a place for editorial thinking
 * about the chapter as a whole to live, distinct from inline comments on
 * specific passages.
 */
export default function ChapterIndexPanel({
  documentId,
  documentUpdatedAt,
  onClose,
}: {
  documentId: string;
  documentUpdatedAt: string;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<ChapterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("albert_chapter_summaries")
      .select("*")
      .eq("document_id", documentId)
      .maybeSingle();
    setSummary(data);
    setNotes(data?.editor_notes || "");
    setNotesSaved(true);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [documentId]);

  async function saveNotes() {
    setSavingNotes(true);
    const { error } = await supabase
      .from("albert_chapter_summaries")
      .update({ editor_notes: notes })
      .eq("document_id", documentId);
    setSavingNotes(false);
    if (!error) setNotesSaved(true);
  }

  const stale = summary && summary.source_updated_at < documentUpdatedAt;

  return (
    <div className="flex flex-col h-full">
      <div className="h-11 border-b border-zinc-100 px-3 flex items-center justify-between shrink-0">
        <span className="text-sm font-medium">Index</span>
        <button
          onClick={onClose}
          className="text-zinc-300 hover:text-zinc-600 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 text-sm">
        {loading && (
          <p className="text-zinc-400 text-center py-8">Loading...</p>
        )}

        {!loading && !summary && (
          <div className="text-zinc-400 text-center py-8">
            <p>No index yet for this chapter.</p>
            <p className="text-xs mt-1">
              Run <code className="text-[11px] bg-zinc-50 px-1 py-0.5 rounded">summarize-chapter.mjs</code> to generate one.
            </p>
          </div>
        )}

        {!loading && summary && (
          <>
            {stale && (
              <div className="text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-lg px-2.5 py-2">
                This chapter changed since the index was last generated — outline and themes below may be stale.
              </div>
            )}

            <section>
              <h3 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                Synopsis
              </h3>
              <p className="text-zinc-700 text-[13px] leading-relaxed">{summary.synopsis}</p>
            </section>

            {summary.outline && summary.outline.length > 0 && (
              <section>
                <h3 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                  Outline
                </h3>
                <ol className="space-y-1 list-decimal list-inside">
                  {summary.outline.map((beat, i) => (
                    <li key={i} className="text-zinc-700 text-[13px] leading-snug">
                      {beat}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {summary.themes?.length > 0 && (
              <section>
                <h3 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                  Themes
                </h3>
                <div className="flex flex-wrap gap-1">
                  {summary.themes.map((t, i) => (
                    <span
                      key={i}
                      className="text-[11px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {(summary.entities?.people?.length ?? 0) > 0 && (
              <section>
                <h3 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                  People
                </h3>
                <ul className="space-y-0.5">
                  {summary.entities.people!.map((p, i) => (
                    <li key={i} className="text-zinc-600 text-[12px] leading-snug">
                      {p}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(summary.entities?.places?.length ?? 0) > 0 && (
              <section>
                <h3 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                  Places
                </h3>
                <p className="text-zinc-600 text-[12px] leading-snug">
                  {summary.entities.places!.join(" · ")}
                </p>
              </section>
            )}

            {(summary.entities?.motifs?.length ?? 0) > 0 && (
              <section>
                <h3 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                  Motifs
                </h3>
                <p className="text-zinc-600 text-[12px] leading-snug">
                  {summary.entities.motifs!.join(" · ")}
                </p>
              </section>
            )}

            {(summary.entities?.callbacks?.length ?? 0) > 0 && (
              <section>
                <h3 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                  Callbacks
                </h3>
                <ul className="space-y-0.5">
                  {summary.entities.callbacks!.map((c, i) => (
                    <li key={i} className="text-zinc-600 text-[12px] leading-snug">
                      {c}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                Notes
              </h3>
              <textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNotesSaved(false);
                }}
                placeholder="Editorial notes on this chapter as a whole — separate from the auto-generated index above, and never overwritten by it..."
                rows={5}
                className="w-full text-[13px] border border-zinc-200 rounded-lg p-2 resize-none focus:outline-none focus:border-zinc-400 placeholder:text-zinc-300"
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-zinc-300">
                  {notesSaved ? "Saved" : "Unsaved changes"}
                </span>
                <button
                  onClick={saveNotes}
                  disabled={notesSaved || savingNotes}
                  className="text-xs bg-zinc-900 text-white px-3 py-1 rounded font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {savingNotes ? "Saving..." : "Save notes"}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
