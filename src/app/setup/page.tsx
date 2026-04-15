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
    </div>
  );
}
