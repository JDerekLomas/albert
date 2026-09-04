# 2026-09-04 (2): A test book with an answer key, and continuity as its own pass

Follow-on from `2026-09-04-heat-map-tooling-and-enigmas-index.md`. Shipped,
deployed, aliases verified fresh.

## Why

Derek asked for a scenario — a writer, an AI editor, a human editor — "just to
test it out". The point was not model accuracy. It was the shape of the
collaboration: who does what, where the handoffs break, and what the interface
gets wrong. Albert's manuscript can't answer that. One book, no answer key,
every experiment costs his real prose.

## The fixture

`sandbox/the-salt-line/` — three chapters of a memoir by Rosalie Kerr, who does
not exist. Bonneville salt flats, a father who times land-speed runs, a brother,
a mother who leaves. Ten planted defects, answer key in `GROUND-TRUTH.md`,
including **two false-positive traps**: a fragment-voice paragraph and a quiet
paragraph doing quiet work. Flagging either means the tool has started scoring
polish rather than need for work.

Ch1 is finished work with one thin paragraph. Ch2 is a working draft with a
planted voice/pacing/unclear/continuity cluster. Ch3 is 188 words where the
book's central event goes — the Ch14 problem, reproduced where it is safe to
study.

Seeded with `scripts/seed-sandbox.mjs` (book id `sandbox-salt-line`), NOT
`import-book.mjs` — see the open item below.

## What the first run found

8 of 10, zero false positives, **both continuity errors missed, every run**.

That was structural. "continuity" was a *category* on a pass that is only ever
handed one chapter, so a boy who is seven in Ch1 and eleven twenty months later
in Ch2 could not be seen by it. The legend advertised a check the tool could not
physically perform — the most valuable check an AI can do for a memoir, and it
was returning nothing, silently.

## What changed

- **Continuity is its own book-level pass** — `/api/continuity`,
  `scripts/check-continuity.mjs`, and a panel on the book page (a contradiction
  is a fact about a book, so it is shown where the book is). Reads every chapter
  uncompressed; summaries drop exactly the small facts contradictions are made
  of. **Now 2 of 2 planted, plus one real error nobody planted** (the kitchen
  packed in boxes in May vs. the mother packing for two weeks in the fall).
- **Three passes, merged.** Three runs of one pass returned three *different*
  sets of real findings — only the age error appeared in all of them. A single
  run shown as "the" list implies a completeness it hasn't got. Agreement is now
  displayed (`3/3`) instead of hidden, and merging recovers what one run drops.
- **A verdict on the chapter as a whole**, above the paragraph list. Ch3 now
  reads `UNWRITTEN — the core departure scene is missing from the page` with
  "write the four hours of that morning" — instead of five notes about the
  paragraphs standing in for it. This is the diagnosis the old tool structurally
  could not give.
- **Colour no longer encodes category.** It got the category wrong on a third of
  its correct findings, so a third of the page was confidently the wrong colour.
  Intensity now carries the one thing it is reliably right about (that a
  paragraph needs work, roughly how much); the category is a word in the list.
- **No percentages.** Findings are ranked 1..n. Scores clustered 0.4–0.9 and the
  printed number implied a precision that isn't there.
- **The author's bracketed notes get their own section.** They were scoring 0.90
  and sitting above every finding the pass had actually contributed.
- Prompts/schemas consolidated into `src/lib/editorial.mjs`, imported by both
  the routes and the scripts. They had already drifted apart.

## Bugs found by screenshotting the deploy, not by reading code

- The merge listed Danny's age **twice**, as `2/3` and `1/3` — passes cite the
  same conflict with different spans of evidence, and matching fixed-length
  quote prefixes split one finding in two. A fabricated disagreement is worse
  than no merging: it makes a certainty look contested. Fixed with containment
  matching (`eccdd3c`).

Same lesson as Wednesday: every real UI bug this week was found by taking a
screenshot. Playwright + Chromium live in `~/sourcelibrary/node_modules`, and
the *script* must live in that directory too — node resolves packages from the
script's own path, not the cwd.

## Act three: the human editor's loop

Played end to end on sandbox Ch2. The AI editor proposed three edits drawn from
the tool's own findings — Danny nine not eleven (continuity pass), cut the
geology digression (heat map, pacing), name the referents in Ray's line (heat
map, unclear). Clean diff shape, no churn warning: `+13w / -144w` across one
deletion and two word-level edits.

The human editor accepted the first two and **rejected the third**, because the
AI had quietly invented an action — "and then he drove home without him" is not
in the source. That is the failure mode `notes/workflow.md` warns about, and it
happened on the very first pass written against this fixture. The rejected
prose was restored byte-for-byte, apostrophe included.

Three real bugs fell out of playing it, none visible by reading the code:

