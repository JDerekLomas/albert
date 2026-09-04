"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase, Book, Document } from "@/lib/supabase";
import { nanoid } from "nanoid";
import Link from "next/link";
import ContinuityPanel from "@/components/ContinuityPanel";

export default function BookPage() {
  const params = useParams();
  const bookId = params.bookId as string;

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Document[]>([]);
  const [other, setOther] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  async function loadBook() {
    const [{ data: bookRow }, { data: docs }] = await Promise.all([
      supabase.from("albert_books").select("*").eq("id", bookId).single(),
      supabase
        .from("albert_documents")
        .select("*")
        .eq("book_id", bookId)
        .order("part_number", { ascending: true, nullsFirst: false })
        .order("chapter_number", { ascending: true, nullsFirst: false }),
    ]);

    setBook(bookRow || null);
    const all = (docs || []) as Document[];
    setChapters(all.filter((d) => d.chapter_number != null));
    setOther(all.filter((d) => d.chapter_number == null));
    setLoading(false);
  }

  async function createDocument() {
    const id = nanoid(10);
    const { error } = await supabase.from("albert_documents").insert({
      id,
      title: "Untitled",
      content: "",
      book_id: bookId,
    });
    if (error) {
      console.error("Error creating document:", error);
      return;
    }
    window.location.href = `/d/${id}`;
  }

  async function deleteDocument(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this document?")) return;
    await supabase.from("albert_documents").delete().eq("id", id);
    setChapters((docs) => docs.filter((d) => d.id !== id));
    setOther((docs) => docs.filter((d) => d.id !== id));
  }

  function wordCount(content: string): number {
    const text = content.replace(/<[^>]+>/g, "").trim();
    return text ? text.split(/\s+/).length : 0;
  }

  function timeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  const totalWords = chapters.reduce((sum, ch) => sum + wordCount(ch.content), 0);

  // Group chapters by part_number for display; part openers (chapter_number
  // null but part_number set) supply the part label.
  const partLabels: Record<number, string> = {};
  for (const d of other) {
    if (d.part_number != null) partLabels[d.part_number] = d.title;
  }
  const groups = new Map<number, Document[]>();
  for (const ch of chapters) {
    const key = ch.part_number ?? 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ch);
  }

  if (loading) {
    return <div className="text-zinc-400 text-center py-20">Loading...</div>;
  }

  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-zinc-400">
        <h1 className="text-2xl font-bold mb-2">Project not found</h1>
        <Link href="/" className="text-zinc-600 underline text-sm">
          All projects
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
        <Link href="/" className="hover:text-zinc-600 transition-colors">
          Writing Projects
        </Link>
        <span>/</span>
      </div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold tracking-tight">{book.title}</h1>
        <button
          onClick={createDocument}
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          New document
        </button>
      </div>

      {chapters.length > 0 && (
        <div className="flex gap-6 text-sm text-zinc-400 mb-8 border-b border-zinc-100 pb-4">
          <span>{chapters.length} chapters</span>
          <span>{totalWords.toLocaleString()} words</span>
          <span>~{Math.ceil(totalWords / 250)} pages</span>
        </div>
      )}

      {/* Book-level, so it sits with the book — not inside a chapter, where it
          could only ever see one chapter at a time. */}
      {chapters.length > 1 && (
        <ContinuityPanel
          bookId={bookId}
          chapterIds={Object.fromEntries(
            chapters.filter((c) => c.chapter_number != null).map((c) => [c.chapter_number!, c.id])
          )}
        />
      )}

      {chapters.length > 0 && (
        <div className="mb-12 space-y-6">
          {Array.from(groups.entries()).map(([partNum, docs]) => (
            <div key={partNum}>
              {partNum > 0 && (
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 px-4">
                  {partLabels[partNum] || `Part ${partNum}`}
                </h2>
              )}
              <div className="space-y-0.5">
                {docs.map((doc) => {
                  const wc = wordCount(doc.content);
                  return (
                    <Link
                      key={doc.id}
                      href={`/d/${doc.id}`}
                      className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-zinc-50 transition-colors group"
                    >
                      <span className="text-xs text-zinc-300 font-mono w-6 text-right shrink-0">
                        {doc.chapter_number}
                      </span>
                      <span
                        title={doc.status || "draft"}
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          doc.status === "final"
                            ? "bg-green-400"
                            : doc.status === "in-review"
                              ? "bg-blue-400"
                              : doc.status === "needs-albert"
                                ? "bg-amber-400"
                                : "bg-zinc-200"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium truncate text-sm">{doc.title || "Untitled"}</h3>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-[11px] text-zinc-300 tabular-nums">{wc.toLocaleString()}w</span>
                        <span className="text-[11px] text-zinc-300 tabular-nums w-12 text-right">
                          {timeAgo(doc.updated_at)}
                        </span>
                        <button
                          onClick={(e) => deleteDocument(doc.id, e)}
                          className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {other.filter((d) => d.part_number == null).length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-4">
            Notes &amp; Planning
          </h2>
          <div className="space-y-0.5">
            {other
              .filter((d) => d.part_number == null)
              .map((doc) => (
                <Link
                  key={doc.id}
                  href={`/d/${doc.id}`}
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors group"
                >
                  <h3 className="font-medium truncate text-sm">{doc.title || "Untitled"}</h3>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className="text-[11px] text-zinc-300">{timeAgo(doc.updated_at)}</span>
                    <button
                      onClick={(e) => deleteDocument(doc.id, e)}
                      className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      )}

      {chapters.length === 0 && other.length === 0 && (
        <div className="text-center py-20">
          <p className="text-zinc-400 mb-4">No documents yet</p>
          <button onClick={createDocument} className="text-zinc-900 underline text-sm hover:text-zinc-600">
            Create your first document
          </button>
        </div>
      )}
    </div>
  );
}
