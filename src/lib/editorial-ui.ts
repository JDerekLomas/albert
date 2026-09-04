/**
 * Typed view of the labels in editorial.mjs.
 *
 * The prompts and their vocabulary live in plain .mjs so a bare `node` script
 * and a Next route can share one copy (see the note at the top of that file).
 * This is the seam where that untyped module meets TSX: index signatures, so a
 * component can look up a label by a category string without a cast at every
 * call site.
 */
import {
  CATEGORIES as RAW_CATEGORIES,
  CATEGORY_HELP as RAW_HELP,
  CATEGORY_LABEL as RAW_LABEL,
  CHAPTER_STATES as RAW_STATES,
  CHAPTER_STATE_HELP as RAW_STATE_HELP,
} from "./editorial.mjs";

export const CATEGORIES: string[] = RAW_CATEGORIES;
export const CATEGORY_LABEL: Record<string, string> = RAW_LABEL;
export const CATEGORY_HELP: Record<string, string> = RAW_HELP;
export const CHAPTER_STATES: string[] = RAW_STATES;
export const CHAPTER_STATE_HELP: Record<string, string> = RAW_STATE_HELP;
