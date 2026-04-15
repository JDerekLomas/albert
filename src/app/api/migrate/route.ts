import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "No service key" }, { status: 500 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    db: { schema: "public" },
  });

  const results: string[] = [];

  // Test current state
  const { error: colError } = await supabase
    .from("albert_documents")
    .select("chapter_number")
    .limit(1);

  if (colError) {
    results.push(`columns missing: ${colError.message}`);
  } else {
    results.push("chapter_number column exists");
  }

  const { error: verError } = await supabase
    .from("albert_versions")
    .select("id")
    .limit(1);

  if (verError) {
    results.push(`versions table: ${verError.message}`);
  } else {
    results.push("albert_versions table exists");
  }

  return NextResponse.json({
    results,
    needsMigration: !!colError || !!verError,
    instructions: (colError || verError)
      ? "Go to https://supabase.com/dashboard/project/ykhxaecbbxaaqlujuzde/sql and run the migration SQL"
      : "All good! No migration needed.",
    sql: MIGRATION_SQL,
  });
}

const MIGRATION_SQL = `-- Run this in the Supabase SQL Editor
ALTER TABLE albert_documents ADD COLUMN IF NOT EXISTS chapter_number integer;
ALTER TABLE albert_documents ADD COLUMN IF NOT EXISTS book_id text DEFAULT 'default';

CREATE TABLE IF NOT EXISTS albert_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id text NOT NULL REFERENCES albert_documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  message text
);

CREATE INDEX IF NOT EXISTS idx_versions_doc ON albert_versions(document_id, created_at DESC);

ALTER TABLE albert_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to albert_versions" ON albert_versions
  FOR ALL USING (true) WITH CHECK (true);`;
