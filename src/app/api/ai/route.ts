import { NextRequest } from "next/server";

const GEMINI_MODEL = "gemini-3-flash-preview";

export async function POST(req: NextRequest) {
  const { prompt, context, mode } = await req.json();

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const systemPrompts: Record<string, string> = {
    write: `You are a skilled writer helping with a collaborative document. Write clear, engaging content based on the user's request. Return ONLY the content to insert — no preamble, no explanation, no markdown code fences. Match the tone and style of any existing content provided as context.`,
    edit: `You are an editor improving existing text. The user will provide text and an instruction. Return ONLY the improved text — no preamble, no explanation, no markdown code fences. Preserve the author's voice while making the requested improvements.`,
    brainstorm: `You are a creative collaborator helping brainstorm ideas. Provide concise, actionable suggestions as a bulleted list. Be specific and creative. No preamble.`,
    summarize: `You are summarizing content. Provide a clear, concise summary. No preamble, no "Here's a summary:" prefix — just the summary itself.`,
    continue: `You are continuing a piece of writing. Read the context carefully and seamlessly continue the text in the same style, tone, and voice. Return ONLY the continuation — do not repeat any of the existing text. No preamble.`,
  };

  const system = systemPrompts[mode] || systemPrompts.write;

  let userMessage = prompt;
  if (context) {
    userMessage = `Context (existing document content):\n---\n${context}\n---\n\nRequest: ${prompt}`;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: userMessage }] }],
              systemInstruction: { parts: [{ text: system }] },
            }),
          }
        );

        if (!geminiRes.ok || !geminiRes.body) {
          const errText = await geminiRes.text();
          throw new Error(`Gemini API error ${geminiRes.status}: ${errText}`);
        }

        const reader = geminiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            try {
              const parsed = JSON.parse(payload);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            } catch {
              // skip malformed chunks
            }
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
