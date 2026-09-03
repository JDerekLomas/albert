"use client";

import { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  collectSuggestions,
  resolveAll,
  resolveSuggestion,
  Suggestion,
} from "@/lib/suggestion-marks";

export default function SuggestionsPanel({
  editor,
  onClose,
}: {
  editor: Editor | null;
  onClose: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

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

  if (!editor) return null;

  function snippet(s: Suggestion) {
    const del = s.parts.find((p) => p.type === "del")?.text;
    const ins = s.parts.find((p) => p.type === "ins")?.text;
    if (del && ins) return { del, ins };
    if (ins) return { del: null, ins };
    return { del, ins: null };
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

      {suggestions.length > 0 && (
        <div className="px-3 py-2 border-b border-zinc-100 flex gap-2">
          <button
            onClick={() => resolveAll(editor, true)}
            className="flex-1 text-xs py-1.5 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 transition-colors"
          >
            Accept all
          </button>
          <button
            onClick={() => resolveAll(editor, false)}
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
              {s.reason && (
                <p className="text-xs text-zinc-400 italic mb-2">
                  {s.reason}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => resolveSuggestion(editor, s, true)}
                  className="flex-1 text-xs py-1 bg-emerald-50 text-emerald-700 rounded font-medium hover:bg-emerald-100 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => resolveSuggestion(editor, s, false)}
                  className="flex-1 text-xs py-1 bg-zinc-50 text-zinc-500 rounded font-medium hover:bg-zinc-100 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
