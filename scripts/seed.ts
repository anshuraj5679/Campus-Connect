/**
 * Full BMSIT&M demo seed. Safe to re-run: it resets all college data and the
 * seeded accounts (@bmsit.test / @campusconnect.test), then recreates them.
 *   npm run seed
 *
 * Creates: 7 departments, CSE with 4 clusters / 8 sections, ~38 staff, 40
 * students, published timetables for every CSE teacher, 2 teachers on leave
 * today, a holiday next week, 8 complaints in every status (incl. 1
 * confidential + 1 SLA-overdue), 6 announcements and starter notifications.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { getDemoPassword } from "../lib/auth/demo";
import { DEFAULT_PERIOD_SLOTS } from "../lib/services/periods";
import { addDaysToDate, addWorkingDays, istDateTime, istParts, type CalendarSettings } from "../lib/services/time";
import {
  buildStudents,
  CSE_CLUSTERS,
  CSE_HOD,
  CSE_TEACHERS,
  DEPARTMENTS,
  FIXED_ASSIGNMENTS,
  OTHER_DEPT_STAFF,
  SUBJECTS_BY_SEM,
} from "./seed-data";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const dbUrl = process.env.SUPABASE_DB_URL!;
if (!url || !serviceKey || !dbUrl) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const db = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
const PASSWORD = getDemoPassword();

const CALENDAR: CalendarSettings = { workingDays: [1, 2, 3, 4, 5, 6], saturdayRule: "SECOND_FOURTH_OFF", collegeStart: "09:00", collegeEnd: "16:30" };

// ---------- helpers ----------
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(2026);
const shuffle = <T,>(arr: T[]) => [...arr].sort(() => random() - 0.5);

async function insert(table: string, rows: Record<string, unknown>[], returning = "id"): Promise<Record<string, any>[]> {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const params: unknown[] = [];
  const values = rows.map((r, i) => {
    cols.forEach((c) => params.push(r[c] === undefined ? null : r[c]));
    return `(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(", ")})`;
  });
  const { rows: out } = await db.query(
    `insert into ${table} (${cols.join(", ")}) values ${values.join(", ")} returning ${returning}`,
    params,
  );
  return out;
}

async function createUser(email: string, fullName: string, role: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.user.id;
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// ---------- main ----------
async function main() {
  await db.connect();

  // Safety: the seed wipes ALL college data. Refuse once real people use the system.
  const { rows: real } = await db.query(
    `select count(*)::int as n from public.profiles where email not like '%@bmsit.test' and email not like '%@campusconnect.test'`,
  );
  if (real[0].n > 0 && !process.argv.includes("--force")) {
    console.error(`Refusing to seed: ${real[0].n} real account(s) exist and seeding would erase college data.`);
    console.error("Use a separate Supabase project for demos/tests, or run `npm run seed -- --force` if you really want to reset.");
    await db.end();
    process.exit(1);
  }

  const now = new Date();
  const today = istParts(now).date;
  const year = Number(today.slice(0, 4));
  console.log(`Seeding BMSIT&M demo data for ${today} (IST)…`);

  // 1. Reset
  await db.query(`
    truncate public.complaint_messages, public.complaint_attachments, public.complaint_history, public.complaints,
      public.complaint_counters, public.notifications, public.announcement_reads, public.announcements,
      public.audit_logs, public.timetable_entries, public.timetable_versions, public.teacher_unavailability,
      public.availability_preferences, public.schedule_overrides, public.holidays, public.period_slots,
      public.student_profiles, public.teacher_profiles, public.sections, public.clusters, public.departments cascade;
  `);
  await db.query(`delete from auth.users where email like '%@bmsit.test' or email like '%@campusconnect.test'`);
  await db.query(`delete from storage.objects where bucket_id in ('timetables', 'complaint-evidence', 'announcements')`).catch(() => {});
  console.log("✔ reset");

  // 2. Calendar
  await db.query(
    `update public.college_settings set working_days = '{1,2,3,4,5,6}', saturday_rule = 'SECOND_FOURTH_OFF',
       college_start = '09:00', college_end = '16:30', academic_year = '2026-27', semester_type = 'ODD', sla_working_days = 5 where id = 1`,
  );
  await insert(
    "public.period_slots",
    DEFAULT_PERIOD_SLOTS.map((s) => ({ label: s.label, period_no: s.periodNo, start_time: s.start, end_time: s.end, is_break: s.isBreak, sort_order: s.sortOrder })),
  );
  const holidayDate = addDaysToDate(today, 7);
  await insert("public.holidays", [
    { date: holidayDate, name: "College Sports Day (Declared Holiday)" },
    { date: `${year}-12-25`, name: "Christmas" },
    { date: `${year + 1}-01-15`, name: "Makara Sankranti" },
    { date: `${year + 1}-01-26`, name: "Republic Day" },
  ].filter((h, i, all) => all.findIndex((x) => x.date === h.date) === i));
  console.log("✔ calendar, period slots, holidays");

  // 3. Structure
  const deptRows = await insert("public.departments", DEPARTMENTS.map((d) => ({ code: d.code, name: d.name })), "id, code");
  const deptId = Object.fromEntries(deptRows.map((d) => [d.code, d.id])) as Record<string, string>;

  const cseClusters = await insert(
    "public.clusters",
    CSE_CLUSTERS.map((c) => ({ department_id: deptId.CSE, name: c.name })),
    "id, name",
  );
  const clusterIdByIndex = CSE_CLUSTERS.map((c) => cseClusters.find((r) => r.name === c.name)!.id as string);

  const otherClusters: Record<string, string> = {};
  for (const code of Object.keys(OTHER_DEPT_STAFF)) {
    const rows = await insert("public.clusters", [{ department_id: deptId[code], name: "Cluster 1" }, { department_id: deptId[code], name: "Cluster 2" }], "id, name");
    otherClusters[code] = rows[0].id;
  }

  const sectionRows: Record<string, { id: string; cluster: string; room: string; semester: number }> = {};
  for (const [i, c] of CSE_CLUSTERS.entries()) {
    for (const s of c.sections) {
      const [row] = await insert("public.sections", [
        { department_id: deptId.CSE, cluster_id: clusterIdByIndex[i], semester: Number(s.name[0]), name: s.name, home_room: s.room },
      ]);
      sectionRows[s.name] = { id: row.id, cluster: clusterIdByIndex[i], room: s.room, semester: Number(s.name[0]) };
    }
  }
  for (const code of Object.keys(OTHER_DEPT_STAFF)) {
    await insert("public.sections", [
      { department_id: deptId[code], cluster_id: otherClusters[code], semester: 3, name: "3A", home_room: null },
      { department_id: deptId[code], cluster_id: otherClusters[code], semester: 5, name: "5A", home_room: null },
    ]);
  }
  console.log("✔ departments, clusters, sections");

  // 4. Staff accounts
  const adminId = await createUser("admin@campusconnect.test", "Mr. Suresh Patil", "ADMIN");
  const teacherIds: Record<string, string> = {};
  const allCse = [CSE_HOD, ...CSE_TEACHERS];
  await inBatches(allCse, 8, async (t) => {
    const role = t === CSE_HOD ? "HOD" : t.isClusterHead ? "CLUSTER_HEAD" : "TEACHER";
    teacherIds[t.key] = await createUser(t.email, t.name, role);
  });

  const teacherProfiles: Record<string, unknown>[] = allCse.map((t, i) => ({
    user_id: teacherIds[t.key],
    employee_id: `BMSIT-CSE-${String(101 + i)}`,
    designation: t.designation,
    department_id: deptId.CSE,
    cluster_id: t.cluster === null ? null : clusterIdByIndex[t.cluster],
    cabin_location: t.cabin,
    subjects: [],
  }));

  for (const [code, staff] of Object.entries(OTHER_DEPT_STAFF)) {
    const slug = (n: string) => n.replace(/^(Dr|Prof|Mr|Ms)\.\s+/, "").toLowerCase().replace(/[^a-z]+/g, ".").replace(/\.$/, "");
    const hodId = await createUser(`${slug(staff.hod)}@bmsit.test`, staff.hod, "HOD");
    const chId = await createUser(`${slug(staff.ch)}@bmsit.test`, staff.ch, "CLUSTER_HEAD");
    const tId = await createUser(`${slug(staff.teacher)}@bmsit.test`, staff.teacher, "TEACHER");
    teacherProfiles.push(
      { user_id: hodId, employee_id: `BMSIT-${code}-101`, designation: "Professor & Head", department_id: deptId[code], cluster_id: null, cabin_location: `${code} Block, HOD Office`, subjects: [] },
      { user_id: chId, employee_id: `BMSIT-${code}-102`, designation: "Associate Professor", department_id: deptId[code], cluster_id: otherClusters[code], cabin_location: `${code} Block, Room 201`, subjects: [] },
      { user_id: tId, employee_id: `BMSIT-${code}-103`, designation: "Assistant Professor", department_id: deptId[code], cluster_id: otherClusters[code], cabin_location: `${code} Block, Room 202`, subjects: [] },
    );
    await db.query(`update public.departments set hod_id = $1 where id = $2`, [hodId, deptId[code]]);
    await db.query(`update public.clusters set cluster_head_id = $1 where id = $2`, [chId, otherClusters[code]]);
  }
  await insert("public.teacher_profiles", teacherProfiles, "user_id");

  await db.query(`update public.departments set hod_id = $1 where id = $2`, [teacherIds.hod, deptId.CSE]);
  for (const t of CSE_TEACHERS.filter((x) => x.isClusterHead)) {
    await db.query(`update public.clusters set cluster_head_id = $1 where id = $2`, [teacherIds[t.key], clusterIdByIndex[t.cluster!]]);
  }
  console.log(`✔ staff (${teacherProfiles.length + 1} accounts)`);

  // 5. Students
  const students = buildStudents();
  const studentIds = await inBatches(students, 10, (s) => createUser(s.email, s.name, "STUDENT"));
  await insert(
    "public.student_profiles",
    students.map((s, i) => ({ user_id: studentIds[i], usn: s.usn, section_id: sectionRows[s.section].id, batch_year: s.batchYear })),
    "user_id",
  );
  await db.query(`update public.profiles set is_verified = true where email like '%@bmsit.test' or email like '%@campusconnect.test'`);
  console.log(`✔ students (${students.length})`);

  // 6. Timetables (CSE)
  const busy = new Map<string, Set<string>>(); // key "t:<teacher>" | "s:<section>" | "r:<room>"
  const isFree = (keys: string[], day: number, period: number) => keys.every((k) => !busy.get(k)?.has(`${day}-${period}`));
  const book = (keys: string[], day: number, from: number, to: number) => {
    for (const k of keys) for (let p = from; p <= to; p++) {
      if (!busy.has(k)) busy.set(k, new Set());
      busy.get(k)!.add(`${day}-${p}`);
    }
  };
  const load = new Map<string, number>();
  const entriesByTeacher = new Map<string, Record<string, unknown>[]>();
  const subjectsByTeacher = new Map<string, Set<string>>();
  const periodsFor = (day: number) => (day === 6 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7]);
  const labRooms = ["CSE Lab 1", "CSE Lab 2", "CSE Lab 3", "CSE Lab 4"];

  const pickTeacher = (section: string, code: string): string => {
    const fixed = FIXED_ASSIGNMENTS[section]?.[code];
    if (fixed) return fixed;
    const clusterIndex = CSE_CLUSTERS.findIndex((c) => c.sections.some((s) => s.name === section));
    const pool = CSE_TEACHERS.filter((t) => t.cluster === clusterIndex && t.key !== "kavitha" && t.key !== "rajesh");
    return [...pool].sort((a, b) => (load.get(a.key) ?? 0) - (load.get(b.key) ?? 0))[0].key;
  };
  const addEntry = (teacher: string, day: number, start: number, end: number, e: Record<string, unknown>) => {
    if (!entriesByTeacher.has(teacher)) entriesByTeacher.set(teacher, []);
    entriesByTeacher.get(teacher)!.push({ day_of_week: day, start_period: start, end_period: end, ...e });
    load.set(teacher, (load.get(teacher) ?? 0) + (end - start + 1));
  };

  // Labs first (P5–P7 blocks, Mon–Fri), then theory spread over different days.
  for (const [sectionName, sec] of Object.entries(sectionRows)) {
    const subjects = SUBJECTS_BY_SEM[sec.semester];
    for (const subj of subjects.filter((s) => s.type === "LAB")) {
      const teacher = pickTeacher(sectionName, subj.code);
      for (const day of shuffle([1, 2, 3, 4, 5])) {
        const room = labRooms.find((r) => [5, 6, 7].every((p) => isFree([`r:${r}`], day, p)));
        if (room && [5, 6, 7].every((p) => isFree([`t:${teacher}`, `s:${sectionName}`], day, p))) {
          book([`t:${teacher}`, `s:${sectionName}`, `r:${room}`], day, 5, 7);
          addEntry(teacher, day, 5, 7, { subject_code: subj.code, subject_name: subj.name, section_id: sec.id, semester: sec.semester, section: sectionName, room, type: "LAB" });
          subjectsByTeacher.set(teacher, new Set([...(subjectsByTeacher.get(teacher) ?? []), subj.name]));
          break;
        }
      }
    }
  }
  for (const [sectionName, sec] of Object.entries(sectionRows)) {
    for (const subj of SUBJECTS_BY_SEM[sec.semester].filter((s) => s.type === "THEORY")) {
      const teacher = pickTeacher(sectionName, subj.code);
      subjectsByTeacher.set(teacher, new Set([...(subjectsByTeacher.get(teacher) ?? []), subj.name]));
      let placed = 0;
      for (const day of shuffle([1, 2, 3, 4, 5, 6])) {
        if (placed >= subj.hours) break;
        const period = shuffle(periodsFor(day)).find((p) => isFree([`t:${teacher}`, `s:${sectionName}`], day, p));
        if (period === undefined) continue;
        book([`t:${teacher}`, `s:${sectionName}`], day, period, period);
        addEntry(teacher, day, period, period, { subject_code: subj.code, subject_name: subj.name, section_id: sec.id, semester: sec.semester, section: sectionName, room: sec.room, type: "THEORY" });
        placed++;
      }
    }
  }
  // HOD teaches one elective to 7A; every teacher has one mentoring hour.
  for (const day of [2, 4]) {
    const p = periodsFor(day).find((x) => isFree(["t:hod", "s:7A"], day, x))!;
    book(["t:hod", "s:7A"], day, p, p);
    addEntry("hod", day, p, p, { subject_code: "21CS744", subject_name: "Research Methodology", section_id: sectionRows["7A"].id, semester: 7, section: "7A", room: "301", type: "THEORY" });
  }
  for (const t of allCse) {
    const day = 1 + Math.floor(random() * 5);
    const p = [7, 6, 4].find((x) => isFree([`t:${t.key}`], day, x));
    if (p) {
      book([`t:${t.key}`], day, p, p);
      addEntry(t.key, day, p, p, { subject_code: null, subject_name: "Mentoring / Proctor Hour", section_id: null, semester: null, section: null, room: t.cabin.replace("CSE Block, ", ""), type: "MENTORING" });
    }
  }

  const publishedAt = new Date(now.getTime() - 14 * 86_400_000);
  for (const t of allCse) {
    const [version] = await insert("public.timetable_versions", [
      { teacher_id: teacherIds[t.key], status: "PUBLISHED", source: "MANUAL", published_at: publishedAt },
    ]);
    const rows = (entriesByTeacher.get(t.key) ?? []).map((e) => ({ version_id: version.id, teacher_id: teacherIds[t.key], ...e }));
    await insert("public.timetable_entries", rows);
    await db.query(`update public.teacher_profiles set subjects = $1 where user_id = $2`, [[...(subjectsByTeacher.get(t.key) ?? [])], teacherIds[t.key]]);
  }
  console.log(`✔ timetables (${allCse.length} published)`);

  // 7. Availability: preferences, leave today, overrides
  await insert(
    "public.availability_preferences",
    allCse.map((t) => ({
      teacher_id: teacherIds[t.key],
      accepting_meetings: t.key !== "pooja",
      note: `Meet at ${t.cabin.replace("CSE Block, ", "")}`,
    })),
    "teacher_id",
  );
  await insert("public.teacher_unavailability", [
    { teacher_id: teacherIds.divya, type: "FULL_DAY", half: null, periods: null, start_at: istDateTime(today, "00:00"), end_at: istDateTime(addDaysToDate(today, 1), "00:00"), reason_private: "Medical appointment" },
    { teacher_id: teacherIds.vivek, type: "HALF_DAY", half: "FN", periods: null, start_at: istDateTime(today, "09:00"), end_at: istDateTime(today, "12:55"), reason_private: "Attending VTU board meeting" },
  ]);
  await insert("public.schedule_overrides", [
    { teacher_id: teacherIds.sneha, date: today, period: 2, kind: "CANCELLED", details: "Class moved to Saturday" },
    { teacher_id: teacherIds.harish, date: today, period: 7, kind: "EXTRA", subject_name: "Remedial Class – Computer Organization", section_id: sectionRows["3C"].id, room: "103" },
  ]);
  console.log("✔ availability (2 teachers on leave today, overrides)");

  // 8. Complaints
  const settingsHolidays = [{ date: holidayDate, name: "Holiday" }];
  const daysAgo = (d: number, h = 0) => new Date(now.getTime() - d * 86_400_000 - h * 3_600_000);
  const sla = (from: Date) => addWorkingDays(from, 5, CALENDAR, settingsHolidays);
  const sid = (i: number) => studentIds[i];
  const s5A = students.findIndex((s) => s.section === "5A" && s.name !== "Aarav Kumar");
  const s5B = students.findIndex((s) => s.section === "5B");
  const s3A = students.findIndex((s) => s.section === "3A");
  const c2 = clusterIdByIndex[1];
  const c1 = clusterIdByIndex[0];

  type SeedComplaint = {
    student: string; category: string; subject: string; description: string; teacher?: string; cluster: string | null; dept: string | null;
    confidential?: boolean; status: string; assignee: string; level: string; created: Date; history: [string, string | null, string | null, string | null, Date][];
    extra?: Record<string, unknown>; messages?: [string, string, string, Date][];
  };
  const complaints: SeedComplaint[] = [
    {
      student: sid(0), category: "ACADEMIC", subject: "Internal assessment marks not updated for DBMS",
      description: "The IA-2 marks for Database Management Systems have not been updated on the portal even though the test was conducted two weeks ago. Please look into it.",
      cluster: c2, dept: deptId.CSE, status: "ASSIGNED", assignee: teacherIds.rajesh, level: "CLUSTER_HEAD", created: daysAgo(1),
      history: [["SUBMITTED", null, "SUBMITTED", "Complaint submitted", daysAgo(1)], ["ASSIGNED", "SUBMITTED", "ASSIGNED", "Routed to Cluster Head of your cluster", daysAgo(1)]],
    },
    {
      student: sid(s5A), category: "FACILITY", subject: "Projector in Room 204 not working",
      description: "The projector in Room 204 (CSE Block) has not been working for the last three days. Faculty are unable to show slides during DBMS and CN classes.",
      cluster: c2, dept: deptId.CSE, status: "UNDER_REVIEW", assignee: adminId, level: "ADMIN", created: daysAgo(3),
      history: [["SUBMITTED", null, "SUBMITTED", "Complaint submitted", daysAgo(3)], ["ASSIGNED", "SUBMITTED", "ASSIGNED", "Facilities are handled by the Administrator", daysAgo(3)], ["STATUS_CHANGED", "ASSIGNED", "UNDER_REVIEW", "Maintenance team informed", daysAgo(2)]],
      extra: { first_action_at: daysAgo(2) },
      messages: [[adminId, "PUBLIC", "Thank you for reporting. The electrical maintenance team will inspect Room 204 tomorrow morning.", daysAgo(2)]],
    },
    {
      student: sid(s5B), category: "DEPARTMENT", subject: "Department library open hours during exam week",
      description: "Request to extend the CSE department library hours till 7 PM during the internal examination week, as many students stay back to prepare.",
      cluster: c2, dept: deptId.CSE, status: "ACTION_TAKEN", assignee: teacherIds.hod, level: "HOD", created: daysAgo(6),
      history: [["SUBMITTED", null, "SUBMITTED", "Complaint submitted", daysAgo(6)], ["ASSIGNED", "SUBMITTED", "ASSIGNED", "HOD of your department", daysAgo(6)], ["STATUS_CHANGED", "ASSIGNED", "UNDER_REVIEW", null, daysAgo(5)], ["STATUS_CHANGED", "UNDER_REVIEW", "ACTION_TAKEN", "Library in-charge asked to extend hours from next week", daysAgo(2)]],
      extra: { first_action_at: daysAgo(5) },
    },
    {
      student: sid(0), category: "TEACHER", subject: "Lab sessions frequently start late", teacher: teacherIds.arjun,
      description: "The Operating Systems lab sessions for 5A have started 20–30 minutes late on most days this month, which leaves too little time to complete the experiments.",
      cluster: c2, dept: deptId.CSE, status: "RESOLVED", assignee: teacherIds.rajesh, level: "CLUSTER_HEAD", created: daysAgo(9),
      history: [["SUBMITTED", null, "SUBMITTED", "Complaint submitted", daysAgo(9)], ["ASSIGNED", "SUBMITTED", "ASSIGNED", "Cluster Head of the teacher's cluster", daysAgo(9)], ["RESPONSE_REQUESTED", "ASSIGNED", "UNDER_REVIEW", "Requested a response from the teacher", daysAgo(8)], ["TEACHER_RESPONDED", null, null, "Teacher responded", daysAgo(7)], ["RESOLVED", "UNDER_REVIEW", "RESOLVED", "Discussed with the faculty; lab will start on time from now on. Lab assistant will open the lab 10 minutes early.", daysAgo(2)]],
      extra: { first_action_at: daysAgo(8), resolved_at: daysAgo(2), resolution_remarks: "Discussed with the faculty; lab will start on time from now on.", response_requested_from: teacherIds.arjun, response_requested_at: daysAgo(8), response_received_at: daysAgo(7) },
      messages: [
        [teacherIds.rajesh, "TEACHER", "Please share your response regarding the delayed start of OS lab sessions for 5A.", daysAgo(8)],
        [teacherIds.arjun, "TEACHER", "The lab systems were being re-imaged during the first two weeks. This is now complete and sessions will start on time.", daysAgo(7)],
        [teacherIds.rajesh, "PUBLIC", "We have spoken to the faculty and the lab in-charge. Sessions will start on time from Monday.", daysAgo(2)],
      ],
    },
    {
      student: sid(s5B + 1), category: "COLLEGE", subject: "College bus timing for Yelahanka New Town route",
      description: "The Yelahanka New Town bus reaches campus after 9:05 AM on most days, so students miss the first period. Please revise the pick-up schedule.",
      cluster: null, dept: null, status: "CLOSED", assignee: adminId, level: "ADMIN", created: daysAgo(20),
      history: [["SUBMITTED", null, "SUBMITTED", "Complaint submitted", daysAgo(20)], ["ASSIGNED", "SUBMITTED", "ASSIGNED", "College-wide matters are handled by the Administrator", daysAgo(20)], ["STATUS_CHANGED", "ASSIGNED", "UNDER_REVIEW", null, daysAgo(19)], ["RESOLVED", "UNDER_REVIEW", "RESOLVED", "Bus now departs 15 minutes earlier.", daysAgo(16)], ["CLOSED", "RESOLVED", "CLOSED", "Auto-closed 7 days after resolution", daysAgo(9)]],
      extra: { first_action_at: daysAgo(19), resolved_at: daysAgo(16), resolution_remarks: "Bus now departs 15 minutes earlier.", closed_at: daysAgo(9) },
    },
    {
      student: sid(s5B + 2), category: "ACADEMIC", subject: "Mini-project guide not allotted for 5B",
      description: "Mini-project guides have been allotted for 5A but not for 5B. Our submission deadline is approaching and we have not been able to start.",
      cluster: c2, dept: deptId.CSE, status: "ESCALATED", assignee: teacherIds.hod, level: "HOD", created: daysAgo(4),
      history: [["SUBMITTED", null, "SUBMITTED", "Complaint submitted", daysAgo(4)], ["ASSIGNED", "SUBMITTED", "ASSIGNED", "Cluster Head of your cluster", daysAgo(4)], ["ESCALATED", "ASSIGNED", "ESCALATED", "Guide allotment needs HOD approval", daysAgo(1)]],
      extra: { escalated_at: daysAgo(1) },
    },
    {
      student: sid(s3A), category: "CONFIDENTIAL", subject: "Inappropriate remarks during lab session", teacher: teacherIds.karthik, confidential: true,
      description: "During a recent Data Structures lab session, a faculty member made repeated personal remarks that made several students uncomfortable. I would like this handled confidentially.",
      cluster: c1, dept: deptId.CSE, status: "UNDER_REVIEW", assignee: teacherIds.hod, level: "HOD", created: daysAgo(2),
      history: [["SUBMITTED", null, "SUBMITTED", "Complaint submitted", daysAgo(2)], ["ASSIGNED", "SUBMITTED", "ASSIGNED", "Confidential complaints go directly to the HOD", daysAgo(2)], ["STATUS_CHANGED", "ASSIGNED", "UNDER_REVIEW", null, daysAgo(1)]],
      extra: { first_action_at: daysAgo(1) },
      messages: [[teacherIds.hod, "INTERNAL", "Will speak to two other students from the batch before meeting the faculty.", daysAgo(1)]],
    },
    {
      student: sid(s3A + 1), category: "ACADEMIC", subject: "Mathematics III tutorial classes not being conducted",
      description: "Tutorial hours for Mathematics III listed in the 3A timetable have not been conducted for the past three weeks. We request that these be scheduled.",
      cluster: c1, dept: deptId.CSE, status: "ASSIGNED", assignee: teacherIds.anand, level: "CLUSTER_HEAD", created: daysAgo(9),
      history: [["SUBMITTED", null, "SUBMITTED", "Complaint submitted", daysAgo(9)], ["ASSIGNED", "SUBMITTED", "ASSIGNED", "Cluster Head of your cluster", daysAgo(9)]],
    },
  ];

  const codes: string[] = [];
  for (const c of complaints) {
    const { rows } = await db.query(`select public.next_complaint_code($1) as code`, [year]);
    codes.push(rows[0].code);
    const assignedAt = c.history.find((h) => h[2] === "ASSIGNED" || h[2] === "ESCALATED")?.[4] ?? c.created;
    const lastAssign = [...c.history].reverse().find((h) => h[2] === "ESCALATED" || h[2] === "ASSIGNED")?.[4] ?? assignedAt;
    const [row] = await insert("public.complaints", [{
      code: rows[0].code, student_id: c.student, category: c.category, subject: c.subject, description: c.description,
      teacher_id: c.teacher ?? null, department_id: c.dept, cluster_id: c.cluster, is_confidential: c.confidential ?? false,
      status: c.status, current_assignee_id: c.assignee, assignee_level: c.level, sla_due_at: sla(lastAssign),
      created_at: c.created, updated_at: c.history[c.history.length - 1][4], ...c.extra,
    }]);
    await insert("public.complaint_history", c.history.map(([action, from, to, remark, at]) => ({
      complaint_id: row.id,
      actor_id: (action === "SUBMITTED" ? c.student : action === "ASSIGNED" || action === "CLOSED" ? null : action === "TEACHER_RESPONDED" ? c.teacher ?? null : c.assignee === teacherIds.hod && action === "ESCALATED" ? teacherIds.rajesh : c.assignee) as string | null,
      action, from_status: from, to_status: to, remark, created_at: at,
      meta: JSON.stringify(action === "ASSIGNED" || action === "ESCALATED" ? { assignee_id: c.assignee } : {}),
    })));
    if (c.messages) {
      await insert("public.complaint_messages", c.messages.map(([sender, audience, body, at]) => ({ complaint_id: row.id, sender_id: sender, audience, body, created_at: at })));
    }
  }
  console.log(`✔ complaints (${complaints.length}: ${codes[0]} … ${codes[codes.length - 1]})`);

  // 9. Announcements
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  await insert("public.announcements", [
    { author_id: adminId, scope: "COLLEGE", department_id: null, cluster_id: null, audience: "BOTH", semesters: [], sections: [], pinned: true, expires_at: null, created_at: daysAgo(1),
      title: "Odd Semester (2026–27) examination timetable released",
      body: "The Semester End Examination timetable for 3rd, 5th and 7th semesters has been published. Students must collect hall tickets from the department office from next Monday. Carry your college ID card to every examination." },
    { author_id: adminId, scope: "COLLEGE", department_id: null, cluster_id: null, audience: "BOTH", semesters: [], sections: [], pinned: false, expires_at: weekAhead, created_at: daysAgo(2),
      title: "Campus Wi-Fi maintenance this Sunday",
      body: "Campus Wi-Fi will be unavailable on Sunday from 8:00 AM to 2:00 PM for network upgrades in the CSE and ECE blocks." },
    { author_id: teacherIds.hod, scope: "DEPARTMENT", department_id: deptId.CSE, cluster_id: null, audience: "STUDENTS", semesters: [5, 7], sections: [], pinned: false, expires_at: null, created_at: daysAgo(3),
      title: "Industry talk: Generative AI in Software Engineering",
      body: "The Department of CSE is organising an industry talk on Generative AI in Software Engineering on Friday at 2:40 PM in the Seminar Hall, CSE Block. Attendance is mandatory for 5th and 7th semester students." },
    { author_id: teacherIds.hod, scope: "DEPARTMENT", department_id: deptId.CSE, cluster_id: null, audience: "TEACHERS", semesters: [], sections: [], pinned: false, expires_at: null, created_at: daysAgo(1),
      title: "Faculty meeting on Monday, 3:45 PM",
      body: "All CSE faculty are requested to attend a meeting on Monday at 3:45 PM in the HOD chamber to review IA-2 results and NBA documentation." },
    { author_id: teacherIds.rajesh, scope: "CLUSTER", department_id: deptId.CSE, cluster_id: c2, audience: "STUDENTS", semesters: [], sections: ["5A", "5B"], pinned: true, expires_at: null, created_at: daysAgo(0, 3),
      title: "5A / 5B: Mini-project review schedule",
      body: "Mini-project Phase 1 reviews will be held next Wednesday and Thursday in CSE Lab 2. Each team must bring a printed synopsis signed by the guide." },
    { author_id: teacherIds.anand, scope: "CLUSTER", department_id: deptId.CSE, cluster_id: c1, audience: "STUDENTS", semesters: [3], sections: [], pinned: false, expires_at: null, created_at: daysAgo(4),
      title: "3rd semester proctor meeting",
      body: "All 3rd semester students of Cluster 1 must meet their proctors this week to review attendance and IA-1 marks." },
  ]);
  console.log("✔ announcements (6)");

  // 10. Starter notifications for the demo accounts
  await insert("public.notifications", [
    { user_id: teacherIds.rajesh, type: "COMPLAINT_ASSIGNED", title: `New complaint assigned: ${codes[0]}`, body: "Internal assessment marks not updated for DBMS", link: `/complaints/${codes[0]}`, created_at: daysAgo(1) },
    { user_id: teacherIds.hod, type: "COMPLAINT_ESCALATED", title: `Complaint escalated to you: ${codes[5]}`, body: "Mini-project guide not allotted for 5B", link: `/complaints/${codes[5]}`, created_at: daysAgo(1) },
    { user_id: teacherIds.hod, type: "COMPLAINT_ASSIGNED", title: `Confidential complaint received: ${codes[6]}`, body: "Handle with care. Student identity is visible only to you and the Administrator.", link: `/complaints/${codes[6]}`, created_at: daysAgo(2) },
    { user_id: studentIds[0], type: "COMPLAINT_RESOLVED", title: `Your complaint was resolved: ${codes[3]}`, body: "You can reopen it within 7 days if the issue continues.", link: `/complaints/${codes[3]}`, created_at: daysAgo(2) },
    { user_id: studentIds[0], type: "ANNOUNCEMENT", title: "New notice: 5A / 5B: Mini-project review schedule", body: "From Dr. Rajesh Sharma · Cluster 2", link: "/notices", created_at: daysAgo(0, 3) },
    { user_id: teacherIds.rajesh, type: "TEACHER_UNAVAILABLE", title: "Ms. Divya Shetty is unavailable today", body: "Full day. Affected sections have been notified.", link: "/cluster-head/teachers", created_at: daysAgo(0, 5) },
    { user_id: adminId, type: "COMPLAINT_ASSIGNED", title: `New complaint assigned: ${codes[1]}`, body: "Projector in Room 204 not working", link: `/complaints/${codes[1]}`, created_at: daysAgo(3) },
  ]);
  await insert("public.audit_logs", [
    { actor_id: adminId, action: "SEED", entity: "college", entity_id: null, meta: JSON.stringify({ note: "Demo data loaded" }) },
  ]);

  console.log(`\nDone. All seeded accounts use the password: ${PASSWORD}`);
  console.log("Demo logins: student@ / teacher@ / clusterhead@ / hod@ / admin@campusconnect.test");
  await db.end();
}

main().catch(async (err) => {
  console.error("\nSeeding failed:", err.message ?? err);
  await db.end().catch(() => {});
  process.exit(1);
});
