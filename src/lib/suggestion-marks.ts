import { Mark, mergeAttributes } from "@tiptap/core";
import { supabase } from "./supabase";

/**
 * Suggestion marks — the review layer. An AI (or human) proposes an edit as
 * a pending insertion/deletion pair sharing a `sid` (suggestion id) instead
 * of writing the change directly. Nothing is final until a human accepts or
 * rejects it in the editor. Both marks round-trip through the HTML stored in
 * Supabase, so pending suggestions live in the same `content` column as the
 * prose itself — no extra table needed.
 */

function sharedAttrs() {
  return {
    sid: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-sid"),
      renderHTML: (attrs: { sid: string | null }) =>
        attrs.sid ? { "data-sid": attrs.sid } : {},
    },
    author: {
      default: "claude",
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-author") || "claude",
      renderHTML: (attrs: { author: string }) => ({
        "data-author": attrs.author,
      }),
    },
    reason: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-reason"),
      renderHTML: (attrs: { reason: string | null }) =>
        attrs.reason ? { "data-reason": attrs.reason } : {},
    },
  };
}

export const SuggestionInsert = Mark.create({
  name: "suggestionInsert",
  addAttributes() {
    return sharedAttrs();
  },
  parseHTML() {
    return [{ tag: 'span[data-suggest="ins"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggest": "ins",
        class: "suggestion-ins",
      }),
      0,
    ];
  },
});

export const SuggestionDelete = Mark.create({
  name: "suggestionDelete",
  addAttributes() {
    return sharedAttrs();
  },
  parseHTML() {
    return [{ tag: 'span[data-suggest="del"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggest": "del",
        class: "suggestion-del",
      }),
      0,
    ];
  },
});

export type SuggestionPart = {
  type: "ins" | "del";
  from: number;
  to: number;
  text: string;
};

export type Suggestion = {
  sid: string;
  author: string;
  reason: string | null;
  parts: SuggestionPart[];
};

/** Walk the doc and group every suggestion mark range by its sid. */
export function collectSuggestions(editor: {
  state: { doc: import("@tiptap/pm/model").Node };
}): Suggestion[] {
  const bySid = new Map<string, Suggestion>();

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name !== "suggestionInsert" && mark.type.name !== "suggestionDelete")
        continue;
      const sid = (mark.attrs.sid as string) || "unknown";
      const type = mark.type.name === "suggestionInsert" ? "ins" : "del";
      let s = bySid.get(sid);
      if (!s) {
        s = {
          sid,
          author: (mark.attrs.author as string) || "claude",
          reason: (mark.attrs.reason as string) || null,
          parts: [],
        };
        bySid.set(sid, s);
      }
      s.parts.push({
        type,
        from: pos,
        to: pos + node.nodeSize,
        text: node.text || "",
      });
    }
  });

  // Merge adjacent same-type text runs and sort parts by position within a suggestion.
  const result = Array.from(bySid.values());
  for (const s of result) {
    s.parts.sort((a, b) => a.from - b.from);
  }
  // Sort suggestions by their first part's position so the panel reads top-to-bottom.
  result.sort((a, b) => (a.parts[0]?.from ?? 0) - (b.parts[0]?.from ?? 0));
  return result;
}

/**
 * Once a suggestion is resolved, the losing text is gone from the live
 * document for good — reading it back means diffing version snapshots.
 * Logging every resolution here instead gives the Suggestions panel a
 * "Resolved" history (what was proposed, what was kept, what was deleted)
 * without keeping dead prose in `content`, where it would otherwise get
 * counted into word counts and fed to the chapter-summary model.
 */
async function logResolution(
  documentId: string,
  suggestion: Suggestion,
  accept: boolean
) {
  const del = suggestion.parts.find((p) => p.type === "del")?.text ?? null;
  const ins = suggestion.parts.find((p) => p.type === "ins")?.text ?? null;
  const { error } = await supabase.from("albert_suggestion_log").insert({
    document_id: documentId,
    sid: suggestion.sid,
    action: accept ? "accepted" : "rejected",
    del_text: del,
    ins_text: ins,
    reason: suggestion.reason,
    author: suggestion.author,
  });
  if (error) console.error("Failed to log suggestion resolution:", error.message);
}

/**
 * Resolve one suggestion: `accept` keeps the insertion and drops the
 * deletion; rejecting does the opposite. Ranges are applied highest-position
 * first so earlier offsets in the same transaction stay valid.
 */
export async function resolveSuggestion(
  editor: import("@tiptap/react").Editor,
  suggestion: Suggestion,
  accept: boolean,
  documentId: string
) {
  const ranges = [...suggestion.parts].sort((a, b) => b.from - a.from);
  const tr = editor.state.tr;
  const insertMarkType = editor.schema.marks.suggestionInsert;
  const deleteMarkType = editor.schema.marks.suggestionDelete;

  for (const part of ranges) {
    const from = tr.mapping.map(part.from);
    const to = tr.mapping.map(part.to);
    const keepText = (part.type === "ins") === accept;
    if (keepText) {
      const markType = part.type === "ins" ? insertMarkType : deleteMarkType;
      tr.removeMark(from, to, markType);
    } else {
      tr.delete(from, to);
    }
  }

  editor.view.dispatch(tr);
  await logResolution(documentId, suggestion, accept);
}

export async function resolveAll(
  editor: import("@tiptap/react").Editor,
  accept: boolean,
  documentId: string
) {
  let suggestions = collectSuggestions(editor);
  // Resolve from the bottom of the doc up so positions stay valid across suggestions.
  while (suggestions.length) {
    const last = suggestions[suggestions.length - 1];
    await resolveSuggestion(editor, last, accept, documentId);
    suggestions = collectSuggestions(editor);
  }
}

export type ResolvedSuggestion = {
  id: string;
  sid: string;
  action: "accepted" | "rejected";
  del_text: string | null;
  ins_text: string | null;
  reason: string | null;
  author: string;
  resolved_at: string;
};
