import { NextRequest } from "next/server";
import mammoth from "mammoth";
import { marked } from "marked";
import { chaptersFromFiles, plainTextToHtml, splitHtml, SplitChapter } from "@/lib/split-manuscript";

/**
 * POST multipart/form-data with one or more `file` fields (or a `text` field)
 * and an optional `title`. Returns the chapter split without writing anything;
 * the browser inserts the rows itself with the anon client, like the rest of
 * the app. Accepts .docx, .md, .markdown, .txt.
 */
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

async function fileToHtml(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.convertToHtml(
      { buffer: buf },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => p:fresh",
          "p[style-name='Chapter'] => h1:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Quote'] => blockquote > p:fresh",
          "p[style-name='Block Text'] => blockquote > p:fresh",
        ],
        ignoreEmptyParagraphs: true,
        convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
      }
    );
    // Images are dropped for now — the editor has no image node.
    return result.value.replace(/<img[^>]*>/g, "");
  }
  const text = await file.text();
  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return await marked.parse(text, { async: true });
  }
  if (name.endsWith(".html") || name.endsWith(".htm")) return text;
  return plainTextToHtml(text);
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const title = String(form.get("title") || "").trim() || "Untitled";
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const pasted = String(form.get("text") || "");

  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_BYTES) {
    return Response.json({ error: "Upload is larger than 25 MB" }, { status: 413 });
  }

  try {
    let chapters: SplitChapter[];
    if (files.length > 1) {
      const converted = [];
      for (const f of files) converted.push({ name: f.name, html: await fileToHtml(f) });
      chapters = chaptersFromFiles(converted);
    } else if (files.length === 1) {
      chapters = splitHtml(await fileToHtml(files[0]), title);
    } else if (pasted.trim()) {
      chapters = splitHtml(plainTextToHtml(pasted), title);
    } else {
      return Response.json({ error: "No file or text was uploaded" }, { status: 400 });
    }
    return Response.json({ chapters });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Could not read the manuscript: ${message}` }, { status: 422 });
  }
}
