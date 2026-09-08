# Handoff — editorial work on "The Door in the Mountain"

**Goal:** work on the text of Albert Lin's memoir draft, imported 2026-09-07 as book
`door-in-the-mountain`. Read it fresh, on its own terms.
**Definition of done:** whatever pass you're asked for lands as *reviewable suggestions* in the
live chapters (never applied prose), audited with `suggestions`, and git is left in sync.

## Where things are
- Book map: https://albert-book.vercel.app/b/door-in-the-mountain
- Chapters: `https://albert-book.vercel.app/d/door-in-the-mountain-ch-NN` (zero-padded); part
  openers `…-part-N`.
- Git mirror (source of truth): `manuscripts/door-in-the-mountain/part{1-4}/chNN-slug.txt`.
  Imported cleanly; `chapter.mjs status` reports "git in sync: yes" on every chapter.
- Other books exist in the same database. Only this one is yours; pass its id everywhere.

## The loop (read CLAUDE.md "Working with the Manuscript" first)
```bash
node scripts/chapter.mjs --book door-in-the-mountain status 19
node scripts/chapter.mjs --book door-in-the-mountain read 19 -o draft.txt
node scripts/chapter.mjs --book door-in-the-mountain diff 19 draft.txt
node scripts/chapter.mjs --book door-in-the-mountain suggest 19 draft.txt --reason "..."
node scripts/chapter.mjs --book door-in-the-mountain suggestions 19   # ALWAYS, before a human reviews
node scripts/chapter.mjs --book door-in-the-mountain pull 19          # after Albert/Derek accept, then commit
```
`--book` is required: the script's default is a different book. Never write `content`
directly; `suggest` is the only way edits reach a chapter.

## The text as it stands
- Chapter numbering and part structure are Albert's own, exactly as he delivered them.
  Chapter 1 sits before the Part I title page in his file; the importer put that title page
  in the Part I opener doc, so the map shows Chapter 1 as Part I's first chapter.
- The text carries book typography (curly quotes, … ellipses). Drafts you write for
  `suggest` should use the same, or the diff will churn on every quote mark. `read -o` gives
  you the live text already in that form — start from it.
- `[bracketed text]` is Albert's own margin note (open question, fact check, "better quote").
  Rendered as amber note blocks; the book map counts them as "open questions". Some carry
  `[[CHECKED. …]]` replies folded into his file — those are answers waiting to be acted on.
  Two brackets in the prose (Ch1 ambulance scene, Ch6 Charlie's birth) are unclosed typos,
  rendered as literal text.

## Don't redo
Importing, formatting, quote conversion, the part-opener extraction — all done and deployed.
No book index yet for this book; if you need synthesis questions answered, run
`secret-lover run -- node scripts/summarize-chapter.mjs --book door-in-the-mountain --all`
then `reindex-book.mjs --book door-in-the-mountain`.
