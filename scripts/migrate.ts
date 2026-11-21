/**
 * Applies SQL files from supabase/migrations in filename order, once each.
 *   npm run db:migrate
 *
 * Applied files are recorded in ccmeta.migrations. Each file runs in its own
 * transaction, so a failing migration leaves the database unchanged.
 * Requires SUPABASE_DB_URL in .env.local (session pooler, port 5432).
 */
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set in .env.local");
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");

async function main() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    create schema if not exists ccmeta;
    create table if not exists ccmeta.migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  // The Phase 1 file was run by hand in the SQL Editor; record it if its table exists.
  const { rows: existing } = await client.query(
    `select to_regclass('public.profiles') is not null as has_profiles`,
  );
  if (existing[0].has_profiles) {
    await client.query(
      `insert into ccmeta.migrations (name) values ('20261121000001_foundation_profiles.sql')
       on conflict do nothing`,
    );
  }

  const { rows } = await client.query<{ name: string }>(`select name from ccmeta.migrations`);
  const applied = new Set(rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`→ ${file} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(`insert into ccmeta.migrations (name) values ($1)`, [file]);
      await client.query("commit");
      console.log("done");
      count++;
    } catch (err) {
      await client.query("rollback");
      console.log("FAILED");
      console.error((err as Error).message);
      await client.end();
      process.exit(1);
    }
  }

  // Ask PostgREST to pick up new tables/columns immediately.
  await client.query(`notify pgrst, 'reload schema'`);
  console.log(count ? `Applied ${count} migration(s).` : "Database is up to date.");
  await client.end();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
