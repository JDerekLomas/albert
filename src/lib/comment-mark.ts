import { Mark, mergeAttributes } from "@tiptap/core";
import { Editor } from "@tiptap/react";

/**
 * Anchors a comment to the text it's actually about, instead of only
 * matching it by a `quote` string in the side panel. Renders as a
 * highlight (amber = open, muted = resolved) so a comment shows up where
 * it applies, not just in a floating list — click it to jump to the panel
 * entry.
 */
export const CommentHighlight = Mark.create({
  name: "commentHighlight",
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-comment-id"),
        renderHTML: (attrs: { commentId: string | null }) =>
          attrs.commentId ? { "data-comment-id": attrs.commentId } : {},
      },
      resolved: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-resolved") === "true",
        renderHTML: (attrs: { resolved: boolean }) => ({
          "data-resolved": attrs.resolved ? "true" : "false",
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "comment-highlight" }),
      0,
    ];
  },
});

/** Wrap a range with a comment-highlight mark for the given comment id. */
export function applyCommentMark(
  editor: Editor,
  from: number,
  to: number,
  commentId: string
) {
  if (from === to) return;
  editor
    .chain()
    .setTextSelection({ from, to })
    .setMark("commentHighlight", { commentId, resolved: false })
    .run();
}

/** Remove the comment-highlight mark everywhere it references this comment id (unwraps the text, doesn't delete it). */
export function removeCommentMark(editor: Editor, commentId: string) {
  const { doc } = editor.state;
  const markType = editor.schema.marks.commentHighlight;
  if (!markType) return;
  const tr = editor.state.tr;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name === "commentHighlight" && mark.attrs.commentId === commentId) {
        tr.removeMark(pos, pos + node.nodeSize, markType);
      }
    }
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

/** Flip the `resolved` attr on every span for this comment id, without touching the text. */
export function setCommentMarkResolved(
  editor: Editor,
  commentId: string,
  resolved: boolean
) {
  const { doc } = editor.state;
  const markType = editor.schema.marks.commentHighlight;
  if (!markType) return;
  const tr = editor.state.tr;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name === "commentHighlight" && mark.attrs.commentId === commentId) {
        tr.removeMark(pos, pos + node.nodeSize, markType);
        tr.addMark(
          pos,
          pos + node.nodeSize,
          markType.create({ commentId, resolved })
        );
      }
    }
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

/** Scroll the anchored span for this comment into view and flash it. */
export function scrollToCommentMark(editor: Editor, commentId: string) {
  const el = editor.view.dom.querySelector(
    `[data-comment-id="${commentId}"]`
  ) as HTMLElement | null;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("comment-highlight-flash");
  setTimeout(() => el.classList.remove("comment-highlight-flash"), 1200);
}
