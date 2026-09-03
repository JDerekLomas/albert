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

2. **The web editor (needs the Supabase keys fixed — see below).** TipTap editor +
   version history + clickable diff restore + comments panel, already built in this
   repo. That's the one for Albert, who is not going to run git.

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

## Tactics
- **Chapter-at-a-time.** One chapter, one conversation, one diff. Don't let me touch
  seven chapters in a turn.
- **Keep the bracketed-query convention.** `[like this]` in the text = an open
  question. `grep -rn "\[" manuscript/` is the to-do list.
- **Scratchpad before prose.** Ideas go in `notes/scratchpad.md` first. Only things
  that survive that holding pen get written into a chapter.
- **Voice guardrail.** Before any suggested line, I should be able to point at an
  existing sentence of Albert's it's modelled on.

## Blocker: the Supabase keys are dead
The web editor can't read or write the manuscript right now. Supabase disabled
legacy `anon` / `service_role` API keys on 2026-06-01; both keys in `.env.local`
return `{"message":"Legacy API keys are disabled"}`. Fix is four clicks in the
dashboard — steps are in the session notes / ask Claude.
