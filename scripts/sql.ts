/**
 * Run an ad-hoc SQL query against the database (developer tool).
 *   npx tsx scripts/sql.ts "select count(*) from profiles"
 */
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });

async function main() {
  const sql = process.argv.slice(2).join(" ");
  if (!sql) throw new Error('Usage: tsx scripts/sql.ts "select 1"');
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const result = await client.query(sql);
    const results = Array.isArray(result) ? result : [result];
    for (const r of results) {
      if (r.rows?.length) console.table(r.rows);
      else console.log(`${r.command ?? "OK"} ${r.rowCount ?? ""}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
