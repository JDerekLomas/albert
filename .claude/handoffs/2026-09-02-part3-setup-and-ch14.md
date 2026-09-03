# Handoff — Albert Lin memoir, Part III workspace + Chapter 14

**Date:** 2026-09-02
**Session did:** infrastructure only. No manuscript prose was written or changed.
**Next session should:** start writing, beginning with Chapter 14 "The Question".

---

## Why this project exists

Derek is helping Albert Lin write his memoir. The book covers Albert's life as a
National Geographic explorer — the search for Genghis Khan's tomb, losing his leg,
the *Lost Cities* series, and his son Charlie's TBI recovery.

Derek is not the author. Albert's voice is the entire asset of the book. Derek's
job — and therefore Claude's job — is to help Albert get his own material onto the
page, not to produce prose that reads like it was generated. Read
`notes/workflow.md` before touching any chapter; the rules there are not optional.

---

## The one rule

**Never silently rewrite prose.** Every change arrives as a diff Derek reads before
it becomes the text. He asked for this explicitly and more than once:

> "I don't want you changing everything, I need to see the changes"
> "I need to be able to directly edit when you save"

Two mechanisms deliver that. Both work right now.

### 1. Text-in-git — the review surface
`manuscript/part3/*.txt` — one plain-text file per chapter, one paragraph per line.
Source was `~/Downloads/PART_III 2.txt` (Albert's Sep 2 2026 draft). Committed clean
at `326660e` so every later edit shows as a diff.

- see changes word-by-word: `git diff --word-diff=color`
- undo everything Claude did: `git checkout -- manuscript/`
- one chapter's history: `git log -p manuscript/part3/ch14-the-question.txt`

Chapters present: ch12 The Holy Lands (2,052w) · ch13 The Door in the Mountain
(1,764w) · ch14 The Question (1,197w) · ch15 He'e Nalu – Wave Riders (4,168w) ·
ch16 The Desert (3,434w) · ch17 The Cloud Warriors (2,869w) · ch18 The Axis Mundi
(3,447w). Plus `00-part-opener.txt` (part title + María Sabina epigraph).

### 2. The web editor — the surface for Albert
**https://albert-book.vercel.app** — TipTap editor, version history, clickable diff
restore, comments panel. This is the one Albert uses; he is not going to run git.

Conventions already live in the editor: **yellow blocks** (`#fef3c7`) are questions
for Albert, **purple blocks** (`#ede9fe`) are episode questions. In the plain-text
files the equivalent is `[bracketed text]`. `grep -rn "\[" manuscript/` is the
open-questions list.

---

## Credentials — solved, do not re-investigate

This cost the session an hour. Write it down once:

**The Albert book and sourcelibrary share ONE Supabase project** (`ykhxaecbbxaaqlujuzde`).
Supabase disabled legacy `anon`/`service_role` keys on 2026-06-01, which silently
killed the Albert editor. But Derek had already migrated that project to the new
`sb_publishable_…` / `sb_secret__…` format for sourcelibrary, so working keys were
sitting in `~/sourcelibrary/.env.production.local` the whole time.

Now fixed and verified: `albert/.env.local` has the new keys, they are stored in
secret-lover under project `albert` (`secret-lover verify` passes), Vercel production
env vars were replaced, and the app was redeployed. Verified two ways — REST returns
real chapters, and the deployed bundle carries `sb_publishable_` with no legacy JWT.

Dead end, don't retry: `SUPABASE_ACCESS_TOKEN (sourcelibrary)` in secret-lover is a
valid-format PAT that returns Unauthorized. Revoked. Removed from albert's manifest.

---

## OPEN DECISION — do not import anything until Derek answers

The database is the **April 2026 structure**. The new Part III draft is a
**renumbering**, not an update. They do not line up:

| # | Database (April) | New draft (Sep 2) |
|---|---|---|
| 12 | El Robotico | The Holy Lands |
| 13 | The Sound of the River | The Door in the Mountain |
| 14 | Wayfinder | **The Question** |
| 17 | El Dorado | The Cloud Warriors |
| 18 | (Refin) | The Axis Mundi |

The new draft compresses into ch12–18 what the DB spreads across ch-12…ch-22 —
"The Cloud Warriors" moves 20→17, "The Axis Mundi" 21→18. The DB has months of
version history under the old numbers.

Three options put to Derek, unanswered as of this handoff:
1. Import Part III as *new* documents alongside the old, retire the old by hand
2. Import over ch-12…ch-18 after snapshotting a version of each first
3. Leave the DB alone, work in `manuscript/part3/` until the restructure settles

Claude's recommendation was (3), since the draft is still moving. **Nothing has been
written to Supabase.**

---

## Chapter 14 "The Question" — the live piece of work

The Cambridge chapter. Albert is invited to give a Darwin College Lecture on the
theme of enigmas, in his father's world, in the city where he was made to feel he
didn't belong as a boy. It ends on the question, deliberately unanswered:

> *What is the source of imagination? What does it all draw from?*

The next line is "The next day, the world shut down. Covid."

**The source material is in the repo.** Derek co-wrote, with Albert, the published
chapter this scene is about:

> Albert Y.-M. Lin & J. Derek Lomas, **"The Enigma of Mind: A Theory of Evolution
> and Conscious Experience"**, in *Enigmas* (Darwin College Lectures 2020,
> eds. Ward & Reuvers, Cambridge University Press, 2022), ch. 8.

