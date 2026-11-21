"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import {
  clusterSchema,
  departmentSchema,
  holidaySchema,
  periodSlotsSchema,
  sectionSchema,
  settingsSchema,
  studentCsvRow,
  teacherCsvRow,
} from "@/lib/validators/admin";
import { fail, guard, ok, parse, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";

const uuid = z.uuid();
const admin = () => createAdminClient();
const done = (path = "/admin") => revalidatePath(path, "layout");

// ---------------------------------------------------------------- users
export async function setUserFlag(userId: string, flag: "is_active" | "is_verified", value: boolean): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    if (!uuid.safeParse(userId).success) return fail("Invalid user.");
    if (userId === me.id && flag === "is_active" && !value) return fail("You cannot deactivate your own account.");
    const { error } = await admin().from("profiles").update({ [flag]: value }).eq("id", userId);
    if (error) return fail(error.message);
    await audit(me.id, flag === "is_active" ? (value ? "USER_ACTIVATED" : "USER_DEACTIVATED") : value ? "USER_VERIFIED" : "USER_UNVERIFIED", "profiles", userId);
    done();
    return ok(undefined, "Saved.");
  });
}

/** Student / Teacher / Admin. Cluster Head and HOD are assigned from the structure page. */
export async function changeUserRole(userId: string, role: "STUDENT" | "TEACHER" | "ADMIN"): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    if (!uuid.safeParse(userId).success || !["STUDENT", "TEACHER", "ADMIN"].includes(role)) return fail("Invalid input.");
    if (userId === me.id) return fail("You cannot change your own role.");
    const db = admin();
    const { data: p } = await db.from("profiles").select("role").eq("id", userId).single();
    if (p?.role === "HOD" || p?.role === "CLUSTER_HEAD") return fail("Unassign this person as HOD / Cluster Head on the Structure page first.");
    if (role === "TEACHER") {
      const { data: tp } = await db.from("teacher_profiles").select("user_id").eq("user_id", userId).maybeSingle();
      if (!tp) return fail("This user has no teacher profile (employee ID, department). Import them as a teacher instead.");
    }
    if (role === "STUDENT") {
      const { data: sp } = await db.from("student_profiles").select("user_id").eq("user_id", userId).maybeSingle();
      if (!sp) return fail("This user has no student profile (USN, section).");
    }
    const { error } = await db.from("profiles").update({ role }).eq("id", userId);
    if (error) return fail(error.message);
    await audit(me.id, "ROLE_CHANGED", "profiles", userId, { from: p?.role, to: role });
    done();
    return ok(undefined, "Role updated. It applies on the user's next page load.");
  });
}

// ---------------------------------------------------------------- structure
export async function createDepartment(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    const p = parse(departmentSchema, input);
    if ("error" in p) return fail(p.error);
    const { data, error } = await admin().from("departments").insert({ code: p.data.code, name: p.data.name }).select("id").single();
    if (error) return fail(error.code === "23505" ? "A department with this code already exists." : error.message);
    await audit(me.id, "DEPARTMENT_CREATED", "departments", data.id, p.data);
    done();
    return ok(undefined, `Department ${p.data.code} created.`);
  });
}

export async function createCluster(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    const p = parse(clusterSchema, input);
    if ("error" in p) return fail(p.error);
    const { data, error } = await admin().from("clusters").insert({ department_id: p.data.departmentId, name: p.data.name }).select("id").single();
    if (error) return fail(error.code === "23505" ? "This department already has a cluster with that name." : error.message);
    await audit(me.id, "CLUSTER_CREATED", "clusters", data.id, p.data);
    done();
    return ok(undefined, `${p.data.name} created.`);
  });
}

export async function createSection(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    const p = parse(sectionSchema, input);
    if ("error" in p) return fail(p.error);
    const { data, error } = await admin()
      .from("sections")
      .insert({ department_id: p.data.departmentId, cluster_id: p.data.clusterId, name: p.data.name, semester: Number(p.data.name[0]), home_room: p.data.homeRoom || null })
      .select("id")
      .single();
    if (error) return fail(error.code === "23505" ? "This section already exists in the department." : error.message);
    await audit(me.id, "SECTION_CREATED", "sections", data.id, p.data);
    done();
    return ok(undefined, `Section ${p.data.name} created.`);
  });
}

