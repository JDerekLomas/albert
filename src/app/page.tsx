"use client";

import { useEffect, useState } from "react";
import { supabase, Book, Document } from "@/lib/supabase";
import { nanoid } from "nanoid";
import Link from "next/link";

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [counts, setCounts] = useState<Record<string, { chapters: number; words: number }>>({});
  const [loading, setLoading] = useState(true);

  async function loadBooks() {
    const [{ data: bookRows }, { data: docs }] = await Promise.all([
      supabase.from("albert_books").select("*").order("created_at", { ascending: true }),
      supabase.from("albert_documents").select("book_id,chapter_number,content"),
    ]);

    const byBook: Record<string, { chapters: number; words: number }> = {};
    for (const d of (docs || []) as Pick<Document, "book_id" | "chapter_number" | "content">[]) {
      if (!d.book_id || d.chapter_number == null) continue;
      const wc = d.content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
      if (!byBook[d.book_id]) byBook[d.book_id] = { chapters: 0, words: 0 };
      byBook[d.book_id].chapters++;
      byBook[d.book_id].words += wc;
    }

    setBooks(bookRows || []);
    setCounts(byBook);
    setLoading(false);
  }

  useEffect(() => {
    loadBooks();
  }, []);

  async function createBook() {
    const title = prompt("Book title:");
    if (!title) return;
    const id = nanoid(10);
    const { error } = await supabase.from("albert_books").insert({ id, title });
    if (error) {
      console.error("Error creating book:", error);
      return;
    }
    window.location.href = `/b/${id}`;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Writing Projects</h1>
        <button
          onClick={createBook}
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          New project
        </button>
      </div>

      {loading ? (
        <div className="text-zinc-400 text-center py-20">Loading...</div>
      ) : books.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-zinc-400 mb-4">No projects yet</p>
          <button onClick={createBook} className="text-zinc-900 underline text-sm hover:text-zinc-600">
            Create your first project
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {books.map((book) => {
            const c = counts[book.id] || { chapters: 0, words: 0 };
            return (
              <Link
                key={book.id}
                href={`/b/${book.id}`}
                className="flex items-center justify-between px-5 py-4 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 transition-colors group"
              >
                <div>
                  <h2 className="font-semibold text-lg">{book.title}</h2>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    {c.chapters} {c.chapters === 1 ? "chapter" : "chapters"} &middot;{" "}
                    {c.words.toLocaleString()} words
                  </p>
                </div>
                <span className="text-zinc-300 group-hover:text-zinc-500 transition-colors">&rarr;</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
