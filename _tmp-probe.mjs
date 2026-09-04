import postgres from "postgres";

const direct = new URL(process.env.SUPABASE_DB_URL);
const ref = direct.hostname.split(".")[1];

// The pooler answered on aws-0-eu-west-1 but did not know this tenant, so the
// endpoint is right and only the shard/region label is wrong. Supabase uses
// both aws-0- and aws-1- prefixes depending on when the project was created.
const hosts = [
  "aws-1-eu-west-1", "aws-0-eu-west-2", "aws-1-eu-west-2",
  "aws-0-eu-central-1", "aws-1-eu-central-1",
];

for (const h of hosts) {
  const host = `${h}.pooler.supabase.com`;
  const url = `postgresql://postgres.${ref}:${direct.password}@${host}:5432/postgres`;
  const sql = postgres(url, { ssl: "require", prepare: false, connect_timeout: 10, max: 1 });
  try {
    await sql`select 1`;
    console.log(`WORKS: ${host}`);
    console.log(`  postgresql://postgres.${ref}:<password>@${host}:5432/postgres`);
    await sql.end();
    process.exit(0);
  } catch (e) {
    const msg = String(e.message || e).split("\n")[0].slice(0, 70);
    console.log(`  no  ${h.padEnd(18)} ${msg}`);
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}
console.log("\nNone matched. Stopping rather than probing further.");
process.exit(1);