Full extracted text: `reference/enigma-of-mind-lin-lomas.txt` (17,216 words).
Originals: `~/Desktop/published papers/08 Enigmas Proofs - Lin and Lomas.pdf`,
`~/Documents/Digital Editions/Enigmas.pdf` (whole volume),
`~/dereklomas-site/public/papers/enigma-of-mind.pdf`.

Its thesis — the answer the memoir chapter withholds. Evolution needs variation,
replication, and selection; the paper argues all three operate inside the mind:
1. **variation via imagination** — synthetic imagination; altered states as a
   plasticity engine; the uneven geography of psychoactive plants as a driver of
   cultural diversity
2. **replication via sympathy** — sympathetic resonance as a pre-linguistic copying
   mechanism; mirror neurons; hyperscanning; Mayan bloodletting as a
   resonance-maximising cultural form
3. **selection via harmonisation** — harmony as fitness function in the competition
   for attention; Plato meets Darwin (both Darwin and Wallace used the word)

**Note the overlap:** the paper opens on the *same* Mongolia shaman night Albert
tells in the memoir — his field notes, July 18 2011, 12:50 am. The memoir and the
academic paper already share a spine. A real editorial decision sits there: does
Ch 14 quote the field notes, or stay in memoir voice and let the paper exist
offstage? Ask Albert.

Also worth noticing: "We have built our cultures in the shape of doors" hinges
directly back to the stone door in the Andes in Ch 13. If that's deliberate it's
one of the strongest structural moves in Part III.

---

## Open bracketed queries in the text

Two, both in Ch 12:
- `[where?]` — on Acre, where Albert first meets the *Lost Cities* crew
- `[What created the spiritual power of these sacred lands -- and how did it relate
  to all the others? …]` — an unresolved thought, not prose

---

## Files this session created

```
manuscript/part3/          ch12–ch18 + part opener, from the Sep 2 draft
reference/                 enigma-of-mind-lin-lomas.txt
notes/scratchpad.md        idea holding pen — ideas go here before they become prose
notes/workflow.md          the AI-use rules; read before editing
.secrets.json              secret-lover manifest for project "albert" (gitignored)
```

Commits: `326660e` (workspace + reference + notes), `0279533` (gitignore).

One incident worth knowing: while writing the env file, a stray `cd` caused
`~/sourcelibrary/.env.local` to be briefly overwritten. A backup had been made in
the same command and it was restored within seconds — sourcelibrary is verified back
at its full 53 lines / 51 variables. Mentioned only so nobody chases a ghost.
