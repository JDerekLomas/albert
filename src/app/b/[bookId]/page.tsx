"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Document } from "@/lib/supabase";
import Link from "next/link";
import ContinuityPanel from "@/components/ContinuityPanel";
import BookMap from "@/components/BookMap";
import SharePanel from "@/components/SharePanel";
import AppHeader, { useMe } from "@/components/AppHeader";
import { books as bookApi, documents as docApi, BookDetail, Member, Role } from "@/lib/api";

const GUIDE_SEEN = "albert-guide-seen";

export default function BookPage() {
  const params = useParams();
  const bookId = params.bookId as string;
  const [me] = useMe();

  const [book, setBook] = useState<BookDetail["book"] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<Role>("viewer");
  const [chapters, setChapters] = useState<Document[]>([]);
  const [other, setOther] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    loadBook();
    try {
      if (!localStorage.getItem(GUIDE_SEEN)) setShowGuide(true);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  function dismissGuide() {
    setShowGuide(false);
    try {
      localStorage.setItem(GUIDE_SEEN, "1");
    } catch {
      /* ignore */
    }
  }

  async function loadBook() {
    try {
      const detail = await bookApi.get(bookId);
      setBook(detail.book);
      setMembers(detail.members);
      setRole(detail.role);
      const all = detail.documents;
      setChapters(all.filter((d) => d.chapter_number != null));
      setOther(all.filter((d) => d.chapter_number == null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  async function createDocument() {
    try {
      const doc = await bookApi.addDocument(bookId, { title: "Untitled" });
      window.location.href = `/d/${doc.id}`;
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteDocument(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const doc = [...chapters, ...other].find((d) => d.id === id);
    if (!confirm(`Delete “${doc?.title || "this document"}”? Its versions and comments go with it.`)) return;
    try {
      await docApi.remove(id);
      loadBook();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function renameBook() {
    if (!book) return;
    const next = prompt("Book title:", book.title);
    if (!next || !next.trim() || next.trim() === book.title) return;
    await bookApi.update(bookId, { title: next.trim() }).catch((e) => alert(e.message));
    loadBook();
  }

  async function deleteBook() {
    if (!book) return;
    if (!confirm(`Delete “${book.title}” and all its chapters, versions and comments? This cannot be undone.`)) return;
    if (prompt(`Type the title to confirm:`) !== book.title) return;
    try {
      await bookApi.remove(bookId);
      window.location.href = "/";
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const canEdit = role === "editor" || role === "owner";

  const partLabels: Record<number, string> = {};
  for (const d of other) {
    if (d.part_number != null) partLabels[d.part_number] = d.title;
  }

  function timeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  if (loading) return <div className="text-zinc-400 text-center py-32">Loading…</div>;

  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-zinc-400">
        <h1 className="text-2xl font-bold mb-2">Book not found</h1>
        <p className="text-sm mb-4">{error || "You may not be a member of this book."}</p>
        <Link href="/" className="text-zinc-600 underline text-sm">
          Your books
        </Link>
      </div>
    );
  }

  return (
    <>
    <AppHeader crumbs={[{ label: book.title }]} />
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-2 gap-4">
        <h1 className="text-3xl font-bold tracking-tight min-w-0 truncate">
          {book.title}
          {role === "owner" && (
            <button onClick={renameBook} className="ml-3 text-xs font-normal text-zinc-400 hover:text-zinc-700 align-middle">
              rename
            </button>
          )}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          {role === "owner" && (
            <button onClick={() => setShowShare(!showShare)} className="border border-zinc-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-50 transition-colors">
              Share{members.length > 1 ? ` · ${members.length}` : ""}
            </button>
          )}
          {canEdit && (
            <button onClick={createDocument} className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors">
              New document
            </button>
          )}
        </div>
      </div>
      {role !== "owner" && (
        <p className="text-xs text-zinc-400 mb-2">You are {role === "viewer" ? "a reader" : "an editor"} of this book.</p>
      )}

      <div className="mb-8 border-b border-zinc-100 pb-2" />

      {showShare && role === "owner" && me && (
        <SharePanel book={book} members={members} me={me.email} onChange={loadBook} />
      )}

      {showGuide && (
        <div className="border border-zinc-200 rounded-xl p-5 mb-8 bg-zinc-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold mb-1">How this works</h2>
              <ul className="text-sm text-zinc-600 space-y-1 leading-relaxed">
                <li>Open a chapter to read and edit it. It saves as you type.</li>
                <li>Changes from collaborators and the AI arrive as <b>suggestions</b> you accept or reject, never as silent edits.</li>
                <li>Select text to <b>comment</b> on it. <b>Save version</b> before anything you might want to undo.</li>
                <li>This page is the book from above: every chapter, its length, and what is waiting on someone.</li>
              </ul>
              <Link href="/guide" className="text-sm underline text-zinc-500 hover:text-zinc-800 mt-2 inline-block">
                Read the full guide
              </Link>
            </div>
            <button onClick={dismissGuide} className="text-zinc-400 hover:text-zinc-700 text-sm shrink-0">
              Got it
            </button>
          </div>
        </div>
      )}

      {/* The book from above, before the list of documents: length, state,
          what's waiting on a person. */}
      <BookMap
        bookId={bookId}
        chapters={chapters}
        partLabels={partLabels}
        onDelete={deleteDocument}
      />

      {/* Book-level, so it sits with the book — not inside a chapter, where it
          could only ever see one chapter at a time. */}
      {canEdit && chapters.length > 1 && (
        <ContinuityPanel
          bookId={bookId}
          chapterIds={Object.fromEntries(
            chapters.filter((c) => c.chapter_number != null).map((c) => [c.chapter_number!, c.id])
          )}
        />
      )}

      {/* The chapter list used to be repeated here in full. The map above
          is the same rows with more in them, so this is only the documents
          that aren't chapters. */}

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
          <p className="text-zinc-400 mb-4">No chapters yet</p>
          {canEdit && (
            <button onClick={createDocument} className="text-zinc-900 underline text-sm hover:text-zinc-600">
              Write the first one
            </button>
          )}
        </div>
      )}

      {role === "owner" && (
        <p className="mt-16 text-xs text-zinc-300">
          <button onClick={deleteBook} className="hover:text-red-600">
            Delete this book
          </button>
        </p>
      )}
    </div>
    </>
  );
}
