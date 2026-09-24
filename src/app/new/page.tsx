"use client";

/**
 * The invite page. Someone arrives here with a link from a collaborator, a
 * manuscript on their laptop, and no idea what this tool is. In two minutes
 * they should have their book in the editor with every chapter accounted for.
 *
 * Nothing is written until they have seen the chapter split and pressed
 * "Create book" — an author needs to see that nothing was lost before trusting
 * an unfamiliar tool with their text.
 */

import { useEffect, useRef, useState } from "react";
import { auth, books as bookApi } from "@/lib/api";
import { setIdentityFromUser } from "@/lib/presence";
import AppHeader, { useMe } from "@/components/AppHeader";
import type { SplitChapter } from "@/lib/split-manuscript";

type Stage = "form" | "reading" | "preview" | "creating";

export default function NewBookPage() {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [chapters, setChapters] = useState<SplitChapter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [me] = useMe();
  useEffect(() => {
    if (me === null) window.location.href = `/login?next=${encodeURIComponent("/new")}`;
    if (me && !name) setName(me.name.includes("@") ? "" : me.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const totalWords = chapters.reduce((n, c) => n + c.words, 0);
  const canRead = title.trim() && (files.length > 0 || pasted.trim());

  async function readManuscript(e: React.FormEvent) {
    e.preventDefault();
    if (!canRead) return;
    setError(null);
    setStage("reading");
    const form = new FormData();
    form.set("title", title.trim());
    for (const f of files) form.append("file", f);
    if (!files.length) form.set("text", pasted);
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      setChapters(data.chapters);
      setStage("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("form");
    }
  }

  async function createBook() {
    setStage("creating");
    setError(null);
    if (name.trim()) {
      const user = await auth.update({ name }).catch(() => null);
      if (user) setIdentityFromUser(user);
    }
    try {
      const book = await bookApi.create(title.trim(), chapters);
      window.location.href = `/b/${book.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("preview");
    }
  }

  async function createEmpty() {
    if (!title.trim()) return;
    setStage("creating");
    try {
      const book = await bookApi.create(title.trim());
      window.location.href = `/b/${book.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("form");
    }
  }

  function addFiles(list: FileList | File[]) {
    const next = [...files, ...Array.from(list)].filter(
      (f, i, arr) => arr.findIndex((g) => g.name === f.name && g.size === f.size) === i
    );
    next.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setFiles(next);
    if (!title.trim() && next.length === 1) {
      setTitle(next[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    }
  }

  return (
    <>
    <AppHeader crumbs={[{ label: "New book" }]} />
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight mb-3">Bring your book in</h1>
      <p className="text-zinc-600 leading-relaxed mb-10">
        This is a manuscript editor for working on a book with a collaborator: you both edit the same
        chapters, changes arrive as suggestions you accept or reject, and comments sit next to the
        passage they are about. Upload your manuscript and it becomes one editable chapter per heading.
      </p>

      {stage === "form" || stage === "reading" ? (
        <form onSubmit={readManuscript} className="space-y-8">
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="So your edits and comments carry your name"
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Book title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Working title is fine"
              required
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
            />
          </label>

          <div>
            <span className="block text-sm font-medium mb-1.5">Manuscript</span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInput.current?.click()}
              className={`border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors ${
                dragging ? "border-zinc-500 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".docx,.md,.markdown,.txt,.html"
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
              {files.length ? (
                <ul className="text-sm text-left inline-block">
                  {files.map((f) => (
                    <li key={f.name + f.size} className="flex items-center gap-3 py-0.5">
                      <span className="font-medium">{f.name}</span>
                      <span className="text-zinc-400">{Math.round(f.size / 1024)} KB</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles(files.filter((g) => g !== f));
                        }}
                        className="text-zinc-400 hover:text-zinc-700"
                        aria-label={`Remove ${f.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <p className="text-sm text-zinc-700 mb-1">Drop a Word file here, or click to choose</p>
                  <p className="text-xs text-zinc-400">.docx, .md or .txt — one file, or one file per chapter</p>
                </>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Chapters are split at your top-level headings (Heading 1 in Word), or at lines that read
              &ldquo;Chapter 3&rdquo;. If your file has neither, upload one file per chapter instead.
            </p>
            {!files.length && (
              <button
                type="button"
                onClick={() => setShowPaste(!showPaste)}
                className="text-xs text-zinc-500 underline mt-2"
              >
                {showPaste ? "Hide" : "Or paste the text instead"}
              </button>
            )}
            {showPaste && !files.length && (
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={10}
                placeholder="Paste your manuscript. A blank line between paragraphs; a line like “Chapter 1” starts a chapter."
                className="mt-2 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-zinc-400"
              />
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={!canRead || stage === "reading"}
            className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {stage === "reading" ? "Reading your manuscript…" : "Read manuscript"}
          </button>
          <button type="button" onClick={createEmpty} disabled={!title.trim() || stage === "reading"} className="ml-4 text-sm text-zinc-500 hover:text-zinc-800 disabled:opacity-40">
            or start with an empty book
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-zinc-500">
              {chapters.filter((c) => c.chapter_number != null).length} chapters, {totalWords.toLocaleString()} words.
              Check that every chapter is here before you continue.
            </p>
          </div>

          <ol className="divide-y divide-zinc-100 border border-zinc-100 rounded-xl">
            {chapters.map((c, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-6 text-right text-zinc-400 tabular-nums shrink-0">
                    {c.chapter_number ?? "–"}
                  </span>
                  <span className="truncate">{c.title}</span>
                </span>
                <span className="text-zinc-400 tabular-nums shrink-0 ml-4">{c.words.toLocaleString()} words</span>
              </li>
            ))}
          </ol>

          {chapters.length === 1 && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3 leading-relaxed">
              The whole manuscript came through as one chapter. That works, but the editor is nicer
              chapter by chapter. To split it, mark chapter titles as Heading 1 in Word, or upload one
              file per chapter.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-4">
            <button
              onClick={createBook}
              disabled={stage === "creating"}
              className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              {stage === "creating" ? "Creating…" : "Create book"}
            </button>
            <button
              onClick={() => {
                setStage("form");
                setChapters([]);
              }}
              disabled={stage === "creating"}
              className="text-sm text-zinc-500 hover:text-zinc-800"
            >
              Back
            </button>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            The book is private to you until you invite someone from its page.
          </p>
        </div>
      )}
    </div>
    </>
  );
}
