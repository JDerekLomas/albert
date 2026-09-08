import Highlight from "@tiptap/extension-highlight";

/**
 * The default highlight, plus one attribute: `data-query="1"`, the mark the
 * importer puts on Albert's [bracketed notes] (open questions, fact checks,
 * "better quote here"). The book map counts those marks to show open
 * questions per chapter; without this attribute being declared, TipTap
 * dropped it on the first browser save and every chapter's count fell to
 * zero as soon as someone looked at it.
 */
export const QueryHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      query: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-query"),
        renderHTML: (attrs: { query: string | null }) =>
          attrs.query ? { "data-query": attrs.query } : {},
      },
    };
  },
});
