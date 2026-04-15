"use client";

import { useEffect, useState } from "react";
import { supabase, Document } from "@/lib/supabase";
import { nanoid } from "nanoid";
import Link from "next/link";

export default function Home() {
  const [chapters, setChapters] = useState<Document[]>([]);
  const [other, setOther] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    const { data, error } = await supabase
      .from("albert_documents")
      .select("*")
      .order("chapter_number", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("Error loading documents:", error);
      setLoading(false);
      return;
    }

    const docs = data || [];
    setChapters(docs.filter((d: Document) => d.chapter_number != null));
    setOther(docs.filter((d: Document) => d.chapter_number == null));
    setLoading(false);
  }

  async function createDocument() {
    const id = nanoid(10);
    const { error } = await supabase.from("albert_documents").insert({
      id,
      title: "Untitled",
      content: "",
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
    const seconds = Math.floor(
      (Date.now() - new Date(date).getTime()) / 1000
    );
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  const totalWords = chapters.reduce((sum, ch) => sum + wordCount(ch.content), 0);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Albert</h1>
          <p className="text-zinc-500 mt-1">Book Manuscript</p>
        </div>
        <button
          onClick={createDocument}
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          New document
        </button>
      </div>

      {loading ? (
        <div className="text-zinc-400 text-center py-20">Loading...</div>
      ) : (
        <>
          {chapters.length > 0 && (
            <div className="flex gap-6 text-sm text-zinc-400 mb-8 border-b border-zinc-100 pb-4">
              <span>{chapters.length} chapters</span>
              <span>{totalWords.toLocaleString()} words</span>
              <span>~{Math.ceil(totalWords / 250)} pages</span>
            </div>
          )}

          {chapters.length > 0 && (
            <div className="mb-12">
              <div className="space-y-0.5">
                {chapters.map((doc) => {
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
                      <div className="min-w-0 flex-1">
                        <h2 className="font-medium truncate text-sm">
                          {doc.title || "Untitled"}
                        </h2>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-[11px] text-zinc-300 tabular-nums">
                          {wc.toLocaleString()}w
                        </span>
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
          )}

          {other.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-4">
                Notes & Planning
              </h2>
              <div className="space-y-0.5">
                {other.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/d/${doc.id}`}
                    className="flex items-center justify-between px-4 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors group"
                  >
                    <h2 className="font-medium truncate text-sm">
                      {doc.title || "Untitled"}
                    </h2>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="text-[11px] text-zinc-300">
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
                ))}
              </div>
            </div>
          )}

          {chapters.length === 0 && other.length === 0 && (
            <div className="text-center py-20">
              <p className="text-zinc-400 mb-4">No documents yet</p>
              <button
                onClick={createDocument}
                className="text-zinc-900 underline text-sm hover:text-zinc-600"
              >
                Create your first document
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
