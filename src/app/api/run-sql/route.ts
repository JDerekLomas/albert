import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "No service key" }, { status: 500 });
  }

  const { sql } = await req.json();
  if (!sql) {
    return NextResponse.json({ error: "No SQL provided" }, { status: 400 });
  }

  // Use the Supabase Management API to run SQL
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(
    /https:\/\/(.+?)\.supabase/
  )?.[1];

  if (!projectRef) {
    return NextResponse.json({ error: "Can't parse project ref" }, { status: 500 });
  }

  // Alternative: use the postgres connection via supabase-js rpc
  // Since we can't run raw SQL through REST, let's try the management API
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Try adding columns one by one via direct approach
  const results: string[] = [];

  // Test if columns exist by trying to read them
  const { data: testData, error: testError } = await supabase
    .from("albert_documents")
    .select("id, chapter_number, book_id")
    .limit(1);

  if (testError?.message?.includes("chapter_number")) {
    results.push("chapter_number column missing - run migration SQL manually");
  } else {
    results.push("chapter_number column exists");
  }

  // Test if versions table exists
  const { error: vError } = await supabase
    .from("albert_versions")
    .select("id")
    .limit(1);

  if (vError) {
    results.push(`albert_versions: ${vError.message}`);
  } else {
    results.push("albert_versions table exists");
  }

  return NextResponse.json({ results, sql_to_run: MIGRATION_SQL });
}

const MIGRATION_SQL = `
-- Add chapter ordering columns
ALTER TABLE albert_documents ADD COLUMN IF NOT EXISTS chapter_number integer;
ALTER TABLE albert_documents ADD COLUMN IF NOT EXISTS book_id text DEFAULT 'default';

-- Create versions table
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
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE albert_versions;
`;
