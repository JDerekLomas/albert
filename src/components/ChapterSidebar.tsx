"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, Document } from "@/lib/supabase";

export default function ChapterSidebar({
  currentDocId,
}: {
  currentDocId: string;
}) {
  const [chapters, setChapters] = useState<Document[]>([]);
  const [notes, setNotes] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("albert_documents")
        .select("*")
        .order("chapter_number", { ascending: true, nullsFirst: false });
      if (error || cancelled) return;
      const docs = (data || []) as Document[];
      setChapters(docs.filter((d) => d.chapter_number != null));
      setNotes(docs.filter((d) => d.chapter_number == null));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function statusDot(status: string | null) {
    return status === "final"
      ? "bg-green-400"
      : status === "in-review"
        ? "bg-blue-400"
        : status === "needs-albert"
          ? "bg-amber-400"
          : "bg-zinc-200";
  }

  return (
    <div className="w-56 border-r border-zinc-100 bg-zinc-50/50 flex flex-col shrink-0 h-full">
      <div className="h-11 border-b border-zinc-100 px-3 flex items-center shrink-0">
        <Link
          href="/"
          className="text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-600 transition-colors"
        >
          Chapters
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="px-3 py-4 text-xs text-zinc-300">Loading…</div>
        ) : (
          <>
            <div className="space-y-0.5 px-1.5">
              {chapters.map((doc) => {
                const active = doc.id === currentDocId;
                return (
                  <Link
                    key={doc.id}
                    href={`/d/${doc.id}`}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                      active
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    <span
                      className={`text-[10px] font-mono w-4 text-right shrink-0 ${
                        active ? "text-zinc-400" : "text-zinc-300"
                      }`}
                    >
                      {doc.chapter_number}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        active ? "bg-white/40" : statusDot(doc.status)
                      }`}
                    />
                    <span className="truncate flex-1">
                      {(doc.title || "Untitled").replace(/^Chapter \d+:\s*/, "")}
                    </span>
                  </Link>
                );
              })}
            </div>

            {notes.length > 0 && (
              <div className="mt-4">
                <div className="px-3.5 mb-1 text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Notes
                </div>
                <div className="space-y-0.5 px-1.5">
                  {notes.map((doc) => {
                    const active = doc.id === currentDocId;
                    return (
                      <Link
                        key={doc.id}
                        href={`/d/${doc.id}`}
                        className={`flex items-center px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                          active
                            ? "bg-zinc-900 text-white"
                            : "text-zinc-500 hover:bg-zinc-100"
                        }`}
                      >
                        <span className="truncate">{doc.title || "Untitled"}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
