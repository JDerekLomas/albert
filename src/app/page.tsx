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

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Albert</h1>
          <p className="text-zinc-500 mt-1">Collaborative markdown editor</p>
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
      ) : documents.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-zinc-400 mb-4">No documents yet</p>
          <button
            onClick={createDocument}
            className="text-zinc-900 underline text-sm hover:text-zinc-600"
          >
            Create your first document
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/d/${doc.id}`}
              className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-zinc-50 transition-colors group"
            >
              <div className="min-w-0">
                <h2 className="font-medium truncate">
                  {doc.title || "Untitled"}
                </h2>
                <p className="text-sm text-zinc-400 truncate mt-0.5">
                  {doc.content
                    ? doc.content.slice(0, 100).replace(/[#*_`]/g, "")
                    : "Empty document"}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <span className="text-xs text-zinc-400">
                  {timeAgo(doc.updated_at)}
                </span>
                <button
                  onClick={(e) => deleteDocument(doc.id, e)}
                  className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-sm"
                >
                  Delete
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
