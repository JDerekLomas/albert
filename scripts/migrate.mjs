#!/usr/bin/env node
import postgres from "postgres";

// Supabase direct connection (pooler mode)
const sql = postgres(
  `postgresql://postgres.ykhxaecbbxaaqlujuzde:${process.env.SUPABASE_DB_PASSWORD}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
  { ssl: "require" }
);

async function migrate() {
  console.log("Running migration...");

  await sql`ALTER TABLE albert_documents ADD COLUMN IF NOT EXISTS chapter_number integer`;
  console.log("  Added chapter_number column");

  await sql`ALTER TABLE albert_documents ADD COLUMN IF NOT EXISTS book_id text DEFAULT 'default'`;
  console.log("  Added book_id column");

  await sql`
    CREATE TABLE IF NOT EXISTS albert_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id text NOT NULL REFERENCES albert_documents(id) ON DELETE CASCADE,
      content text NOT NULL,
      title text,
      created_at timestamptz NOT NULL DEFAULT now(),
      message text
    )
  `;
  console.log("  Created albert_versions table");

  await sql`CREATE INDEX IF NOT EXISTS idx_versions_doc ON albert_versions(document_id, created_at DESC)`;
  console.log("  Created index");

  await sql`ALTER TABLE albert_versions ENABLE ROW LEVEL SECURITY`;
  console.log("  Enabled RLS");

  // Check if policy exists
  const policies = await sql`
    SELECT 1 FROM pg_policies WHERE tablename = 'albert_versions' AND policyname = 'Allow all access to albert_versions'
  `;
  if (policies.length === 0) {
    await sql`CREATE POLICY "Allow all access to albert_versions" ON albert_versions FOR ALL USING (true) WITH CHECK (true)`;
    console.log("  Created RLS policy");
  } else {
    console.log("  RLS policy already exists");
  }

  console.log("\nMigration complete!");
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
