// Post-merge step for PR #7. Run from sourcelibrary so its SUPABASE_DB_URL injects:
//   cd ~/sourcelibrary && secret-lover run -- node ~/albert/scripts/tighten-rls.mjs
// Then verifies the anon key can no longer read albert_documents.
import { readFileSync } from "node:fs";
import postgres from "/Users/dereklomas/albert/node_modules/postgres/src/index.js";
const env = Object.fromEntries(readFileSync("/Users/dereklomas/albert/.env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
const before = await sql`select count(*)::int as n from pg_policies where tablename like 'albert_%' and 'public' = any(roles::text[]::text[])`;
await sql.unsafe(readFileSync("/Users/dereklomas/albert/db/tighten-rls.sql", "utf8"));
const after = await sql`select count(*)::int as n from pg_policies where tablename like 'albert_%' and 'public' = any(roles::text[]::text[])`;
console.log(`public policies: ${before[0].n} -> ${after[0].n}`);
await sql.end();
const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/albert_documents?select=id&limit=1`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } });
const body = await r.text();
console.log(`anon read of albert_documents: HTTP ${r.status}, ${body.slice(0, 60)}`);
console.log(r.status === 200 && body.trim() === "[]" ? "OK: anon key sees nothing" : r.status >= 400 ? "OK: anon key refused" : "WARNING: anon key still reads data");
