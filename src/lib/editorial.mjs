/**
 * The editorial passes — prompts, schemas and the Gemini call — in one place.
 *
 * The heat map used to exist twice: once in src/app/api/assess/route.ts and
 * once in scripts/assess-chapter.mjs, with a comment in each asking the next
 * person to keep them identical. They had already started to drift. This module
 * is plain .mjs (tsconfig has allowJs) precisely so both a Next route and a
 * bare `node` script can import the same text.
 *
 * Two passes, deliberately separate:
 *
 *   assess     — one chapter. What does this paragraph need, and what does the
 *                chapter as a whole need?
 *   continuity — the whole book at once. Does it contradict itself?
 *
 * They were one pass until 2026-09-04, when a test fixture with two planted
 * cross-chapter errors caught both being missed 100% of the time: "continuity"
 * was a category on a pass that is only ever shown a single chapter, so the
 * legend advertised a check the tool could not physically perform. Continuity
 * is a property of a book, not of a paragraph.
 */

export const GEMINI_MODEL = "gemini-3-flash-preview";

/** Per-paragraph categories. NB: no "continuity" — see the note above. */
export const CATEGORIES = ["thin", "unclear", "pacing", "voice", "query", "strong"];

export const CATEGORY_LABEL = {
  thin: "Thin",
  unclear: "Unclear",
  pacing: "Pacing",
  voice: "Voice",
  query: "Author's note",
  strong: "Working",
};

export const CATEGORY_HELP = {
  thin: "Narrated in summary where it should be dramatised",
  unclear: "The reader can't resolve who or what is meant",
  pacing: "Stalls or rushes relative to its weight",
  voice: "Generic literary prose rather than this writer",
  query: "The author's own open question — not an editorial finding",
  strong: "Already working — protect it",
};

/** Chapter-level states, worst to best. The altitude above the paragraph. */
export const CHAPTER_STATES = ["unwritten", "sketch", "draft", "working", "finished"];

export const CHAPTER_STATE_HELP = {
  unwritten: "The material this chapter exists to deliver is not on the page",
  sketch: "The shape is there; most of the scenes are not",
  draft: "It's all here and it needs work",
  working: "Solid — targeted fixes only",
  finished: "Leave it alone",
};

export const ASSESS_SCHEMA = {
  type: "object",
  properties: {
    chapter: {
      type: "object",
      properties: {
        state: { type: "string", enum: CHAPTER_STATES },
        headline: {
          type: "string",
          description: "At most 12 words. The chapter's condition, stated flatly.",
        },
        diagnosis: {
          type: "string",
          description:
            "At most 45 words. What is actually wrong (or right) at the level of the whole chapter, not any one paragraph.",
        },
        next_action: {
          type: "string",
          description:
            "At most 25 words. The single highest-leverage next move, addressed to the author. If the chapter is unwritten, the action is to write the missing scene — never to edit what is there.",
        },
      },
      required: ["state", "headline", "diagnosis", "next_action"],
    },
    passages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "The paragraph index, exactly as given." },
          score: {
            type: "number",
            description:
              "0 to 1. A RANKING within this chapter, not a grade: the most urgent paragraph should sit near 1.0 and the least urgent flagged one near 0.2. Use the range. 'strong' is always below 0.15; 'query' is always 0.",
          },
          category: { type: "string", enum: CATEGORIES },
          note: {
            type: "string",
            description:
              "One sentence, at most 25 words, naming the specific problem and what would fix it. Concrete, never praise. For 'strong', say what is working so it is protected.",
          },
        },
        required: ["index", "score", "category", "note"],
      },
    },
  },
  required: ["chapter", "passages"],
};

export const ASSESS_SYSTEM = `You are a developmental editor reading ONE chapter of a literary memoir.

You have two jobs.

JOB A — a verdict on the chapter as a whole. Pick a state:
- unwritten: the material this chapter exists to deliver is not on the page. Summary is standing in for the scene.
- sketch: the shape is there, most of the scenes are not.
- draft: it is all here and it needs work.
- working: solid; targeted fixes only.
- finished: leave it alone.
Then say the one thing that would most improve it. If the honest diagnosis is that the author has not written the room yet, say exactly that and do NOT recommend paragraph-level edits — polishing summary into better summary is not the fix, and neither is filling the gap with someone else's prose.

JOB B — a heat map: for EVERY paragraph, how much attention does it need, and why?

Choose the most specific category:
- thin — a significant moment narrated in summary; the reader is told rather than shown. Use this whenever the defect is told-not-shown, even if the paragraph also reads fast.
- pacing — the time spent is wrong for the weight: a digression that stalls the scene, or a transition that rushes. Only when the problem is duration, not summary.
- unclear — the reader cannot resolve who or what is meant. Check that every he/she/it/they has exactly one possible antecedent; ambiguous speakers belong here, not in "thin".
- voice — generic literary prose rather than this writer: abstraction, cliché, received phrasing ("in that moment I realised", "a mirror held up to", "vast and shimmering"). NEVER use it for prose that is merely rough. Fragments, odd constructions and unpolished syntax are the writer's voice and are not errors.
- query — the paragraph contains a bracketed [note to the author] or a highlighted question. This is the AUTHOR's own note, not a finding of yours: score it 0 and simply restate what they are asking themselves.
- strong — this is working. Score it low and say what is working, so a later pass does not sand it off.

Rules:
- The writer's voice is the entire asset. Never flag prose for being unpolished and never suggest making it smoother or more formal.
- Score the WRITING'S NEED FOR WORK, not the importance of its subject. A quiet paragraph doing its job scores low.
- Spread the scores. If everything is 0.6, the map is useless.
- Do NOT judge continuity or cross-chapter consistency. You are seeing one chapter out of a book; a separate pass reads all of them together and owns that question.
- Return exactly one entry per paragraph index given, in order.`;

