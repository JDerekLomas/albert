"use client";

import { useState } from "react";

const SQL = `CREATE TABLE IF NOT EXISTS albert_documents (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text NOT NULL DEFAULT 'Untitled',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE albert_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to albert_documents" ON albert_documents
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE albert_documents;`;

// albert_comments was never actually created — CommentsPanel.tsx has been
// querying/inserting into a table that doesn't exist since it was built.
// Discovered 2026-09-02 while trying to demo the feature; the insert fails
// silently (no error shown), so clicking "Post" just does nothing.
const COMMENTS_SQL = `CREATE TABLE IF NOT EXISTS albert_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id text NOT NULL REFERENCES albert_documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  author text NOT NULL,
  from_pos integer NOT NULL DEFAULT 0,
  to_pos integer NOT NULL DEFAULT 0,
  quote text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_doc ON albert_comments(document_id, created_at DESC);

ALTER TABLE albert_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to albert_comments" ON albert_comments
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE albert_comments;`;

export default function SetupPage() {
  const [status, setStatus] = useState<string | null>(null);

  async function checkStatus() {
    const res = await fetch("/api/setup", { method: "POST" });
    const data = await res.json();
    setStatus(data.status === "ok" ? "Table exists! You're good to go." : data.message);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-4">Albert Setup</h1>
      <p className="text-zinc-600 mb-6">
        Run this SQL in your{" "}
        <a
          href="https://supabase.com/dashboard/project/ykhxaecbbxaaqlujuzde/sql"
          target="_blank"
          className="text-blue-600 underline"
        >
          Supabase SQL Editor
        </a>
        :
      </p>
      <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-sm overflow-x-auto mb-6">
        {SQL}
      </pre>
      <button
        onClick={() => navigator.clipboard.writeText(SQL)}
        className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm mr-3"
      >
        Copy SQL
      </button>
      <button
        onClick={checkStatus}
        className="border border-zinc-300 px-4 py-2 rounded-lg text-sm"
      >
        Check status
      </button>
      {status && (
        <p className="mt-4 text-sm text-zinc-600">{status}</p>
      )}

      <h2 className="text-xl font-bold mt-10 mb-2">Missing: comments table</h2>
      <p className="text-zinc-600 mb-6">
        The Comments panel has been silently broken — <code>albert_comments</code> was
        never created. Run this to fix it:
      </p>
      <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-sm overflow-x-auto mb-6">
        {COMMENTS_SQL}
      </pre>
      <button
        onClick={() => navigator.clipboard.writeText(COMMENTS_SQL)}
        className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm"
      >
        Copy SQL
      </button>
    </div>
  );
}
