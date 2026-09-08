# Handoff — editorial work on "The Door in the Mountain" (Albert's Sept 7 draft)

**Goal:** work on the text of Albert Lin's newest draft, imported 2026-09-07 as its own book.
**Definition of done:** whatever pass you're asked for lands as *reviewable suggestions* in the
live chapters (never applied prose), audited with `suggestions`, and git is left in sync.

## Where things are
- Book id `door-in-the-mountain` — https://albert-book.vercel.app/b/door-in-the-mountain
- Chapters: `https://albert-book.vercel.app/d/door-in-the-mountain-ch-NN` (zero-padded); part
  openers `…-part-N`.
- Git mirror (source of truth): `manuscripts/door-in-the-mountain/part{1-4}/chNN-slug.txt`.
  Imported cleanly; `chapter.mjs status` reports "git in sync: yes" on every chapter.
- The OLDER draft is a separate book, `albert-lin-memoir` (Sept 2 drop), with Derek's Ch14
  work and comments in flight. Leave it alone; don't confuse the two.

## The loop (read CLAUDE.md "Working with the Manuscript" first)
```bash
node scripts/chapter.mjs --book door-in-the-mountain status 19
node scripts/chapter.mjs --book door-in-the-mountain read 19 -o draft.txt
node scripts/chapter.mjs --book door-in-the-mountain diff 19 draft.txt
node scripts/chapter.mjs --book door-in-the-mountain suggest 19 draft.txt --reason "..."
node scripts/chapter.mjs --book door-in-the-mountain suggestions 19   # ALWAYS, before a human reviews
node scripts/chapter.mjs --book door-in-the-mountain pull 19          # after Albert/Derek accept, then commit
```
`--book` is required: the script's default is still the older book. Never write `content`
directly; `suggest` is the only way edits reach a chapter.

## What's different in this draft (vs the memoir you may have read about)
- **Chapter 14 ("The Question") is gone.** Part III runs 12, 13, 15, 16, 17, 18. Where its
  material went (or whether it's coming back) is unknown — ask Derek before assuming.
  `reference/enigma-of-mind-INDEX.md` still matters for Ch13/Ch18/Part IV.
- Chapter 10 is now "El Robotico". Part IV is ~2,400 words shorter than before.
- Chapter 1 is a prologue: in Albert's file the Part I title page comes *after* it. The
  importer lifted that title/epigraph into the Part I opener doc.
- Text carries book typography now (curly quotes, … ellipses). Drafts you write for `suggest`
  should use the same, or the diff will churn on every quote mark. `read -o` gives you the
  live text already in that form — start from it.

## Albert's notes convention
`[bracketed text]` is Albert's own margin note (open question, fact check, "better quote").
Rendered as amber note blocks; the book map counts them as "open questions" (29 total). Some
carry `[[CHECKED. …]]` replies from an earlier fact-check pass that Albert folded into his
file — those are answers waiting to be acted on, e.g. Ch19's Tibetan Book of the Dead
passage and Ch22's *Let Your Mind Run* title. Two brackets in the prose (Ch1 ambulance
scene, Ch6 Charlie's birth) are unclosed typos, rendered as literal text.

## Don't redo
Importing, formatting, quote conversion, the part-opener extraction — all done and deployed.
No book index yet for this book; if you need synthesis questions answered, run
`secret-lover run -- node scripts/summarize-chapter.mjs --book door-in-the-mountain --all`
then `reindex-book.mjs --book door-in-the-mountain`.