export const CONTINUITY_SCHEMA = {
  type: "object",
  properties: {
    contradictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "At most 10 words naming the conflict." },
          chapters: {
            type: "array",
            items: { type: "integer" },
            description: "Every chapter number involved.",
          },
          confidence: { type: "string", enum: ["certain", "likely", "possible"] },
          detail: {
            type: "string",
            description:
              "At most 40 words: what each chapter asserts and why they cannot both be true. Show the arithmetic for dates and ages.",
          },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                chapter: { type: "integer" },
                quote: { type: "string", description: "The exact conflicting phrase, verbatim." },
              },
              required: ["chapter", "quote"],
            },
          },
          fix: { type: "string", description: "At most 20 words. What to change, and where." },
        },
        required: ["title", "chapters", "confidence", "detail", "evidence", "fix"],
      },
    },
    ledger: {
      type: "array",
      description:
        "Facts the book asserts more than once: people's ages, dates, places, names, colours, the state of things. Only entries appearing in two or more chapters.",
      items: {
        type: "object",
        properties: {
          subject: { type: "string" },
          kind: { type: "string", enum: ["person", "date", "place", "object", "fact"] },
          consistent: { type: "boolean" },
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                chapter: { type: "integer" },
                value: { type: "string", description: "At most 12 words." },
              },
              required: ["chapter", "value"],
            },
          },
        },
        required: ["subject", "kind", "consistent", "entries"],
      },
    },
  },
  required: ["contradictions", "ledger"],
};

export const CONTINUITY_SYSTEM = `You are the continuity editor on a book-length memoir. You are given every chapter, in order, in full. Your job is to find the places where the book contradicts itself — the errors the author cannot see, because they wrote each chapter on a different day and remember what they meant rather than what they wrote.

Work in this order. Before judging anything, reconstruct the book's timeline: every chapter, the date or season it takes place in, and who is how old in it. Then place every factual claim the book makes onto that timeline and check it against what the timeline already says. Most contradictions are invisible pairwise and obvious once the chronology is written down — especially claims about the state of the world, which are always attached to a date even when the sentence doesn't mention one.

Look hardest at:
- Ages and dates. DO THE ARITHMETIC. If someone is seven in a chapter set in the summer of 1987, they are nine in the spring of 1989, not eleven. This is the most common defect in a memoir and the least visible to its author.
- The state of the world. Something established as gone, dried, sold, demolished or dead cannot be present later without explanation.
- Physical facts: colours, names, spellings, weather, who was in the room, what was said.
- Promises. An image or object planted early and never paid off, and a payoff that lands with no setup.

Rules:
- Quote the conflicting phrases VERBATIM from the text you were given. Never paraphrase evidence.
- Do not report a difference the narrative itself explains, and do not report a change that is obviously the passage of time.
- Do not report style, repetition, or anything you would say in a line edit. Contradiction only.
- Deliberate repetition of a motif is not a contradiction. In particular, when the narrator explicitly compares two things — says one is like the other, or is the same as the other — that is an echo the author built, and describing them in different words is craft, not error. Never ask for two images to be made identical.
- If you are not certain, still report it, but mark confidence honestly. A false alarm the author dismisses in five seconds is cheaper than a missed one that reaches print.
- Then build the ledger: the recurring facts and their value in each chapter, so the author can see the book's own record at a glance.`;

/** Paragraph text in document order, matching the Nth <p> node in the editor. */
export function paragraphs(html) {
  const out = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html))) {
    const text = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    out.push({ index: i++, text });
  }
  return out;
}

