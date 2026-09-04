# 2026-09-04: Editorial heat map, chapter tooling, Enigmas index

Follow-on from `2026-09-03-suggestion-diff-fix-and-editorial-features.md`.
All shipped and deployed; `albert-book.vercel.app` alias verified fresh.

## The correction that shaped the session

I proposed an 844-word expansion of Ch14 and Derek's response was *"why is it so
bad... can you read the enigmas? and why such big chunks?"* All three parts were
fair and had different causes. Recorded in `notes/workflow.md` ("Before you
propose prose") and in auto-memory `albert-read-the-whole-source`.

1. I read ~half of the 17k-word Enigmas chapter and wrote from its summary page.
   The paraphrase was flat while the unread sections held far better material.
2. The diff *looked* like a rewrite because of a real bug (below), not only volume.
3. 844 words of AI prose into a 1,191-word chapter is a co-write nobody asked
   for. The chapter is thin because Albert hasn't written the room yet; the right
   deliverable there is a bracketed question, not filler in his voice.

**The draft was withdrawn.** Ch14 is back to Albert's exact text — verified
against git, 0 accepted / 93 rejected in the suggestion log.

## The best find in the repo

`reference/enigma-of-mind-INDEX.md` (new) indexes the published Darwin Lecture
chapter: section map with line anchors, the argument in brief, 22 concrete facts
each with a line number, and a table of where the paper and memoir touch.

Top of that list, from a section the earlier pass never read: **the Maya glyph
*tzak*, "conjure (in the context of vision)", is written as a fish held in a left
hand** (source L1425), read by Stuart as a metaphor for grasping the ineffable —
in a book whose spine is a fish (Ch01 Millie, Ch05 Bob's trout, Ch07, Ch22's last
line). Second: accelerating shamanic drumming converges on 4 Hz / 240 bpm across
unconnected traditions (L498) — the mechanism under Ch14's three-drum litany.
**Any future Ch14 attempt should be small and built on one of these**, not on
volume.

## Shipped

**`scripts/chapter.mjs`** — one command for the editing loop; loads `.env.local`
itself. `status` (pending/comments/git-sync/index-staleness/corruption), `read`
(`--accepted`/`--raw`), `diff`, `suggest`, `suggestions` (audits a pass's SHAPE —
**always run before asking a human to review**), `reject-all`, `accept-all`,
`pull`, `ref` (searches the Enigmas text with line numbers; folds PDF ligatures,
so a plain grep for "fish" is a false negative).

**Suggestion diff fix.** Paragraph and sentence pairing required delete- and
insert-runs of *equal length*, so any revision that adds paragraphs beside edited
ones deleted and re-inserted whole paragraphs — 494 words marked removed to
deliver 8 words of edits. Replaced with `alignByOverlap()`, a monotonic DP
alignment. Same draft: 494 → 50 words removed.

**Editorial heat map** — `Heat` button. Scores every paragraph 0–1 for how much
editing it needs; tints the prose (opacity = score, hue = category). Drawn as
ProseMirror **decorations, not marks**, so an editorial opinion never enters the
manuscript. Computed on demand (`/api/assess`), so it cannot go stale. Paragraphs
that are already working are not tinted and are hidden from the list by default —
tinting all 28 washed the page out and buried the real problems. Clicking a
tinted paragraph selects its finding. CLI equivalent: `scripts/assess-chapter.mjs`
(prints only).

**Chapter index panel** rebuilt as three tabs — Outline (beats clickable, jump to
the matching paragraph), Context, Notes (rendered as a document; holds the Ch14
structural diagnosis).

## Fixed along the way

- `reject-all` left empty `<p></p>` shells that the next pass diffed against.
- Suggestion-mark **attribute order is not stable**: this repo's scripts write
  `data-suggest` first, TipTap rewrites it after `data-sid` once a human opens the
  chapter. Anything anchored on `<span data-suggest=` silently matches nothing.
- Index staleness compared ISO timestamps as strings; Postgres returns `+00:00`,
  `toISOString()` writes `Z`, and `+` sorts before `Z`.
- Heat toggle closed itself (a regex sweep matched its own handler); Index and AI
  toggles didn't close Heat, so two panels crushed the editor.

**Screenshotting the deploy with Playwright found every UI bug above.** None were
visible by reading the code. Playwright + Chromium live in `~/sourcelibrary/node_modules`;
run the script from that directory. Use `waitUntil: "domcontentloaded"` —
`networkidle` never settles because of the realtime websocket.

## DDL access — fixed, but the stored secret is still wrong

`db.<ref>.supabase.co` has **no A record, only IPv6**, and this machine has no
IPv6 egress, which surfaces as a misleading `ENOTFOUND`. Region resolved from the
AAAA address against AWS's `ip-ranges.json` → eu-west-1; shard is `aws-1`, not
`aws-0`. Working form:

```
postgresql://postgres.ykhxaecbbxaaqlujuzde:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
```

Verified against PostgreSQL 17.6 and used to run DDL. **`SUPABASE_DB_URL` in
sourcelibrary's secret-lover still holds the dead direct host** — left alone
because it is a shared secret. Swapping the host and user restores DDL for any
session. (An `albert_passage_notes` table was created during this and is
currently unused; the heat map computes on demand instead.)

## Open, not resolved

- **Ch22 carries real corruption.** An earlier hand-rolled script wrote an
  unescaped `data-reason` containing a quote; the attribute terminated early and
  `…on this pass).">` became part of the sentence near *I told him, "I can't lose
  you again."* It survives **both accept and reject**, so no amount of clicking
  clears it. `chapter.mjs status 22` shows it. Only chapter affected of 22. Left
  alone: it is the final chapter and another session's 4 suggestions are pending
  in the same paragraph. git has the correct text.
- **12 comments on Ch14 are mine.** Derek's note — *"organize views… in a way
  where it isn't just a comment"* — means the comment dump was the wrong vehicle.
  The substance now lives in the Notes tab and the Enigmas index. They can be
  cleared.
- The heat tint is tied to the panel being open; closing the panel clears the
  shading. Fine, but a separate toggle would let you read with tint on and the
  panel closed.

## State

Working tree clean, `main` pushed, deployed and alias-verified. Ch14: Albert's
original text, 0 pending suggestions, index fresh, in sync with git.