1. **The review card showed only the first span of a suggestion.**
   `collectSuggestions` returns a sentence rewrite as several alternating
   del/ins runs, and both the card and the resolution log took `.find()` — the
   first. A five-span rewrite rendered as `He → Ray` while the prose showed the
   whole change. The reviewer was clicking Accept on something they had not
   been shown.
2. **The same truncation was in the resolved log**, which is worse than
   cosmetic: that log exists so rejected prose stays recoverable, and the
   rejected twelve-word rewrite was stored as `del: "He" / ins: "Ray"`.
   Confirmed against the live table before fixing.
3. **Accepting a whole-paragraph deletion left an empty `<p></p>`** — a blank
   gap in the prose that can't be clicked into, and that the next suggest pass
   then diffs against. The CLI path stripped these; the browser path did not, so
   the same accept produced a different document depending on where you clicked.
   Fixed by removing only the blocks that transaction emptied.

Also fixed: the pass-level reason was printed on every card, so a reviewer
reading "Continuity: Danny is nine in spring 1989" above an unrelated sentence
rewrite was being misled about why that edit existed. Shown once now, as the
pass.

**Correction to the first half of this handoff:** suggestions *do* carry
provenance — the card shows an author (`CLAUDE`) and the log stores it. What
doesn't exist is any differentiated treatment: an AI's guess and a human
editor's line edit look identical and review identically.

## The book map

`/b/<bookId>` now opens with the manuscript seen from above, because the
structural question — where is this book — had no surface at all.

Most of it costs nothing. Length, open `[bracketed]` questions, pending
suggestions, open comments, dialogue share, scene breaks, part balance,
median/longest/shortest are all computed from the HTML on render
(`src/lib/book-stats.ts`): free, exact, never stale, and none of it was
surfaced anywhere before. The model's chapter verdict is the only stored piece
— `albert_chapter_verdicts`, filled by `POST /api/assess-book`, stale on read
the moment the prose moves under it. Chapters with pending suggestions are
skipped rather than scored half-reviewed (2 of 22 on the memoir).

**Chapter state is drawn as a diverging scale**, not five categorical hues.
That was forced, not chosen: the dataviz palette validator hard-failed five
hues across red/orange/yellow because "sketch" and "draft" sit 9.6 ΔE apart in
*normal* vision. The failure was the useful part — it says the data is one
ordered axis with polarity (nothing written ↔ finished), and a warm pole,
neutral midpoint and cool pole says that honestly.

What the map showed on the first look at the real memoir, none of which anyone
had asked it: 92,374 words, ~369 pages, Part 1 carrying 32% against Part III's
20%. And **Ch14 "The Question" is simultaneously the shortest chapter (1,196w),
the least-spoken (7% of paragraphs contain dialogue, tied lowest), and the most
commented (12 open)** — the chapter this repo already knows is the problem,
now falling out of the numbers without anyone needing the backstory.

Note: the memoir's Ch14 came back `draft`, where the fixture's equivalent
(188 words) came back `unwritten`. 1,196 words is not nothing, so that is
defensible, but it means the state axis is less sensitive than the fixture
suggested.

## Open, not resolved

- **`import-book.mjs:119` deletes every row in `albert_documents`**, not just
  the book being imported. It predates multi-book. Running it for any second
  book destroys the memoir. Not fixed because it is Albert's import path and
  deserves its own careful change; `seed-sandbox.mjs` shows the scoped pattern.
- **The heat map is still single-pass and still stochastic.** Two runs of the
  identical code disagreed on categories and on which quiet paragraphs to flag —
  including one run that flagged both false-positive traps and another that
  flagged neither. Continuity got multi-pass merging; assess did not. Same fix
  probably applies.
- **The planted `unclear` defect is caught inconsistently** — labelled "thin" in
  two runs, correctly "unclear" (naming the unresolved "her") in a third.
- **Provenance exists but does nothing.** Author is recorded and displayed; an
  AI's guess and a human editor's line edit still review identically. Whether
  they should differ (default action, ordering, a "this one invented a detail"
  check) is a design question, not a bug.
- **Nothing checks a suggestion against the source before a human sees it.** The
  invented "drove home without him" would have been caught by the rule already
  written in `notes/workflow.md` — name the sentence each suggested line is
  modelled on — but no code enforces it. A pre-flight pass that flags added
  facts with no anchor in the chapter would have caught it before review.
- The `--book` flag now works across `chapter.mjs`, `assess-chapter.mjs` and
  `check-continuity.mjs`. `pull` and the git-divergence checks are memoir-only
  by design (nothing else is mirrored in `manuscript/`).

## State

Working tree clean, `main` pushed. Deployed as `albert-j017ufwbz`, all three
aliases repointed and verified. Sandbox book live and seeded; Albert's memoir
untouched throughout.
