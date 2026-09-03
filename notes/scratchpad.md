# Scratchpad — Albert Lin memoir

Living notes. Derek + Claude both write here. Nothing here is manuscript text;
this is the holding pen for ideas before they earn a place in a chapter.

## How we work (see notes/workflow.md)
- Manuscript lives as plain text in `manuscript/`. Every change I make is a git diff Derek can read.
- I never overwrite a chapter silently. Proposed edits land as a diff; Derek accepts, edits, or rejects.

## Open threads

### Ch 14 "The Question" — the Cambridge / Darwin Lecture chapter
The chapter currently ends on the question, unanswered:
*What is the source of imagination? What does it all draw from?*

Source material we actually have (Derek co-wrote it): the published chapter
**"The Enigma of Mind: A Theory of Evolution and Conscious Experience"**,
Albert Y.-M. Lin & J. Derek Lomas, in *Enigmas* (Darwin College Lectures 2020,
eds. Ward & Reuvers, CUP 2022). Full text: `reference/enigma-of-mind-lin-lomas.txt`.

Its actual thesis, in case the chapter wants to gesture at it rather than only ask:
evolution needs three things — variation, replication, selection — and all three
run inside the mind:
1. **variation via imagination** (synthetic imagination; altered states as a
   plasticity/variation engine; the uneven geography of psychoactive plants as a
   driver of cultural diversity)
2. **replication via sympathy** (sympathetic resonance as a pre-linguistic
   copying mechanism; mirror neurons; hyperscanning; Mayan bloodletting as a
   resonance-maximising cultural form)
3. **selection via harmonisation** (harmony as fitness function in the competition
   for attention — Plato meets Darwin; both Darwin and Wallace used the word)

Note the chapter's opening scene is the same Mongolia shaman night Albert tells in
the memoir (field notes, July 18 2011, 12:50 am) — so the memoir and the academic
paper already share a spine. Worth deciding deliberately: does Ch 14 quote the
field notes, or does it stay in memoir voice and let the paper exist offstage?

Questions for Albert:
- How much of the actual Darwin Lecture content does he want on the page? Right
  now the lecture is one paragraph of quote ("Imagination is not an individual
  gift...").
- The "doors" image ("We have built our cultures in the shape of doors") is the
  hinge into Ch 13's stone door in the Andes. Is that deliberate? It's strong.

### Part III revision status
`manuscript/part3/` = the version from `~/Downloads/PART_III 2.txt` (Sep 2 2026).
It supersedes `PART_III.txt`. Notable changes in the new draft: Part title changed
from "THE DOOR" to "Beyond the Threshold"; Acre scene reordered so the AR iPad
comes before the call to prayer; several bracketed author queries left in
(e.g. `[where?]`, the Acre spiritual-power note) — those are open questions, not text.

## Bracketed queries still live in the text
Search: `grep -rn "\[" manuscript/part3/`

---

## Ch14 revision plan (2026-09-03) — expansion pass

Purpose the chapter is serving, as inferred: the hinge of Part 3 and the summit of
the father thread. The boy who was made to feel he didn't belong in Cambridge
returns to his father's world, stands in the hall, and states the question the
rest of the book answers in lived form rather than argument.

Diagnosis: at 1,191 words it is by far the shortest chapter in the book (neighbours
run 4,000–8,000). It skips the thing it exists for — the lecture is one paragraph
carrying one third of the argument, the room never reacts, and it ends on a hard
cut to Covid.

Moves, all sourced — nothing invented:
1. **Popper.** The first Darwin Lecture was Karl Popper's "Natural Selection and
   the Emergence of Mind", arguing selection operates inside the conscious mind —
   "the greatest marvel of our universe". Grounds "a storied stage" and answers the
   imposter question with a fact: he was continuing that first sentence, not
   visiting. Source: reference/enigma-of-mind-lin-lomas.txt L242–262.
2. **The whole argument, not a third of it.** Restore the three legs he actually
   published — variation via imagination, replication via sympathy/resonance,
   selection via harmony — and let him admit he could only stand on the first.
   That admission is what makes Part 4 the answer: he had *lived* resonance and
   harmony without being able to prove them. Source: L289–341, L979–1043, L1443ff.
3. **The concrete enigma.** The litany ("each ecology had grown its own tools") has
   a hard number behind it: 200+ hallucinogenic plant species in the Americas,
   one-tenth as many across all Eurasia and Africa, and the imbalance is itself an
   unsolved problem. That is an actual enigma for a lecture on enigmas. Source: L674–722.
4. **Name the father.** Douglas Lin. Never appears anywhere in the manuscript;
   appears in the published dedication.
5. **End on the dedication, not on Covid.** Two years later the chapter appeared in
   print dedicated "to our respective fathers, Douglas Lin and Robert Lomas". Robert
   Lomas is Bob from Ch05 — the dowser who promised Albert a fish before Mongolia.
   The fish is the book's spine (Ch01 Millie, Ch05 the trout, Ch07 Millie again
   hours before the accident, Ch22 "There was something on the other end").
   Source: L2012–2015.
6. **Bracketed queries** for everything only Albert has: the room, whether anyone
   asked a question, whether his father heard it, what the walk out was like.
   I do not have this material and will not invent it.

Voice guardrail applied: litany fragments modelled on the existing "Drums on a
sacred mountain in Mongolia." run; retrospect ("It would surface in me for years",
Ch13) licenses the forward-looking handoff to Part 4.

Delivery: one suggestion pass via scripts/suggest-chapter.mjs. Albert's existing
sentences are preserved verbatim wherever possible so the diff is additive.
