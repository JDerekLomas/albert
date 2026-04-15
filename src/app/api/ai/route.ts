import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
        const response = await client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: message })}\n\n`
          )
        );
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
