# 2026-09-03: Suggestion diff fix, resolved-history log, chapter index, anchored comments

## What shipped (deployed, live at albert-book.vercel.app)

1. **Fixed "confetti" diffs** in `scripts/suggest-chapter.mjs` — heavily-rewritten
   sentences were producing dozens of tiny alternating del/ins fragments instead of
   one clean replacement. Fix reuses the same tokenDiff-based equal/delete/insert
   alignment already used for paragraphs, now applied at the sentence level too.
   Verified against real Ch12 data (2 suggestions, 4 clean spans, no confetti).
   Commit `3f5826c`.

2. **Resolved-suggestion history** — accepting/rejecting a suggestion now logs to a
   new `albert_suggestion_log` table. Suggestions panel shows a collapsible
   "Resolved" section (same pattern as Comments' show-resolved toggle) so deleted
   text is recoverable without diffing version snapshots. Doesn't touch live
   `content`, so word counts / chapter summaries aren't polluted with dead prose.

3. **Chapter outline + editorial notes** — `summarize-chapter.mjs` now generates a
   5-12 beat `outline` array alongside the existing synopsis/themes/entities.
   New `outline` and `editor_notes` columns on `albert_chapter_summaries`
   (`editor_notes` is freeform, never touched by regeneration — upsert only
   writes columns present in the payload). New `ChapterIndexPanel.tsx` component
   surfaces all of it in the editor (new "Index" toolbar button), with a
   staleness banner when the chapter changed since the index was last built.

4. **Anchored inline comments** — new `commentHighlight` TipTap mark
   (`src/lib/comment-mark.ts`). Comments now wrap the actual selected text
   (amber highlight, dims when resolved) instead of only matching a floating
   `quote` string with `from_pos`/`to_pos` hardcoded to 0. Click a highlight to
   open the panel; click a comment's quote to scroll back to the text.

Commit `589af64`. DB migration (new columns + `albert_suggestion_log` table with
permissive RLS) already applied directly via `SUPABASE_DB_URL` — no pending
migration to run.

## Real bug found while testing (fixed, not just noted)

Testing on Chapter 22 (the final chapter) surfaced a genuine data-loss bug from
the original import: the sentence `I told him, "I can't lose you again."`
(manuscript/part4/ch22-the-boy-and-the-butterfly.txt line 351) had collapsed to
a stray `<p>"</p>` in the live Supabase document — the rest of the sentence was
just gone. Confirmed it was isolated to this one paragraph (285 source prose
paragraphs vs 284 live, off by exactly one) rather than chapter-wide corruption,
so no full re-import was needed. Restored it as a suggestion (sourced from the
git manuscript, not invented) rather than a direct write.

**Not yet investigated**: *why* this happened — likely something in
`split-manuscript.mjs`'s paragraph parser mishandling a paragraph that opens
with `I told him, "..."`. Worth a spot-check across other chapters if this
pattern (dialogue-attribution paragraph starting right before a quote) recurs,
but I did not do a full-book audit — this was a one-off catch, not a proof the
rest of the book is clean.

**Follow-up (later on 2026-09-03, commit `1386361`)**: a bug with this exact
signature was found and fixed in `suggest-chapter.mjs` — `splitSentences`
silently dropped text whenever terminal `.!?` was followed by a closing quote
or marker instead of whitespace, which is precisely how `I told him, "I can't
lose you again."` collapses to a bare `"`. **It is not the cause of the Ch22
loss**, though: Ch22 had no `Before AI suggestions` version predating the
corruption, so nothing had run this code on it. Two independent instances of
the same failure mode; the import path remains unexplained. A full-book audit
was done this time — all 22 live chapters were compared against the git
manuscript and scanned for orphan-fragment paragraphs, and nothing else is
damaged.

## Left for Albert, not resolved by me

Posted as a comment on Ch22 (not a suggestion — this is a judgment call about
the literal last words of the book, not mine to make): the chapter/book appears
to have two unreconciled endings. `"There was something on the other end."`
reads as the real, earned close. Everything after it — a bracketed
note-to-self starting `[Recovery, is becoming...`, then a near-verbatim repeat
of the "many names" passage that already appears earlier in the chapter — reads
like leftover draft material from an earlier pass. Flagged with a
recommendation (end on the fish taking the line, cut the rest) but left for
Albert's own call.

## State

Working tree clean, `main` up to date with origin, deployed and alias-verified
(`albert-book.vercel.app` created timestamp confirmed fresh). No open threads,
no pending migrations, no uncommitted work.
