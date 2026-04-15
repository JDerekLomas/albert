"use client";

import { useEffect, useState } from "react";
import { supabase, Document } from "@/lib/supabase";
import { nanoid } from "nanoid";
import Link from "next/link";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    const { data, error } = await supabase
      .from("albert_documents")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error loading documents:", error);
    } else {
      setDocuments(data || []);
    }
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
    setDocuments((docs) => docs.filter((d) => d.id !== id));
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

  function extractPreview(content: string): string {
    if (!content) return "Empty document";
    // Strip HTML tags and get first 120 chars
    const text = content.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, " ");
    return text.slice(0, 120).trim() || "Empty document";
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Albert
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Collaborative writing with AI
            </p>
          </div>
          <button
            onClick={createDocument}
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors flex items-center gap-2"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New document
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-zinc-400 text-center py-20 text-sm">
            Loading...
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a1a1aa"
                strokeWidth="1.5"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <p className="text-zinc-400 text-sm mb-4">No documents yet</p>
            <button
              onClick={createDocument}
              className="text-sm text-zinc-600 underline hover:text-zinc-900"
            >
              Create your first document
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/d/${doc.id}`}
                className="bg-white rounded-xl px-5 py-4 hover:shadow-md transition-all border border-zinc-100 group block"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium text-zinc-900 truncate">
                      {doc.title || "Untitled"}
                    </h2>
                    <p className="text-sm text-zinc-400 truncate mt-1 leading-relaxed">
                      {extractPreview(doc.content)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4 mt-0.5">
                    <span className="text-xs text-zinc-300">
                      {timeAgo(doc.updated_at)}
                    </span>
                    <button
                      onClick={(e) => deleteDocument(doc.id, e)}
                      className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
