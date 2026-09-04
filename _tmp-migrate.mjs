import postgres from "postgres";

// db.<ref>.supabase.co is IPv6-only and this machine has no IPv6 egress, which
// surfaces as a misleading ENOTFOUND. Supabase's pooler is dual-stack; region
// resolved from the AAAA record against AWS's published ranges (eu-west-1).
const direct = new URL(process.env.SUPABASE_DB_URL);
const ref = direct.hostname.split(".")[1];
const pooled = `postgresql://postgres.${ref}:${direct.password}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;

console.log(`connecting: aws-1-eu-west-1.pooler.supabase.com:5432 as postgres.${ref}`);
const sql = postgres(pooled, { ssl: "require", prepare: false, connect_timeout: 20 });

const [{ version }] = await sql`select version()`;
console.log("connected:", version.split(",")[0]);

await sql`
  create table if not exists albert_passage_notes (
    id uuid primary key default gen_random_uuid(),
    document_id text not null,
    para_index int not null,
    para_hash text not null,
    quote text,
    score real not null,
    category text not null,
    note text,
    model text,
    created_at timestamptz not null default now(),
    unique (document_id, para_index)
  )
`;
await sql`create index if not exists albert_passage_notes_doc on albert_passage_notes (document_id)`;
await sql`alter table albert_passage_notes enable row level security`;
const [{ exists }] = await sql`
  select exists (select 1 from pg_policies
    where tablename='albert_passage_notes' and policyname='albert_passage_notes_all') as exists
`;
if (!exists) {
  await sql`create policy albert_passage_notes_all on albert_passage_notes for all using (true) with check (true)`;
}

const cols = await sql`
  select column_name from information_schema.columns
  where table_name='albert_passage_notes' order by ordinal_position
`;
console.log("albert_passage_notes:", cols.map((c) => c.column_name).join(", "));

console.log(
  "\nWorking connection string form (password omitted):\n" +
    `  postgresql://postgres.${ref}:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`
);
await sql.end();