export async function deleteStructureItem(kind: "cluster" | "section", id: string): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    if (!uuid.safeParse(id).success) return fail("Invalid item.");
    const db = admin();
    if (kind === "cluster") {
      const [{ count: s }, { count: t }] = await Promise.all([
        db.from("sections").select("id", { count: "exact", head: true }).eq("cluster_id", id),
        db.from("teacher_profiles").select("user_id", { count: "exact", head: true }).eq("cluster_id", id),
      ]);
      if ((s ?? 0) + (t ?? 0) > 0) return fail("Move its sections and teachers to another cluster first.");
      const { data: c } = await db.from("clusters").select("cluster_head_id").eq("id", id).single();
      if (c?.cluster_head_id) await db.from("profiles").update({ role: "TEACHER" }).eq("id", c.cluster_head_id);
    } else {
      const { count } = await db.from("student_profiles").select("user_id", { count: "exact", head: true }).eq("section_id", id);
      if ((count ?? 0) > 0) return fail("This section has students. Move them first.");
    }
    const { error } = await db.from(kind === "cluster" ? "clusters" : "sections").delete().eq("id", id);
    if (error) return fail(error.message);
    await audit(me.id, `${kind.toUpperCase()}_DELETED`, kind === "cluster" ? "clusters" : "sections", id);
    done();
    return ok(undefined, "Deleted.");
  });
}

/** Appoint (or clear) the HOD of a department. Exactly one per department. */
export async function assignHod(departmentId: string, teacherId: string | null): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    if (!uuid.safeParse(departmentId).success || (teacherId && !uuid.safeParse(teacherId).success)) return fail("Invalid input.");
    const db = admin();
    const { data: dept } = await db.from("departments").select("id, code, hod_id").eq("id", departmentId).single();
    if (!dept) return fail("Department not found.");
    if (teacherId) {
      const { data: tp } = await db.from("teacher_profiles").select("department_id").eq("user_id", teacherId).maybeSingle();
      if (!tp || tp.department_id !== departmentId) return fail("The HOD must be a teacher of this department.");
      const { data: other } = await db.from("departments").select("code").eq("hod_id", teacherId).neq("id", departmentId).maybeSingle();
      if (other) return fail(`This teacher is already HOD of ${other.code}.`);
      // A new HOD stops being a Cluster Head
      const { data: headed } = await db.from("clusters").select("id").eq("cluster_head_id", teacherId);
      if (headed?.length) await db.from("clusters").update({ cluster_head_id: null }).eq("cluster_head_id", teacherId);
    }
    if (dept.hod_id && dept.hod_id !== teacherId) {
      await db.from("departments").update({ hod_id: null }).eq("id", departmentId);
      await db.from("profiles").update({ role: "TEACHER" }).eq("id", dept.hod_id);
    }
    if (teacherId) {
      const { error } = await db.from("departments").update({ hod_id: teacherId }).eq("id", departmentId);
      if (error) return fail(error.message);
      await db.from("profiles").update({ role: "HOD" }).eq("id", teacherId);
    }
    await audit(me.id, "HOD_ASSIGNED", "departments", departmentId, { previous: dept.hod_id, next: teacherId });
    done();
    return ok(undefined, teacherId ? `HOD of ${dept.code} updated.` : `${dept.code} now has no HOD.`);
  });
}

