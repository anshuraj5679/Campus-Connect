/**
 * Switch from demo to real use: removes every seeded demo account
 * (@bmsit.test / @campusconnect.test) and the demo timetables, complaints,
 * notices and notifications that came with them, while KEEPING:
 *   - all real accounts and their profiles,
 *   - the official departments, college settings and period slots,
 *   - clusters / sections that real users belong to,
 *   - real public holidays (only the made-up "Sports Day" is removed).
 * If no real admin exists yet, the demo admin is kept but gets a NEW random
 * password (printed once), because "Demo@12345" is public.
 *
 *   npm run demo:remove -- --yes
 * (Bring the demo back any time with `npm run seed -- --force`.)
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });

const DEMO = `(email like '%@bmsit.test' or email like '%@campusconnect.test')`;
const DEMO_ADMIN = "admin@campusconnect.test";

async function main() {
  if (!process.argv.includes("--yes")) {
    console.log("This permanently removes all demo accounts and demo data. Re-run with --yes to continue.");
    process.exit(1);
  }
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  await db.connect();

  const { rows: realAdmins } = await db.query(`select email from public.profiles where role = 'ADMIN' and is_active and not ${DEMO}`);
  const keepDemoAdmin = realAdmins.length === 0;
  const { rows: demoUsers } = await db.query(
    `select id, email from auth.users where ${DEMO} ${keepDemoAdmin ? `and email <> '${DEMO_ADMIN}'` : ""}`,
  );
  const ids = demoUsers.map((u) => u.id);
  console.log(`Demo accounts to remove: ${ids.length}${keepDemoAdmin ? ` (keeping ${DEMO_ADMIN} until you create your own admin)` : ""}`);

  const countReal = async () =>
    (await db.query(`select count(*)::int as n from auth.users where not ${DEMO}`)).rows[0].n as number;
  const realBefore = await countReal();
  console.log(`Real (non-demo) accounts that will be kept: ${realBefore}`);

  await db.query("begin");
  try {
    // Complaints that involve any demo person (their routing targets would no longer exist)
    const { rowCount: complaints } = await db.query(
      `delete from public.complaints
        where student_id = any($1) or teacher_id = any($1) or current_assignee_id = any($1) or response_requested_from = any($1)`,
      [ids],
    );
    // Demo notices, including any written by the temporary demo admin that is kept
    const { rowCount: notices } = await db.query(
      `delete from public.announcements where author_id is null or author_id in (select id from auth.users where ${DEMO})`,
    );
    await db.query(`delete from public.notifications`);
    await db.query(`delete from public.audit_logs`);
    // Removing the users cascades to their profiles, timetables, unavailability, preferences, overrides
    await db.query(`delete from auth.users where id = any($1)`, [ids]);

    // Sections / clusters nobody belongs to any more
    const { rowCount: sections } = await db.query(`
      delete from public.sections s
       where not exists (select 1 from public.student_profiles sp where sp.section_id = s.id)
         and not exists (select 1 from public.timetable_entries e where e.section_id = s.id)`);
    const { rowCount: clusters } = await db.query(`
      delete from public.clusters c
       where c.cluster_head_id is null
         and not exists (select 1 from public.sections s where s.cluster_id = c.id)
         and not exists (select 1 from public.teacher_profiles t where t.cluster_id = c.id)`);
    await db.query(`delete from public.holidays where name ilike '%sports day%'`);
    const { rows: left } = await db.query(`select count(*)::int as n from public.complaints`);
    if (left[0].n === 0) await db.query(`delete from public.complaint_counters`);
    // Hard guard: real accounts must be untouched, otherwise undo everything.
    const realAfter = await countReal();
    if (realAfter !== realBefore) throw new Error(`Safety stop: real accounts changed (${realBefore} → ${realAfter}). Nothing was removed.`);
    await db.query("commit");
    console.log(`✔ removed ${complaints} demo complaints, ${notices} demo notices, ${sections} empty sections, ${clusters} empty clusters`);
  } catch (e) {
    await db.query("rollback");
    throw e;
  }

  // Storage files of deleted complaints / users
  for (const bucket of ["complaint-evidence", "timetables", "announcements"]) {
    const { data: folders } = await supabase.storage.from(bucket).list("", { limit: 1000 });
    for (const folder of folders ?? []) {
      // Folders are named after the uploading user (or, for older evidence, the complaint)
      const { rows } = await db.query(
        `select 1 from public.profiles where id::text = $1 union all select 1 from public.complaints where id::text = $1`,
        [folder.name],
      );
      if (rows.length) continue;
      const { data: files } = await supabase.storage.from(bucket).list(folder.name, { limit: 1000 });
      if (files?.length) await supabase.storage.from(bucket).remove(files.map((f) => `${folder.name}/${f.name}`));
    }
  }

  if (keepDemoAdmin) {
    const { rows } = await db.query(`select id from auth.users where email = $1`, [DEMO_ADMIN]);
    // Only replace the password while it is still the public demo password.
    const probe = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error: demoPasswordFails } = await probe.auth.signInWithPassword({ email: DEMO_ADMIN, password: process.env.DEMO_PASSWORD ?? "Demo@12345" });
    if (rows[0] && demoPasswordFails) {
      console.log(`\nℹ Temporary admin ${DEMO_ADMIN} kept (its password was already changed).`);
      console.log(`  Create your own admin with: npm run create-admin -- you@bmsit.in "Your Name"`);
    } else if (rows[0]) {
      const password = `Adm!${randomBytes(9).toString("base64url")}`;
      const { error } = await supabase.auth.admin.updateUserById(rows[0].id, { password });
      if (error) throw error;
      console.log(`\n⚠ No real admin yet. Temporary admin kept: ${DEMO_ADMIN}`);
      console.log(`  New password (shown once): ${password}`);
      console.log(`  Create your own admin with: npm run create-admin -- you@bmsit.in "Your Name"`);
    }
  }

  const { rows: summary } = await db.query(`
    select (select count(*) from public.profiles)::int as accounts,
           (select count(*) from public.departments)::int as departments,
           (select count(*) from public.clusters)::int as clusters,
           (select count(*) from public.sections)::int as sections`);
  console.log(`\nNow: ${summary[0].accounts} accounts, ${summary[0].departments} departments, ${summary[0].clusters} clusters, ${summary[0].sections} sections.`);
  await db.end();
}

main().catch((e) => {
  console.error("Failed:", e.message ?? e);
  process.exit(1);
});
