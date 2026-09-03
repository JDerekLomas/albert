# Writing tools + AI strategy for the memoir

## The core rule
**Claude never silently rewrites prose.** Every change arrives as a diff Derek reads
before it becomes the text. Two mechanisms give us that:

1. **Text-in-git (works today, no credentials).** `manuscript/part3/*.txt` — one file
   per chapter, plain text, one paragraph per line. Any edit I make shows up in
   `git diff` word-by-word. Derek reviews, edits by hand in any editor, commits or
   throws away with `git checkout -- <file>`.
   - see the change: `git diff` (or `git diff --word-diff=color` for word-level)
   - undo everything I did: `git checkout -- manuscript/`
   - a chapter's whole history: `git log -p manuscript/part3/ch14-the-question.txt`

2. **The web editor.** TipTap editor + version history + clickable diff restore +
   comments panel, already built in this repo. That's the one for Albert, who is
   not going to run git. As of 2026-09-02 it also has a **Suggestions panel**:
   `node scripts/suggest-chapter.mjs --chapter <N> <revised.txt> --reason "..."`
   diffs a revised draft against the live chapter and writes the changes back as
   pending insertion/deletion marks — visible inline (green/red) and in the
   Suggestions sidebar — instead of overwriting the chapter directly. Nothing is
   final until Derek or Albert clicks Accept/Reject (or Accept all/Reject all).
   The script snapshots a pre-suggestion version first, so `git`-style rollback
   still exists even for changes made this way. See
   `notes/tool-research.md` for the design rationale and
   `src/lib/suggestion-marks.ts` / `scripts/suggest-chapter.mjs` for the
   implementation.

## Division of labour — what AI is actually good for here
Ranked by how much value it adds to a memoir, most to least:

**High value — do this**
- *Retrieval and grounding.* Finding the Enigmas chapter, pulling Albert's own field
  notes, checking a date, a name, a spelling of a place. The book's authority comes
  from the details being right.
- *Continuity checking.* Charlie is nine in Ch 12 and ten in Ch 15 — does that hold?
  Does an image planted in Ch 3 pay off in Ch 18? A machine is genuinely better at
  this than a tired human.
- *Question-asking.* Marking the places where a reader will want more and the draft
  goes quiet. The yellow-highlight convention already in the editor.
- *Structural options.* "Here are three ways to order this section" — as a menu, not
  as a replacement.
- *Mechanical passes.* Splitting files, converting formats, finding every bracketed
  `[query]` still open in the draft.

**Low value — resist this**
- Generating memoir prose. It flattens voice instantly and Albert's voice is the
  entire asset. When I do draft a line, it should be marked as a suggestion in a
  diff, never merged straight in.
- "Polishing." Most of what an LLM calls polish is homogenisation. The odd
  constructions ("We filmed in jungles rivers, deserts") are often the human part.

## Before you propose prose — the checklist

Written after a bad pass on Ch14 on 2026-09-03. Every item is here because it was
skipped that day.

1. **Read the source all the way through, not the summary.** The session read about
   half of `reference/enigma-of-mind-lin-lomas.txt` and wrote the lecture scene from
   the summary page. Result: flat paraphrase ("feelings copy… the way a string will
   sound when you pluck its twin") while the unread sections held drums answering each
   other across a room, Durkheim's clan "vibrating sympathetically", and a Maya glyph
   for conjuring a vision that is *a fish held in a hand* — in a book whose spine is a
   fish. The material always beats the paraphrase. Start at
   `reference/enigma-of-mind-INDEX.md`, then read the actual lines.
2. **Check every added fact against the text.** That pass invented a detail about
   Albert's father's field, moved Bob Lomas's map scene to the wrong night, and made up
   an audience size for Jamie's IMAX show. Use `chapter.mjs ref <n> "phrase"` — it
   folds the PDF's ligatures, so a plain grep for "fish" that returns nothing is a
   false negative, not an absence.
3. **Audit the diff's shape before handing it to a human**: `chapter.mjs suggestions
   <n>`. A pass can be semantically fine and still unreviewable. That day it marked
   494 words deleted to make 8 words of edits, because a one-word change was rendered
   as delete-the-paragraph/insert-the-paragraph. Watch for the CHURN warning.
4. **Count what you are adding.** 844 words of my prose into a 1,191-word chapter is
   not an edit, it is a co-write, and nobody asked for one. If the honest diagnosis is
   "this chapter is thin because Albert hasn't written the room yet", the deliverable
   is a bracketed question, not filler in his voice.
5. **Name the sentence of Albert's each suggested line is modelled on.** If you can't,
   don't suggest the line.

## Tactics
- **Chapter-at-a-time.** One chapter, one conversation, one diff. Don't let me touch
  seven chapters in a turn.
- **Keep the bracketed-query convention.** `[like this]` in the text = an open
  question. `grep -rn "\[" manuscript/` is the to-do list.
- **Scratchpad before prose.** Ideas go in `notes/scratchpad.md` first. Only things
  that survive that holding pen get written into a chapter.
- **Voice guardrail.** Before any suggested line, I should be able to point at an
  existing sentence of Albert's it's modelled on.

