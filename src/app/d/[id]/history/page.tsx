"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase, Version, Document } from "@/lib/supabase";
import { diff_match_patch } from "diff-match-patch";
import Link from "next/link";

export default function HistoryPage() {
  const params = useParams();
  const id = params.id as string;
  const [doc, setDoc] = useState<Document | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<[number, number]>([0, 1]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [docRes, versionsRes] = await Promise.all([
        supabase.from("albert_documents").select("*").eq("id", id).single(),
        supabase
          .from("albert_versions")
          .select("*")
          .eq("document_id", id)
          .order("created_at", { ascending: false }),
      ]);

      if (docRes.data) setDoc(docRes.data);

      // Add current version at the top
      const current: Version = {
        id: "current",
        document_id: id,
        content: docRes.data?.content || "",
        title: docRes.data?.title || "",
        created_at: docRes.data?.updated_at || new Date().toISOString(),
        message: "Current",
      };

      const allVersions = [current, ...(versionsRes.data || [])];
      setVersions(allVersions);
      setSelected([0, Math.min(1, allVersions.length - 1)]);
      setLoading(false);
    }
    load();
  }, [id]);

  function stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function renderDiff(oldIdx: number, newIdx: number): string {
    if (versions.length < 2) return "";
    const oldText = stripHtml(versions[oldIdx]?.content || "");
    const newText = stripHtml(versions[newIdx]?.content || "");

    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(oldText, newText);
    dmp.diff_cleanupSemantic(diffs);

    return diffs
      .map(([op, text]) => {
        const escaped = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
        if (op === 1)
          return `<span class="bg-green-100 text-green-800">${escaped}</span>`;
        if (op === -1)
          return `<span class="bg-red-100 text-red-800 line-through">${escaped}</span>`;
        return `<span>${escaped}</span>`;
      })
      .join("");
  }

  async function restoreVersion(version: Version) {
    if (!confirm(`Restore to "${version.message || "this version"}"?`)) return;

    // Save current as a version first
    if (doc) {
      await supabase.from("albert_versions").insert({
        document_id: id,
        content: doc.content,
        title: doc.title,
        message: "Before restore",
      });
    }

    // Restore
    await supabase
      .from("albert_documents")
      .update({
        content: version.content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    window.location.href = `/d/${id}`;
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-zinc-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-100 px-4 h-11 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <Link
            href={`/d/${id}`}
            className="text-zinc-400 hover:text-zinc-600 text-sm"
          >
            &larr; Back to editor
          </Link>
          <span className="text-zinc-200">|</span>
          <span className="text-sm font-medium">{doc?.title}</span>
          <span className="text-xs text-zinc-400">
            &middot; {versions.length} versions
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Version list sidebar */}
        <div className="w-64 border-r border-zinc-100 overflow-y-auto bg-zinc-50 shrink-0">
          <div className="p-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Versions
            </h3>
            {versions.map((v, i) => (
              <button
                key={v.id}
                onClick={() => {
                  if (selected[0] === i) {
                    setSelected([i, selected[1]]);
                  } else {
                    setSelected([Math.min(i, selected[0]), Math.max(i, selected[0])]);
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded text-sm mb-0.5 transition-colors ${
                  selected.includes(i)
                    ? "bg-white shadow-sm border border-zinc-200"
                    : "hover:bg-white"
                }`}
              >
                <div className="font-medium text-xs truncate">
                  {v.message || (i === 0 ? "Current" : "Snapshot")}
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  {formatDate(v.created_at)}
                </div>
                {i > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      restoreVersion(v);
                    }}
                    className="text-[10px] text-violet-500 hover:text-violet-700 mt-1"
                  >
                    Restore
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Diff view */}
        <div className="flex-1 overflow-y-auto p-8">
          {versions.length < 2 ? (
            <div className="text-center text-zinc-400 py-20">
              <p>No previous versions to compare.</p>
              <p className="text-sm mt-2">
                Save versions from the editor to start tracking changes.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 text-xs text-zinc-400 mb-6">
                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded">
                  {versions[selected[1]]?.message || "Older"}
                </span>
                <span>&rarr;</span>
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  {versions[selected[0]]?.message || "Newer"}
                </span>
              </div>
              <div
                className="prose prose-sm max-w-none leading-relaxed font-serif"
                dangerouslySetInnerHTML={{
                  __html: renderDiff(selected[1], selected[0]),
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
