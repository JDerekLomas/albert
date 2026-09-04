# The Salt Line — synthetic test manuscript

**This is not anybody's book.** Rosalie Kerr does not exist; the three chapters in this
directory were written as a test fixture for the editorial tooling in this repo, so that
the heat map, the suggestion pipeline and the review loop can be exercised against prose
whose flaws are *known in advance*. Albert's manuscript can't do that job: there is no
answer key, so a plausible assessment is indistinguishable from a correct one.

Book id `sandbox-salt-line`. It lives in the same Supabase tables as the memoir but is a
separate `book_id`, and `scripts/seed-sandbox.mjs` only ever touches rows with that id.

## The scenario

- **The writer** — Rosalie Kerr, three chapters into a memoir about growing up on the
  Bonneville Salt Flats. Ch1 is finished work. Ch2 is a working draft with real problems.
  Ch3 is the chapter she can't write yet — the one the book is actually about.
- **The AI editor** — the heat map (`/api/assess`, `scripts/assess-chapter.mjs`) and the
  suggestion pipeline (`scripts/suggest-chapter.mjs`).
- **The human editor** — accepts or rejects in the browser. Nothing the AI proposes
  becomes prose without a click.

## Answer key

Paragraph indices are 0-based over `<p>` nodes, matching what `assess` reports as `¶N+1`.

### Chapter 1 — The Timing Shack (8 paragraphs)

| ¶ | Planted | What it is |
|---|---------|------------|
| 0 | clean (strong) | Opening image, doing its job |
| 1 | clean (strong) | The clocks; character through ritual |
| 2 | clean (strong) | Danny, **age 7, summer 1987** — the anchor for the Ch2 continuity error |
| 3 | **thin** | The record falling — the chapter's biggest event, disposed of in one summary sentence |
| 4 | clean (strong) | The car's sound; the book's best paragraph |
| 5 | clean | Mother's one line. Also a **diff stress case**: sentence ends `.\"` |
| 6 | clean — **false-positive trap** | Fragments ("Into film, back when there was film.") are the voice, not errors |
| 7 | **query** | Bracketed note to self |

### Chapter 2 — The Year of the Water (8 paragraphs)

| ¶ | Planted | What it is |
|---|---------|------------|
| 0 | clean | Opening, sets spring 1989 |
| 1 | **continuity** | "Danny was eleven that spring" — he was 7 in summer 1987, so 9 here |
| 2 | **voice** | Flattened, cliché, abstract: "In that moment, I came to understand", "a mirror held up to", "vast and shimmering expanse". This is what AI prose does to a memoir |
| 3 | **pacing** | 130 words of Pleistocene geology stalling the scene dead |
| 4 | **unclear** | "He told him he'd never forgive him for what he did to her" — four pronouns, three possible referents |
| 5 | clean (strong) | The truck-through-water sound; pays off Ch1 ¶4 |
| 6 | clean — **false-positive trap** | A quiet paragraph doing quiet work. Should score LOW |
| 7 | clean (strong) | Close. Correctly calls back "on the wall in pencil" from Ch1 ¶1 — a **true** callback the tool should not flag as continuity |

### Chapter 3 — What I Didn't Say (4 paragraphs)

| ¶ | Planted | What it is |
|---|---------|------------|
| 0 | **thin** | The central event of the book, entirely in summary, ending on "it affected all of us in different ways" |
| 1 | **thin** | More summary; years compressed into abstraction |
| 2 | **query** | The author says outright she can't write it yet |
| 3 | **continuity** | "The salt was still wet that year when she went" — Ch2 ¶7 says the water was gone by July; she left in the fall |

### Scoring

- 20 paragraphs total: **10 clean** (2 of them explicit false-positive traps), **10 planted defects**
- thin ×3, continuity ×2, voice ×1, pacing ×1, unclear ×1, query ×2
- The cheapest failure to look for is not a miss — it's **flagging ¶6 of either chapter**,
  which would mean the tool is scoring polish rather than need for work.
