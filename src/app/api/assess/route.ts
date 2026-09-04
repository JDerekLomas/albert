import { NextRequest } from "next/server";

const GEMINI_MODEL = "gemini-3-flash-preview";

/**
 * Editorial heat map. Scores every paragraph of a chapter for how much
 * attention it needs, so the editor can shade the prose itself instead of
 * burying the judgement in a comment thread.
 *
 * Computed on demand rather than stored: it is a lens over the current text,
 * not authored content, and one pass is cheap. That also means it can never go
 * stale against a paragraph that has since been rewritten — the failure mode
 * the chapter index has to guard against.
 */

/** Kept in sync with the legend in PassageHeatPanel.tsx. */
const CATEGORIES = [
  "thin",
  "unclear",
  "pacing",
  "continuity",
  "voice",
  "query",
  "strong",
] as const;

const SCHEMA = {
  type: "object",
  properties: {
    passages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "The paragraph index, exactly as given." },
          score: {
            type: "number",
            description:
              "0 to 1: how much editorial attention this paragraph needs. 0 = finished, leave it alone. 1 = must be addressed before the chapter is done. Most paragraphs in a competent draft sit below 0.4; reserve above 0.7 for real problems.",
          },
          category: { type: "string", enum: CATEGORIES as unknown as string[] },
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
  required: ["passages"],
};

const SYSTEM = `You are a developmental editor reading one chapter of a literary memoir by Albert Lin — a National Geographic explorer who lost a leg, searched for Genghis Khan's tomb, and whose son survived a traumatic brain injury.

You are marking a heat map: for EVERY paragraph, how much editorial attention does it need, and why?

Rules:
- Albert's voice is the entire asset. Odd constructions and fragments are usually his, not errors. Never flag prose merely for being unpolished, and never suggest making it smoother or more formal.
- Score the WRITING'S NEED FOR WORK, not the importance of its subject. A quiet paragraph doing its job scores low.
- Be sparing at the top of the range. If everything is urgent, nothing is.
- "thin" = a significant moment narrated in summary, where the reader is told rather than shown.
- "query" = the paragraph contains a bracketed [note to the author] or a highlighted question.
- "strong" (with a LOW score) = this is working; mark it so it is protected from later editing.
- Return exactly one entry per paragraph index given, in order.`;

export type Passage = {
  index: number;
  score: number;
  category: (typeof CATEGORIES)[number];
  note: string;
};

/** Paragraph text in document order, matching the Nth <p> node in the editor. */
function paragraphs(html: string): { index: number; text: string }[] {
  const out: { index: number; text: string }[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
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

export async function POST(req: NextRequest) {
  const { title, content } = await req.json();
  if (!content) return Response.json({ error: "content is required" }, { status: 400 });

  if (/data-suggest/.test(content)) {
    return Response.json(
      { error: "This chapter has unresolved suggestions — resolve them before assessing." },
      { status: 409 }
    );
  }

  const paras = paragraphs(content).filter((p) => p.text);
  if (!paras.length) return Response.json({ passages: [] });

  const numbered = paras.map((p) => `[${p.index}] ${p.text}`).join("\n\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${title || ""}\n\n${numbered}` }] }],
          systemInstruction: { parts: [{ text: SYSTEM }] },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: SCHEMA,
          },
        }),
      }
    );
    if (!res.ok) {
      return Response.json(
        { error: `Gemini error ${res.status}: ${(await res.text()).slice(0, 300)}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return Response.json({ error: "Empty response from model" }, { status: 502 });

    const parsed = JSON.parse(text) as { passages: Passage[] };
    const byIndex = new Map(paras.map((p) => [p.index, p.text]));
    const passages = (parsed.passages || [])
      .filter((p) => byIndex.has(p.index))
      .map((p) => ({
        index: p.index,
        score: Math.max(0, Math.min(1, Number(p.score) || 0)),
        category: (CATEGORIES as readonly string[]).includes(p.category) ? p.category : "unclear",
        note: String(p.note || "").slice(0, 300),
        quote: (byIndex.get(p.index) || "").slice(0, 140),
      }));

    return Response.json({ passages, paragraphCount: paras.length });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Assessment failed" },
      { status: 500 }
    );
  }
}
