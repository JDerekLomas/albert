"use client";

/** Signed out: the front door. Signed in: my books. */
import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader, { useMe } from "@/components/AppHeader";
import { books as bookApi, BookWithRole } from "@/lib/api";

export default function Home() {
  const [me] = useMe();
  const [books, setBooks] = useState<BookWithRole[] | null>(null);

  useEffect(() => {
    if (!me) return;
    bookApi.list().then(setBooks).catch(() => setBooks([]));
  }, [me]);

  if (me === undefined) return <div className="text-zinc-400 text-center py-32">Loading…</div>;
  if (me === null) return <Landing />;

  return (
    <>
      <AppHeader />
      <div className="max-w-3xl mx-auto px-6 py-14">
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Your books</h1>
          <Link href="/new" className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors">
            New book
          </Link>
        </div>
        {books === null ? (
          <div className="text-zinc-400 text-center py-20">Loading…</div>
        ) : books.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-500 mb-2">No books yet.</p>
            <p className="text-sm text-zinc-400 mb-6 max-w-sm mx-auto leading-relaxed">
              Bring in a manuscript, or wait for an invitation: a book someone shares with you appears here.
            </p>
            <Link href="/new" className="text-zinc-900 underline text-sm hover:text-zinc-600">
              Bring your book in
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {books.map((book) => (
              <Link
                key={book.id}
                href={`/b/${book.id}`}
                className="flex items-center justify-between px-5 py-4 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 transition-colors group"
              >
                <div className="min-w-0">
                  <h2 className="font-semibold text-lg truncate">{book.title}</h2>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    {book.chapters} {book.chapters === 1 ? "chapter" : "chapters"} &middot; {book.words.toLocaleString()} words
                    {book.role !== "owner" && <> &middot; you are {book.role === "viewer" ? "a reader" : "an editor"}</>}
                  </p>
                </div>
                <span className="text-zinc-300 group-hover:text-zinc-500 transition-colors">&rarr;</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Landing() {
  return (
    <>
      <AppHeader />
      <div className="max-w-2xl mx-auto px-6 py-24">
        <h1 className="text-4xl font-bold tracking-tight mb-5">Work on a book together, without losing your text.</h1>
        <p className="text-lg text-zinc-600 leading-relaxed mb-10">
          A manuscript editor for an author and the people helping them. Every change from a collaborator or the AI
          arrives as a suggestion you accept or reject. Comments stay with the passage. Every version is kept.
        </p>
        <div className="flex items-center gap-4 mb-20">
          <Link href="/login" className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-800">
            Sign in with email
          </Link>
          <Link href="/guide" className="text-sm text-zinc-500 hover:text-zinc-800 underline">
            How it works
          </Link>
        </div>
        <div className="grid sm:grid-cols-3 gap-8 text-sm">
          {[
            ["Suggestions, not edits", "Changes are proposed inline, old text beside new, and applied only when you say so."],
            ["The book from above", "A map of every chapter: length, state, open questions, what is waiting on you."],
            ["Invite who you need", "Editors change text; readers only read. Sign-in is a link in their email, no password."],
          ].map(([h, b]) => (
            <div key={h}>
              <h2 className="font-semibold mb-1.5">{h}</h2>
              <p className="text-zinc-500 leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