export async function callGemini(system, userText, schema, { retries = 3 } = {}) {
  let lastErr = "";
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userText }] }],
            systemInstruction: { parts: [{ text: system }] },
            generationConfig: { responseMimeType: "application/json", responseSchema: schema },
          }),
        }
      );
    } catch (e) {
      // The socket drops often enough on long book-level calls that treating a
      // transport failure as fatal made the pass look broken when it wasn't.
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt === retries) throw new Error(`Gemini transport error: ${lastErr}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return JSON.parse(text);
      lastErr = "empty response";
    } else {
      lastErr = `${res.status}: ${(await res.text()).slice(0, 300)}`;
    }
    if (attempt === retries) throw new Error(`Gemini error ${lastErr}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

/**
 * Run the continuity pass several times and merge the results.
 *
 * Not belt-and-braces: on a 1,400-word fixture, three runs returned three
 * *different* sets of real contradictions, with only the arithmetic error
 * appearing in all of them. One pass shown as "the" list quietly implies a
 * completeness it doesn't have. Merging turns that instability into the useful
 * signal instead — how many independent readings agreed — and recovers the
 * findings a single run drops.
 *
 * Passes are independent, so they run concurrently; the whole book is one
 * prompt and the cost is a fraction of a cent.
 */
export async function runContinuity(bookText, { passes = 3 } = {}) {
  const results = await Promise.allSettled(
    Array.from({ length: passes }, () =>
      callGemini(CONTINUITY_SYSTEM, bookText, CONTINUITY_SCHEMA)
    )
  );
  const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) {
    const why = results[0]?.reason;
    throw new Error(why instanceof Error ? why.message : "Every continuity pass failed");
  }

  // Two findings are the same finding if they name the same chapters and rest
  // on at least one of the same quotes. Titles are freely worded, so they can't
  // be the key. Neither can the full quote set: passes cite the same conflict
  // with different amounts of supporting text, so requiring the sets to match
  // listed Danny's age twice, as "2/3" and "1/3", which is worse than not
  // merging at all — it invents a disagreement that never happened.
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const fingerprint = (c) => ({
    chapters: [...new Set(c.chapters || [])].sort((a, b) => a - b).join(","),
    quotes: (c.evidence || []).map((e) => norm(e.quote)).filter(Boolean),
  });

  // Containment, not equality. One pass cites "Danny was seven that summer";
  // another cites "Danny was seven that summer... That was the summer of 1987"
  // as a single run of evidence. Comparing fixed-length prefixes called those
  // two different findings and printed the same age error twice, as 2/3 and
  // 1/3 — a fabricated disagreement, which is worse than not merging at all.
  const HEAD = 24;
  const sameQuote = (a, b) =>
    a === b || (b.length >= HEAD && a.includes(b.slice(0, HEAD))) ||
    (a.length >= HEAD && b.includes(a.slice(0, HEAD)));
  const overlaps = (a, b) =>
    !a.quotes.length || !b.quotes.length || a.quotes.some((q) => b.quotes.some((r) => sameQuote(q, r)));

  const RANK = { certain: 0, likely: 1, possible: 2 };
  const groups = [];
  for (const pass of ok) {
    // A pass can repeat itself; count each finding once per pass.
    const claimed = new Set();
    for (const c of pass?.contradictions || []) {
      const fp = fingerprint(c);
      const hit = groups.find(
        (g) => !claimed.has(g) && g.fp.chapters === fp.chapters && overlaps(fp, g.fp)
      );
      if (!hit) {
        const g = { fp, item: { ...c, agreed: 1 } };
        groups.push(g);
        claimed.add(g);
        continue;
      }
      claimed.add(hit);
      hit.item.agreed++;
      // Widen the fingerprint so a later pass quoting either span still lands here.
      hit.fp.quotes.push(...fp.quotes);
      // Keep the best-evidenced wording of a finding several passes agree on.
      const better =
        (RANK[c.confidence] ?? 3) < (RANK[hit.item.confidence] ?? 3) ||
        ((RANK[c.confidence] ?? 3) === (RANK[hit.item.confidence] ?? 3) &&
          (c.evidence || []).length > (hit.item.evidence || []).length);
      if (better) Object.assign(hit.item, c, { agreed: hit.item.agreed });
    }
  }

  const contradictions = groups
    .map((g) => g.item)
    .sort((a, b) => b.agreed - a.agreed || (RANK[a.confidence] ?? 3) - (RANK[b.confidence] ?? 3));

  // The ledger is a description of the book rather than a judgement about it,
  // so it doesn't need merging — take the fullest one.
  const ledger = ok
    .map((p) => p?.ledger || [])
    .sort((a, b) => b.length - a.length)[0]
    .filter((l) => (l.entries || []).length >= 2);

  return { contradictions, ledger, passes: ok.length, requestedPasses: passes };
}

/** Clamp and drop anything the model invented, so the UI never renders a
 *  paragraph index that doesn't exist or a category with no colour. */
export function normalizeAssessment(parsed, paras) {
  const byIndex = new Map(paras.map((p) => [p.index, p.text]));
  const passages = (parsed?.passages || [])
    .filter((p) => byIndex.has(p.index))
    .map((p) => {
      const category = CATEGORIES.includes(p.category) ? p.category : "unclear";
      return {
        index: p.index,
        // The author's own bracketed notes are not editorial findings and must
        // not compete with them for the top of the list.
        score: category === "query" ? 0 : Math.max(0, Math.min(1, Number(p.score) || 0)),
        category,
        note: String(p.note || "").slice(0, 300),
        quote: (byIndex.get(p.index) || "").slice(0, 140),
      };
    });

  const c = parsed?.chapter;
  const chapter = c
    ? {
        state: CHAPTER_STATES.includes(c.state) ? c.state : "draft",
        headline: String(c.headline || "").slice(0, 120),
        diagnosis: String(c.diagnosis || "").slice(0, 400),
        next_action: String(c.next_action || "").slice(0, 200),
      }
    : null;

  return { chapter, passages };
}
