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
- **Suggestions still have no provenance.** In a three-party workflow, an edit
  proposed by the AI and one proposed by a human editor are visually identical in
  the panel, and plausibly deserve different defaults on review.
- The scenario's third act was not played: nobody has run a `suggest` pass
  against the sandbox and accepted/rejected it in the browser. The writer and AI
  editor roles are exercised; the human editor's loop is not.

## State

Working tree clean, `main` pushed. Deployed as `albert-j017ufwbz`, all three
aliases repointed and verified. Sandbox book live and seeded; Albert's memoir
untouched throughout.
