"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Editor } from "@tiptap/react";

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

type Tab = "outline" | "context" | "notes";

/**
 * The chapter's index as a set of views rather than one long scroll: the
 * outline is navigable (each beat scrolls to the paragraph it describes), the
 * generated context is grouped, and the editorial notes are rendered as a
 * document instead of being crammed into a five-row textarea.
 *
 * The distinction from the Comments panel is deliberate. Comments are anchored
 * to a passage and are a conversation. This is standing knowledge about the
 * chapter as a whole — the kind of thing that should be readable at a glance
 * rather than reconstructed by scrolling a thread.
 */
export default function ChapterIndexPanel({
  documentId,
  documentUpdatedAt,
  editor,
  onClose,
}: {
  documentId: string;
  documentUpdatedAt: string;
  editor: Editor | null;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<ChapterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("outline");
  const [notes, setNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("albert_chapter_summaries")
        .select("*")
        .eq("document_id", documentId)
        .maybeSingle();
      if (cancelled) return;
      setSummary(data);
      setNotes(data?.editor_notes || "");
      setNotesSaved(true);
      setEditingNotes(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const stale = summary ? summary.source_updated_at < documentUpdatedAt : false;

  /** Paragraph text, in the order the editor renders it. */
  const paragraphs = useMemo(() => {
    if (!editor) return [] as string[];
    const out: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name !== "paragraph") return true;
      out.push(node.textContent);
      return false;
    });
    return out;
  }, [editor, summary]);

  /**
   * Best-guess paragraph for each outline beat, by shared distinctive words.
   * The beats are generated without positions, so this is a heuristic — good
   * enough to jump near the right place, and it simply doesn't offer a jump
   * when nothing matches well.
   */
  const beatTargets = useMemo(() => {
    if (!summary?.outline || !paragraphs.length) return [];
    const words = (s: string) =>
      new Set(
        s
          .toLowerCase()
          .replace(/[^a-z\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 4)
      );
    return summary.outline.map((beat) => {
      const b = words(beat);
      if (!b.size) return -1;
      let best = -1;
      let bestScore = 0;
      paragraphs.forEach((p, i) => {
        const pw = words(p);
        let shared = 0;
        for (const w of b) if (pw.has(w)) shared++;
        const score = shared / b.size;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      return bestScore >= 0.25 ? best : -1;
    });
  }, [summary, paragraphs]);

  function jumpToParagraph(paraIndex: number) {
    if (!editor || paraIndex < 0) return;
    let seen = 0;
    let pos: number | null = null;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name !== "paragraph") return true;
      if (seen++ === paraIndex && pos === null) pos = p;
      return false;
    });
    if (pos === null) return;
    editor.chain().focus().setTextSelection(pos + 1).run();
    const { node } = editor.view.domAtPos(pos + 1);
    const el = node instanceof HTMLElement ? node : node.parentElement;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveNotes() {
    setSavingNotes(true);
    await supabase
      .from("albert_chapter_summaries")
      .update({ editor_notes: notes })
      .eq("document_id", documentId);
    setSavingNotes(false);
    setNotesSaved(true);
    setEditingNotes(false);
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "outline", label: "Outline" },
    { id: "context", label: "Context" },
    { id: "notes", label: "Notes" },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 h-11 flex items-center justify-between border-b border-zinc-100 shrink-0">
        <h2 className="text-xs font-semibold text-zinc-700">Chapter index</h2>
        <button
          onClick={onClose}
          className="text-zinc-300 hover:text-zinc-600 text-sm leading-none"
          title="Close"
        >
          ×
        </button>
      </header>

      <nav className="flex border-b border-zinc-100 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-[11px] py-2 font-medium transition-colors ${
              tab === t.id
                ? "text-zinc-900 border-b-2 border-zinc-900"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading && <p className="text-zinc-400 text-center py-8 text-sm">Loading…</p>}

        {!loading && !summary && (
          <div className="text-zinc-400 text-center py-8">
            <p className="text-sm">No index yet for this chapter.</p>
            <p className="text-xs mt-1">
              Run{" "}
              <code className="text-[11px] bg-zinc-50 px-1 py-0.5 rounded">
                summarize-chapter.mjs
              </code>
            </p>
          </div>
        )}

        {!loading && summary && stale && (
          <div className="text-[11px] bg-amber-50 text-amber-700 border border-amber-100 rounded-lg px-2.5 py-2">
            The chapter changed since this index was built — re-run{" "}
            <code>summarize-chapter.mjs</code>.
          </div>
        )}

        {!loading && summary && tab === "outline" && (
          <>
            <section>
              <h3 className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                Synopsis
              </h3>
              <p className="text-zinc-700 text-[13px] leading-relaxed">{summary.synopsis}</p>
            </section>

            {summary.outline?.length ? (
              <section>
                <h3 className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                  Beats
                </h3>
                <ol className="space-y-0.5">
                  {summary.outline.map((beat, i) => {
                    const target = beatTargets[i] ?? -1;
                    return (
                      <li key={i}>
                        <button
                          onClick={() => jumpToParagraph(target)}
                          disabled={target < 0}
                          title={
                            target >= 0
                              ? `Jump to paragraph ${target + 1}`
                              : "No confident match in the text"
                          }
                          className={`w-full text-left flex gap-2 px-2 py-1.5 rounded text-[12px] leading-snug ${
                            target >= 0
                              ? "hover:bg-zinc-50 text-zinc-700 cursor-pointer"
                              : "text-zinc-400 cursor-default"
                          }`}
                        >
                          <span className="text-zinc-300 tabular-nums shrink-0">{i + 1}.</span>
                          <span>{beat}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <p className="text-[10px] text-zinc-300 mt-2 px-2">
                  Click a beat to jump to it. Positions are matched by wording, so they land
                  near — not exactly on — the line.
                </p>
              </section>
            ) : null}
          </>
        )}

        {!loading && summary && tab === "context" && (
          <>
            {summary.themes?.length > 0 && (
              <Group title="Themes">
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
              </Group>
            )}
            {(summary.entities?.people?.length ?? 0) > 0 && (
              <Group title="People">
                <ul className="space-y-0.5">
                  {summary.entities.people!.map((p, i) => (
                    <li key={i} className="text-zinc-600 text-[12px] leading-snug">
                      {p}
                    </li>
                  ))}
                </ul>
              </Group>
            )}
            {(summary.entities?.places?.length ?? 0) > 0 && (
              <Group title="Places">
                <p className="text-zinc-600 text-[12px] leading-snug">
                  {summary.entities.places!.join(" · ")}
                </p>
              </Group>
            )}
            {(summary.entities?.motifs?.length ?? 0) > 0 && (
              <Group title="Motifs">
                <p className="text-zinc-600 text-[12px] leading-snug">
                  {summary.entities.motifs!.join(" · ")}
                </p>
              </Group>
            )}
            {(summary.entities?.callbacks?.length ?? 0) > 0 && (
              <Group title="Callbacks">
                <ul className="space-y-1">
                  {summary.entities.callbacks!.map((c, i) => (
                    <li
                      key={i}
                      className="text-zinc-600 text-[12px] leading-snug pl-2 border-l-2 border-zinc-100"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </Group>
            )}
          </>
        )}

        {!loading && summary && tab === "notes" && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                Editorial notes
              </h3>
              <button
                onClick={() => setEditingNotes((v) => !v)}
                className="text-[10px] text-zinc-400 hover:text-zinc-700"
              >
                {editingNotes ? "Done" : "Edit"}
              </button>
            </div>

            {editingNotes ? (
              <>
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesSaved(false);
                  }}
                  placeholder="Standing notes about this chapter — never overwritten when the index is regenerated."
                  rows={18}
                  className="w-full text-[12px] font-mono border border-zinc-200 rounded-lg p-2 resize-y focus:outline-none focus:border-zinc-400 placeholder:text-zinc-300 leading-relaxed"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-zinc-300">
                    {notesSaved ? "Saved" : "Unsaved changes"}
                  </span>
                  <button
                    onClick={saveNotes}
                    disabled={notesSaved || savingNotes}
                    className="text-xs bg-zinc-900 text-white px-3 py-1 rounded font-medium disabled:opacity-30"
                  >
                    {savingNotes ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            ) : notes.trim() ? (
              <Notes text={notes} />
            ) : (
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Nothing yet. These are standing notes about the chapter as a whole — kept out
                of the comment threads, and never overwritten when the index is regenerated.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Render the notes with the little structure they carry — ALL-CAPS lines and
 * numbered items become headings and list items — so a long diagnosis reads as
 * a document instead of a wall of monospace.
 */
function Notes({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        const line = block.trim();
        const isHeading = /^[A-Z][A-Z0-9 ,'’()—-]{5,}$/.test(line.split("\n")[0].trim());
        if (isHeading) {
          const [head, ...rest] = line.split("\n");
          return (
            <div key={i}>
              <h4 className="text-[11px] font-semibold text-zinc-800 tracking-wide">
                {head.trim()}
              </h4>
              {rest.length > 0 && (
                <p className="text-[12px] text-zinc-600 leading-relaxed mt-1 whitespace-pre-line">
                  {rest.join("\n").trim()}
                </p>
              )}
            </div>
          );
        }
        const isListItem = /^[-•*]\s|^\d+\.\s/.test(line);
        return (
          <p
            key={i}
            className={`text-[12px] text-zinc-600 leading-relaxed whitespace-pre-line ${
              isListItem ? "pl-3 border-l-2 border-zinc-100" : ""
            }`}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}