/** Appoint (or clear) the Cluster Head. Exactly one per cluster; the teacher joins that cluster. */
export async function assignClusterHead(clusterId: string, teacherId: string | null): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    if (!uuid.safeParse(clusterId).success || (teacherId && !uuid.safeParse(teacherId).success)) return fail("Invalid input.");
    const db = admin();
    const { data: cluster } = await db.from("clusters").select("id, name, department_id, cluster_head_id").eq("id", clusterId).single();
    if (!cluster) return fail("Cluster not found.");
    if (teacherId) {
      const { data: tp } = await db.from("teacher_profiles").select("department_id").eq("user_id", teacherId).maybeSingle();
      if (!tp || tp.department_id !== cluster.department_id) return fail("The Cluster Head must be a teacher of the same department.");
      const { data: isHod } = await db.from("departments").select("id").eq("hod_id", teacherId).maybeSingle();
      if (isHod) return fail("An HOD cannot also be a Cluster Head.");
      const { data: other } = await db.from("clusters").select("name").eq("cluster_head_id", teacherId).neq("id", clusterId).maybeSingle();
      if (other) return fail(`This teacher already heads ${other.name}.`);
    }
    if (cluster.cluster_head_id && cluster.cluster_head_id !== teacherId) {
      await db.from("clusters").update({ cluster_head_id: null }).eq("id", clusterId);
      await db.from("profiles").update({ role: "TEACHER" }).eq("id", cluster.cluster_head_id);
    }
    if (teacherId) {
      await db.from("teacher_profiles").update({ cluster_id: clusterId }).eq("user_id", teacherId);
      const { error } = await db.from("clusters").update({ cluster_head_id: teacherId }).eq("id", clusterId);
      if (error) return fail(error.message);
      await db.from("profiles").update({ role: "CLUSTER_HEAD" }).eq("id", teacherId);
    }
    await audit(me.id, "CLUSTER_HEAD_ASSIGNED", "clusters", clusterId, { previous: cluster.cluster_head_id, next: teacherId });
    done();
    return ok(undefined, teacherId ? `Cluster Head of ${cluster.name} updated.` : `${cluster.name} now has no Cluster Head.`);
  });
}

export async function moveTeacherToCluster(teacherId: string, clusterId: string | null): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    if (!uuid.safeParse(teacherId).success || (clusterId && !uuid.safeParse(clusterId).success)) return fail("Invalid input.");
    const db = admin();
    const { data: headed } = await db.from("clusters").select("id").eq("cluster_head_id", teacherId).maybeSingle();
    if (headed && headed.id !== clusterId) return fail("Reassign the Cluster Head role before moving this teacher.");
    const { error } = await db.from("teacher_profiles").update({ cluster_id: clusterId }).eq("user_id", teacherId);
    if (error) return fail(error.code === "23503" ? "The cluster must belong to the teacher's department." : error.message);
    await audit(me.id, "TEACHER_MOVED", "teacher_profiles", teacherId, { clusterId });
    done();
    return ok(undefined, "Teacher moved.");
  });
}

// ---------------------------------------------------------------- calendar
export async function savePeriodSlots(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    const p = parse(periodSlotsSchema, input);
    if ("error" in p) return fail(p.error);
    const db = admin();
    let n = 0;
    const rows = p.data.map((s, i) => ({ label: s.label, start_time: s.start, end_time: s.end, is_break: s.isBreak, period_no: s.isBreak ? null : ++n, sort_order: i + 1 }));
    const { error: delErr } = await db.from("period_slots").delete().gte("sort_order", 0);
    if (delErr) return fail(delErr.message);
    const { error } = await db.from("period_slots").insert(rows);
    if (error) return fail(error.message);
    await audit(me.id, "PERIOD_SLOTS_SAVED", "period_slots", null, { periods: n, slots: rows.length });
    revalidatePath("/", "layout");
    return ok(undefined, `Saved ${n} periods and ${rows.length - n} breaks.`);
  });
}

export async function saveCollegeSettings(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    const p = parse(settingsSchema, input);
    if ("error" in p) return fail(p.error);
    const v = p.data;
    const { error } = await admin()
      .from("college_settings")
      .update({ working_days: v.workingDays, saturday_rule: v.saturdayRule, college_start: v.collegeStart, college_end: v.collegeEnd, academic_year: v.academicYear, semester_type: v.semesterType, sla_working_days: v.slaWorkingDays })
      .eq("id", 1);
    if (error) return fail(error.message);
    await audit(me.id, "SETTINGS_SAVED", "college_settings", "1", v);
    revalidatePath("/", "layout");
    return ok(undefined, "College settings saved.");
  });
}

export async function addHoliday(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    const p = parse(holidaySchema, input);
    if ("error" in p) return fail(p.error);
    const { data, error } = await admin().from("holidays").insert(p.data).select("id").single();
    if (error) return fail(error.code === "23505" ? "There is already a holiday on this date." : error.message);
    await audit(me.id, "HOLIDAY_ADDED", "holidays", data.id, p.data);
    revalidatePath("/", "layout");
    return ok(undefined, "Holiday added.");
  });
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    if (!uuid.safeParse(id).success) return fail("Invalid holiday.");
    const { error } = await admin().from("holidays").delete().eq("id", id);
    if (error) return fail(error.message);
    await audit(me.id, "HOLIDAY_DELETED", "holidays", id);
    revalidatePath("/", "layout");
    return ok(undefined, "Holiday removed.");
  });
}

