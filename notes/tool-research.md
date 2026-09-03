# Research: the ideal AI-suggestion review tool for the memoir (2026-09-02)

Question: what should we use so that Claude's edits are ergonomic to emit and
pleasant for Derek/Albert to review? Three research passes: products, tech stack,
editorial workflows. Full agent reports summarized here.

## The headline findings

1. **The industry converged on Derek's rule in 2026.** Microsoft (Copilot in Word,
   GA June 2026) and Google (Gemini in Docs, July 2026) both retrofitted their AI
   from "overwrite" to "land as tracked changes / suggestions." The accept/reject-
   one-change-at-a-time model is the norm; reuse it, don't invent a new one.
2. **Word Track Changes + margin author queries (AQ1, AQ2…) is still the trade
   publishing default.** Any workflow must reproduce its two primitives: an inline
   change you accept/reject individually, and a comment anchored to a span.
3. **Raw git diffs are the wrong review surface for prose** (Ink & Switch
   "Upwelling" study: https://www.inkandswitch.com/upwelling/). Ideal presentation:
   sentence/phrase-level chunks with word-level highlights inside, deletions
   de-emphasized, edits grouped into reviewable units — never character confetti.
4. **No consumer writing product accepts programmatic suggestions from an external
   agent** (Lex, Sudowrite, Novelcrafter, Type.ai — all closed). The exceptions:
   - **Revise.io** (https://revise.io/, launched Aug 2026): every AI edit is an
     accept/reject suggestion, imports/exports real Word redlines, and exposes an
     **MCP server** for external agents. Brand new, adoption unproven. Free tier;
     Plus $8/mo.
   - **Google Docs API** now has `writeMode: SUGGEST` but it's Developer
     Preview-gated — not dependable yet.
   - People fake this today with browser automation (Interface0,
     https://andybromberg.com/interface0-google-docs) because they don't own their
     editor. **We own ours.**

## The three architectures for our TipTap editor

**A. Marks-in-doc suggestions, open source (RECOMMENDED).** Insertion/deletion
marks stored inside the chapter HTML itself — pending suggestions ride in the same
Supabase column, survive Albert opening the doc, need no new tables.
- Library candidates (evaluate, keep one):
  - https://github.com/handlewithcarecollective/prosemirror-suggest-changes (MIT;
    BlockNote ships a production fork — strongest signal)
  - https://github.com/sungkhum/tiptap-track-changes (MIT, TipTap-native, young)
- Server side: Claude's contract is just "return the revised chapter text." A Node
  script fetches current HTML → paragraph-pairs + word-diffs (jsdiff `diffWords`
  or @sanity/diff-match-patch with semantic cleanup) → emits del/ins marks with
  `{id, author:'claude', reason}` → snapshots a version → writes back.
  https://github.com/sueddeutsche/prosemirror-recreate-transform is the
  doc-to-doc-steps fallback.
- Diff quality rules: pair paragraphs first, then word-diff inside; merge adjacent
  tiny edits into phrase-level suggestions; if a sentence is >~60% rewritten show
  one delete+insert pair. Reviewers accept 6 phrase suggestions, reject 40
  one-character ones.
- Effort ~3–5 days. Risks: <v1 libraries (MIT, vendorable), marks × formatting
  interactions, strip unresolved marks on export.

**B. Suggestion queue in a side table.** Claude emits explicit edits
(`{before_context, delete, insert, reason}` or CriticMarkup) into an
`albert_suggestions` table; editor anchors them by context matching.
https://github.com/bsachinthana/tiptap-diff-suggestions is an existing MIT
extension in this shape. Better audit trail, but anchor-drift handling and two
sources of truth. Can be layered on A later. ~4–6 days.

**C. Buy TipTap's official Tracked Changes + AI Toolkit.** Fastest (1–2 days) and
exactly the feature — but paid plan + two "contact sales" add-ons (~$249/mo for
Tracked Changes alone per https://eddyter.com/blogs/tiptap-pricing-explained-2026,
private npm registry, live API churn). ~$3k+/yr for a two-user single-book tool.
Only sensible if this becomes a product.

## Export path (verified working on this machine)

pandoc 3.9 converts markdown with classed spans
(`[word]{.insertion author="Claude"}` / `[word]{.deletion}`) into a .docx with
**real** `w:ins`/`w:del` tracked changes — opens with native Accept/Reject in
Word, LibreOffice, Google Docs. So the same marks that power the web UI export as
genuine redlines when Albert's agent/publisher wants a .docx. Also:
https://github.com/AnsonLai/docx-redline-js, https://pypi.org/project/docx-revisions/.

## Workflow ideas to adopt regardless of build

- **Numbered author queries.** Keep yellow/purple blocks but structure them:
  `AQ-014 (ch14): …` with open/resolved status, extractable across chapters.
  This is the trade-standard AQ queue.
- **CriticMarkup as Claude's plain-text wire format** (`{++ins++}`, `{--del--}`,
  `{~~old~>new~~}`, `{>>AQ: comment<<}`) in the git lane and notes — human-readable
  raw, parses mechanically (~50 lines) into suggestion marks. Treat it as a wire
  format, not an architecture (ecosystem is stagnant; iA Writer went its own way).
- **One sentence per line** in `manuscript/part3/*.txt` (semantic line breaks,
  https://sive.rs/1s) — localizes git diffs, makes terminal review tolerable
  meanwhile.

## Decision

Recommended: Architecture A in the existing editor, + AQ numbering, + CriticMarkup
in the git lane, + pandoc redline export when needed. Revise.io is worth a
15-minute trial as the buy-option benchmark before committing to the build.

Status: awaiting Derek's call. (Full agent reports were session-scoped; this file
is the record.)
