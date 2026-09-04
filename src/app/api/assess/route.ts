import { NextRequest } from "next/server";
import {
  ASSESS_SCHEMA,
  ASSESS_SYSTEM,
  callGemini,
  normalizeAssessment,
  paragraphs,
} from "@/lib/editorial.mjs";

/**
 * Editorial heat map for one chapter: a verdict on the chapter as a whole, plus
 * a per-paragraph score for how much attention it needs.
 *
 * Computed on demand rather than stored: it is a lens over the current text,
 * not authored content, and one pass is cheap. That also means it can never go
 * stale against a paragraph that has since been rewritten — the failure mode
 * the chapter index has to guard against.
 *
 * Prompts and schema live in src/lib/editorial.mjs, shared with
 * scripts/assess-chapter.mjs. Cross-chapter continuity is NOT judged here —
 * see /api/continuity, which is the only pass that sees the whole book.
 */
export async function POST(req: NextRequest) {
  const { title, content } = await req.json();
  if (!content) return Response.json({ error: "content is required" }, { status: 400 });

  if (/data-suggest/.test(content)) {
    return Response.json(
      { error: "This chapter has unresolved suggestions — resolve them before assessing." },
      { status: 409 }
    );
  }

  const paras = paragraphs(content).filter((p: { text: string }) => p.text);
  if (!paras.length) return Response.json({ passages: [] });

  const numbered = paras
    .map((p: { index: number; text: string }) => `[${p.index}] ${p.text}`)
    .join("\n\n");

  try {
    const parsed = await callGemini(ASSESS_SYSTEM, `${title || ""}\n\n${numbered}`, ASSESS_SCHEMA);
    const { chapter, passages } = normalizeAssessment(parsed, paras);
    return Response.json({ chapter, passages, paragraphCount: paras.length });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Assessment failed" },
      { status: 502 }
    );
  }
}
