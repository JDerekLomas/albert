import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Editorial heat map, drawn as ProseMirror decorations rather than marks.
 *
 * The distinction matters: marks would be written into the document and saved
 * to Supabase, so an editorial opinion would become part of the manuscript.
 * Decorations are a view-layer overlay — they tint what the writer sees and
 * touch nothing that gets stored.
 */

export type Passage = {
  index: number;
  score: number;
  category: string;
  note: string;
  quote?: string;
};

/** The altitude above the paragraph. Some chapters don't have a paragraph
 *  problem — they have a "this isn't written yet" problem, and no amount of
 *  per-paragraph tint says that. */
export type ChapterVerdict = {
  state: "unwritten" | "sketch" | "draft" | "working" | "finished";
  headline: string;
  diagnosis: string;
  next_action: string;
};

export const passageHeatKey = new PluginKey<PassageHeatState>("passageHeat");

type PassageHeatState = {
  passages: Passage[];
  active: boolean;
  focused: number | null;
  /** Tint the paragraphs that are already working. Off by default: in a decent
   *  chapter most paragraphs are fine, so filling them all turns the page into
   *  a wash and the few real problems stop standing out. */
  includeStrong: boolean;
};

/**
 * Three hues, for three KINDS of thing — not seven, one per category.
 *
 * Colour used to encode the category, which put the least reliable field in the
 * loudest channel: on a test fixture the model got the category wrong on a
 * third of its correct findings, so a third of the page was confidently the
 * wrong colour. What it is reliably right about is *that* a paragraph needs
 * attention and roughly how much — so that is what the tint carries now, as
 * intensity. The category is still shown, as a word, where being wrong is
 * cheap and legible.
 */
const HUE: Record<string, string> = {
  attention: "24 95% 53%", // orange — needs work; intensity carries how much
  query: "45 93% 47%", // amber — the author's own open question, not a finding
  strong: "160 84% 39%", // green — working; protect it
};

function hueFor(category: string) {
  return HUE[category] ?? HUE.attention;
}

export function heatColor(category: string, score: number, alphaScale = 1) {
  const hue = hueFor(category);
  // "strong" and "query" are information, not severity: keep them flat and
  // faint whatever the score, so intensity only ever means "needs work".
  const intensity =
    category === "strong" ? 0.1 : category === "query" ? 0.16 : 0.08 + score * 0.34;
  return `hsl(${hue} / ${(intensity * alphaScale).toFixed(3)})`;
}

export function heatBorder(category: string) {
  return `hsl(${hueFor(category)} / 0.85)`;
}

export const PassageHeat = Extension.create({
  name: "passageHeat",

  addProseMirrorPlugins() {
    return [
      new Plugin<PassageHeatState>({
        key: passageHeatKey,
        state: {
          init: () => ({ passages: [], active: false, focused: null, includeStrong: false }),
          apply(tr, value) {
            const meta = tr.getMeta(passageHeatKey) as Partial<PassageHeatState> | undefined;
            return meta ? { ...value, ...meta } : value;
          },
        },
        props: {
          decorations(state) {
            const s = passageHeatKey.getState(state);
            if (!s?.active || !s.passages.length) return DecorationSet.empty;

            const byIndex = new Map(s.passages.map((p) => [p.index, p]));
            const decorations: Decoration[] = [];
            let paraIndex = 0;

            state.doc.descendants((node, pos) => {
              if (node.type.name !== "paragraph") return true;
              const p = byIndex.get(paraIndex++);
              if (!p) return false;
              const isFocused = s.focused === p.index;
              // Working paragraphs stay untinted unless asked for, so the page
              // shows where the work IS rather than highlighting everything.
              if (p.category === "strong" && !s.includeStrong && !isFocused) return false;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: `passage-heat${isFocused ? " passage-heat-focused" : ""}`,
                  style: [
                    `background-color:${heatColor(p.category, p.score)}`,
                    `box-shadow:inset 3px 0 0 0 ${heatBorder(p.category)}`,
                    isFocused ? `outline:2px solid ${heatBorder(p.category)}` : "",
                  ]
                    .filter(Boolean)
                    .join(";"),
                  title: `${p.category} · ${Math.round(p.score * 100)}% — ${p.note}`,
                  "data-passage-index": String(p.index),
                }),

              );
              return false; // paragraphs don't nest
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/** Push heat state into the view without touching the document. Dispatching a
 *  transaction that only carries meta leaves the doc — and therefore what gets
 *  saved to Supabase — completely unchanged. */
export function setPassageHeat(
  editor: import("@tiptap/react").Editor,
  patch: Partial<PassageHeatState>
) {
  editor.view.dispatch(editor.view.state.tr.setMeta(passageHeatKey, patch));
}
