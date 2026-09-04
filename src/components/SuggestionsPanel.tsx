"use client";

import { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  collectSuggestions,
  resolveAll,
  resolveSuggestion,
  ResolvedSuggestion,
  Suggestion,
  suggestionText,
} from "@/lib/suggestion-marks";

export default function SuggestionsPanel({
  editor,
  documentId,
  onClose,
}: {
  editor: Editor | null;
  documentId: string;
  onClose: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [resolved, setResolved] = useState<ResolvedSuggestion[]>([]);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const refresh = () => setSuggestions(collectSuggestions(editor));
    refresh();
    editor.on("update", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("update", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  async function loadResolved() {
    const { data } = await supabase
      .from("albert_suggestion_log")
      .select("*")
      .eq("document_id", documentId)
      .order("resolved_at", { ascending: false });
    setResolved(data || []);
  }

  useEffect(() => {
    loadResolved();
  }, [documentId]);

  if (!editor) return null;

  async function resolve(s: Suggestion, accept: boolean) {
    if (!editor) return;
    await resolveSuggestion(editor, s, accept, documentId);
    loadResolved();
  }

  async function resolveAllSuggestions(accept: boolean) {
    if (!editor) return;
    await resolveAll(editor, accept, documentId);
    loadResolved();
  }

  // Every span of the suggestion, not just the first — a card that shows one
  // word pair for a five-span rewrite is asking for a click on something the
  // reviewer hasn't seen.
  function snippet(s: Suggestion) {
    return { del: suggestionText(s, "del"), ins: suggestionText(s, "ins") };
  }

  // A reason shared by every pending suggestion belongs to the pass, not to
  // any one edit. Two passes pending at once (different reasons) fall back to
  // per-card display.
  const reasons = new Set(suggestions.map((s) => s.reason).filter(Boolean));
  const passReason = reasons.size === 1 && suggestions.length > 1 ? [...reasons][0] : null;

  function timeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-11 border-b border-zinc-100 px-3 flex items-center justify-between shrink-0">
        <span className="text-sm font-medium">
          Suggestions{" "}
          {suggestions.length > 0 && (
            <span className="text-zinc-400 font-normal">
              ({suggestions.length})
            </span>
          )}
        </span>
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

      {/* A `suggest` run stamps one reason across every change it made, so
          repeating it on each card implied it explained THAT edit — a reviewer
          reading "Continuity: Danny is nine" above an unrelated sentence
          rewrite is being misled. Shown once, as what it is: the whole pass. */}
      {passReason && (
        <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50">
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-0.5">
            This pass
          </p>
          <p className="text-xs text-zinc-500 italic leading-snug">{passReason}</p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="px-3 py-2 border-b border-zinc-100 flex gap-2">
          <button
            onClick={() => resolveAllSuggestions(true)}
            className="flex-1 text-xs py-1.5 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 transition-colors"
          >
            Accept all
          </button>
          <button
            onClick={() => resolveAllSuggestions(false)}
            className="flex-1 text-xs py-1.5 bg-zinc-100 text-zinc-600 rounded font-medium hover:bg-zinc-200 transition-colors"
          >
            Reject all
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {suggestions.length === 0 && (
          <div className="text-zinc-400 text-sm text-center py-8">
            <p>No pending suggestions.</p>
            <p className="text-xs mt-1">
              AI edits will appear here as proposed changes, not applied
              directly.
            </p>
          </div>
        )}

        {suggestions.map((s) => {
          const { del, ins } = snippet(s);
          return (
            <div
              key={s.sid}
              className="border border-zinc-200 rounded-lg p-3 text-sm"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
                  {s.author}
                </span>
              </div>
              <div className="space-y-1 mb-2">
                {del && (
                  <div className="text-red-500 line-through decoration-red-300 text-[13px] leading-snug">
                    {del}
                  </div>
                )}
                {ins && (
                  <div className="text-emerald-700 text-[13px] leading-snug">
                    {ins}
                  </div>
                )}
              </div>
              {s.reason && s.reason !== passReason && (
                <p className="text-xs text-zinc-400 italic mb-2">{s.reason}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => resolve(s, true)}
                  className="flex-1 text-xs py-1 bg-emerald-50 text-emerald-700 rounded font-medium hover:bg-emerald-100 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => resolve(s, false)}
                  className="flex-1 text-xs py-1 bg-zinc-50 text-zinc-500 rounded font-medium hover:bg-zinc-100 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {resolved.length > 0 && (
        <div className="border-t border-zinc-100">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="w-full text-left px-3 py-2 text-[11px] text-zinc-400 hover:text-zinc-600"
          >
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved
          </button>
          {showResolved && (
            <div className="px-3 pb-3 space-y-2 max-h-64 overflow-y-auto">
              {resolved.map((r) => (
                <div
                  key={r.id}
                  className="border border-zinc-100 bg-zinc-50 rounded-lg p-2.5 text-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        r.action === "accepted"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-zinc-200 text-zinc-500"
                      }`}
                    >
                      {r.action}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {r.author} &middot; {timeAgo(r.resolved_at)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {r.del_text && (
                      <div
                        className={`text-[12px] leading-snug ${
                          r.action === "accepted"
                            ? "text-red-400 line-through decoration-red-200"
                            : "text-zinc-600"
                        }`}
                      >
                        {r.del_text}
                        {r.action === "rejected" && (
                          <span className="text-zinc-400"> (kept)</span>
                        )}
                      </div>
                    )}
                    {r.ins_text && (
                      <div
                        className={`text-[12px] leading-snug ${
                          r.action === "accepted"
                            ? "text-emerald-700"
                            : "text-zinc-400 line-through decoration-zinc-300"
                        }`}
                      >
                        {r.ins_text}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