// ---------------------------------------------------------------- CSV import
export type ImportRowResult = { row: number; email: string; ok: boolean; message: string };

/**
 * Bulk import students or teachers (already previewed/validated in the
 * browser; validated again here). New accounts get the default password and
 * are marked verified.
 */
export async function importUsers(kind: "students" | "teachers", rows: unknown[]): Promise<ActionResult<{ results: ImportRowResult[]; password: string }>> {
  return guard(async () => {
    const me = await requireRole(["ADMIN"]);
    if (!Array.isArray(rows) || rows.length === 0) return fail("No rows to import.");
    if (rows.length > 300) return fail("Import at most 300 rows at a time.");
    const db = admin();
    const password = process.env.IMPORT_DEFAULT_PASSWORD ?? "Bmsit@2026";
    const [{ data: depts }, { data: sections }, { data: clusters }] = await Promise.all([
      db.from("departments").select("id, code"),
      db.from("sections").select("id, name, department_id"),
      db.from("clusters").select("id, name, department_id"),
    ]);
    const deptByCode = new Map((depts ?? []).map((d) => [d.code, d.id]));
    const results: ImportRowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] as Record<string, string>;
      const schema = kind === "students" ? studentCsvRow : teacherCsvRow;
      const parsed = schema.safeParse(raw);
      const email = String(raw?.email ?? "");
      if (!parsed.success) {
        results.push({ row: i + 1, email, ok: false, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }
      const v = parsed.data as any;
      const deptId = deptByCode.get(v.department_code);
      if (!deptId) {
        results.push({ row: i + 1, email, ok: false, message: `Unknown department ${v.department_code}` });
        continue;
      }
      let sectionId: string | null = null;
      let clusterId: string | null = null;
      if (kind === "students") {
        sectionId = (sections ?? []).find((s) => s.department_id === deptId && s.name === v.section)?.id ?? null;
        if (!sectionId) { results.push({ row: i + 1, email, ok: false, message: `Section ${v.section} not found in ${v.department_code}` }); continue; }
      } else if (v.cluster_name) {
        clusterId = (clusters ?? []).find((c) => c.department_id === deptId && c.name.toLowerCase() === v.cluster_name.toLowerCase())?.id ?? null;
        if (!clusterId) { results.push({ row: i + 1, email, ok: false, message: `Cluster "${v.cluster_name}" not found in ${v.department_code}` }); continue; }
      }

      const role = kind === "students" ? "STUDENT" : "TEACHER";
      const { data: created, error } = await db.auth.admin.createUser({ email: v.email, password, email_confirm: true, app_metadata: { role }, user_metadata: { full_name: v.full_name } });
      if (error || !created.user) {
        results.push({ row: i + 1, email, ok: false, message: error?.message.includes("already") ? "Email already registered" : (error?.message ?? "Could not create user") });
        continue;
      }
      const uid = created.user.id;
      const profileErr =
        kind === "students"
          ? (await db.from("student_profiles").insert({ user_id: uid, usn: v.usn, section_id: sectionId, batch_year: 2000 + Number(v.usn.slice(3, 5)) })).error
          : (await db.from("teacher_profiles").insert({ user_id: uid, employee_id: v.employee_id, designation: v.designation || "Assistant Professor", department_id: deptId, cluster_id: clusterId, cabin_location: v.cabin_location || null })).error;
      if (profileErr) {
        await db.auth.admin.deleteUser(uid);
        results.push({ row: i + 1, email, ok: false, message: profileErr.code === "23505" ? (kind === "students" ? "USN already exists" : "Employee ID already exists") : profileErr.message });
        continue;
      }
      await db.from("profiles").update({ full_name: v.full_name, is_verified: true }).eq("id", uid);
      if (kind === "teachers") await db.from("availability_preferences").insert({ teacher_id: uid, accepting_meetings: true });
      results.push({ row: i + 1, email, ok: true, message: "Created" });
    }

    const created = results.filter((r) => r.ok).length;
    await audit(me.id, "CSV_IMPORT", kind, null, { rows: rows.length, created });
    done();
    return ok({ results, password }, `Imported ${created} of ${rows.length}.`);
  });
}
