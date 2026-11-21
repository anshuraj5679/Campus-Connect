"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, type CurrentUser } from "@/lib/auth/session";
import { getCalendar } from "@/lib/data/calendar";
import { saveRoutineSchema } from "@/lib/validators/timetable";
import { sectionField } from "@/lib/validators/auth";
import { teachingPeriods } from "@/lib/services/periods";
import { hasBlockingIssues, summarize, validateTimetable } from "@/lib/services/timetableValidation";
import { fail, guard, ok, parse, type ActionResult } from "@/lib/server/action";
import { notify } from "@/lib/server/notify";
import { audit } from "@/lib/server/audit";

/**
 * Section routines: the Cluster Head uploads and publishes the class routine
 * of every section in their cluster (HOD of the department and admin may too).
 * Students see their section's published routine on their dashboard.
 */

type Admin = ReturnType<typeof createAdminClient>;
const MANAGERS = ["CLUSTER_HEAD", "HOD", "ADMIN"] as const;

/** Load the section and check the user may manage its routine. */
async function managedSection(admin: Admin, user: CurrentUser, sectionId: string) {
  const { data: s } = await admin
    .from("sections")
    .select("id, name, department_id, cluster_id, departments(code, hod_id), clusters(name, cluster_head_id)")
    .eq("id", sectionId)
    .maybeSingle();
  if (!s) return null;
  const allowed =
    user.role === "ADMIN" ||
    (s as any).clusters?.cluster_head_id === user.id ||
    (s as any).departments?.hod_id === user.id;
  if (!allowed) return null;
  return { id: s.id as string, name: s.name as string, label: `${(s as any).departments?.code ?? ""} ${s.name}`.trim(), clusterId: s.cluster_id as string, departmentId: s.department_id as string };
}

const sectionIdSchema = z.uuid();

function revalidateRoutine(sectionId: string) {
  revalidatePath("/cluster-head/routines");
  revalidatePath(`/cluster-head/routines/${sectionId}`);
  revalidatePath("/student");
}

/** Replace the section's routine draft with the editor's entries. */
export async function saveRoutineDraft(input: unknown): Promise<ActionResult<{ timetableId: string }>> {
  return guard(async () => {
    const user = await requireRole(MANAGERS);
    const p = parse(saveRoutineSchema, input);
    if ("error" in p) return fail(p.error);
    const admin = createAdminClient();
    const section = await managedSection(admin, user, p.data.sectionId);
    if (!section) return fail("You can only manage routines of sections in your own cluster.");
    // The PDF went straight to Storage: accept a path in this user's own folder,
    // or the file already attached to this section's routine (editing without re-uploading).
    if (p.data.filePath && !p.data.filePath.startsWith(`${user.id}/`)) {
      const { data: attached } = await admin.from("section_timetables").select("id").eq("section_id", section.id).eq("file_path", p.data.filePath).limit(1);
      if (!attached?.length) return fail("Invalid routine file reference.");
    }

    // Only keep teacher ids that are real faculty accounts.
    const teacherIds = [...new Set(p.data.entries.map((e) => e.teacherId).filter((x): x is string => !!x))];
    const { data: known } = teacherIds.length ? await admin.from("teacher_profiles").select("user_id").in("user_id", teacherIds) : { data: [] as any[] };
    const validTeacher = new Set((known ?? []).map((t) => t.user_id as string));

    let { data: draft } = await admin.from("section_timetables").select("id, file_path").eq("section_id", section.id).eq("status", "DRAFT").maybeSingle();
    if (!draft) {
      const created = await admin
        .from("section_timetables")
        .insert({ section_id: section.id, status: "DRAFT", uploaded_by: user.id, file_path: p.data.filePath ?? null })
        .select("id, file_path")
        .single();
      if (created.error) return fail(created.error.message);
      draft = created.data;
    } else if (p.data.filePath && p.data.filePath !== draft.file_path) {
      await admin.from("section_timetables").update({ file_path: p.data.filePath, uploaded_by: user.id }).eq("id", draft.id);
    }

    await admin.from("section_timetable_entries").delete().eq("timetable_id", draft.id);
    if (p.data.entries.length) {
      const { error } = await admin.from("section_timetable_entries").insert(
        p.data.entries.map((e) => ({
          timetable_id: draft!.id,
          day_of_week: e.dayOfWeek,
          start_period: e.startPeriod,
          end_period: e.endPeriod,
          subject_code: e.subjectCode || null,
          subject_name: e.subjectName,
          teacher_id: e.teacherId && validTeacher.has(e.teacherId) ? e.teacherId : null,
          teacher_name: e.teacherName?.trim() || null,
          room: e.room || null,
          type: e.type,
          low_confidence: e.lowConfidence ?? false,
        })),
      );
      if (error) {
        return fail(error.code === "23P01" ? "Two classes overlap in the same period. A section can't have two classes at once." : error.message);
      }
    }
    revalidateRoutine(section.id);
    return ok({ timetableId: draft.id as string }, "Draft saved.");
  });
}

/** Publish the section's draft routine: validate, archive the old one, go live, notify the students. */
export async function publishRoutine(sectionId: unknown): Promise<ActionResult<{ classes: number }>> {
  return guard(async () => {
    const user = await requireRole(MANAGERS);
    const id = sectionIdSchema.safeParse(sectionId);
    if (!id.success) return fail("Invalid section.");
    const admin = createAdminClient();
    const section = await managedSection(admin, user, id.data);
    if (!section) return fail("You can only manage routines of sections in your own cluster.");

    const { data: draft } = await admin.from("section_timetables").select("id").eq("section_id", section.id).eq("status", "DRAFT").maybeSingle();
    if (!draft) return fail("There is no draft to publish. Upload or edit the routine first.");
    const { data: rows } = await admin.from("section_timetable_entries").select("*").eq("timetable_id", draft.id);
    const entries = (rows ?? []).map((r: any) => ({
      id: r.id,
      dayOfWeek: r.day_of_week,
      startPeriod: r.start_period,
      endPeriod: r.end_period,
      subjectCode: r.subject_code,
      subjectName: r.subject_name,
      sectionId: section.id,
      section: section.name,
      semester: null,
      room: r.room,
      type: r.type,
      lowConfidence: r.low_confidence,
    }));
    const { periods } = await getCalendar();
    const issues = validateTimetable(entries, { validPeriods: teachingPeriods(periods).map((p) => p.periodNo!), otherEntries: [], requireSection: false });
    if (hasBlockingIssues(issues)) return fail(issues.find((i) => i.severity === "error")!.message.replace("timetable", "routine"));

    const { data: previous } = await admin.from("section_timetables").select("id").eq("section_id", section.id).eq("status", "PUBLISHED").maybeSingle();
    await admin.from("section_timetables").update({ status: "ARCHIVED" }).eq("section_id", section.id).eq("status", "PUBLISHED");
    const { error } = await admin.from("section_timetables").update({ status: "PUBLISHED", published_at: new Date().toISOString(), uploaded_by: user.id }).eq("id", draft.id);
    if (error) return fail(error.message);

    const { data: students } = await admin.from("student_profiles").select("user_id").eq("section_id", section.id);
    await notify((students ?? []).map((s) => s.user_id), {
      type: "TIMETABLE_PUBLISHED",
      title: previous ? `Section ${section.name} routine updated` : `Section ${section.name} routine published`,
      body: `${user.fullName} ${previous ? "updated" : "published"} your class routine. Check today's classes on your dashboard.`,
      link: "/student",
    });
    const s = summarize(entries);
    await audit(user.id, "ROUTINE_PUBLISHED", "section_timetables", draft.id, { section: section.label, ...s, students: students?.length ?? 0 });
    revalidateRoutine(section.id);
    const n = students?.length ?? 0;
    return ok({ classes: s.classes }, `Section ${section.name}: ${s.classes} classes are live for ${n} student${n === 1 ? "" : "s"}.`);
  });
}

export async function discardRoutineDraft(sectionId: unknown): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireRole(MANAGERS);
    const id = sectionIdSchema.safeParse(sectionId);
    if (!id.success) return fail("Invalid section.");
    const admin = createAdminClient();
    const section = await managedSection(admin, user, id.data);
    if (!section) return fail("You can only manage routines of sections in your own cluster.");
    const { error } = await admin.from("section_timetables").delete().eq("section_id", section.id).eq("status", "DRAFT");
    if (error) return fail(error.message);
    revalidateRoutine(section.id);
    return ok(undefined, "Draft discarded. The published routine is unchanged.");
  });
}

/** Add a section to the Cluster Head's cluster (so its routine can be uploaded before students sign up). */
export async function addClusterSection(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const user = await requireRole(["CLUSTER_HEAD"]);
    const p = parse(z.object({ name: sectionField }), input);
    if ("error" in p) return fail(p.error);
    const admin = createAdminClient();
    const { data: cluster } = await admin.from("clusters").select("id, name, department_id").eq("cluster_head_id", user.id).maybeSingle();
    if (!cluster) return fail("You are not the Cluster Head of any cluster.");
    const { data: existing } = await admin.from("sections").select("id, cluster_id, clusters(name)").eq("department_id", cluster.department_id).eq("name", p.data.name).maybeSingle();
    if (existing) {
      return existing.cluster_id === cluster.id
        ? fail(`Section ${p.data.name} is already in your cluster.`)
        : fail(`Section ${p.data.name} already belongs to ${(existing as any).clusters?.name ?? "another cluster"}.`);
    }
    const { data, error } = await admin
      .from("sections")
      .insert({ department_id: cluster.department_id, cluster_id: cluster.id, semester: Number(p.data.name[0]), name: p.data.name })
      .select("id")
      .single();
    if (error) return fail(error.code === "23505" ? `Section ${p.data.name} already exists.` : error.message);
    await audit(user.id, "SECTION_CREATED", "sections", data.id, { name: p.data.name, cluster: cluster.name });
    revalidatePath("/cluster-head/routines");
    return ok({ id: data.id as string }, `Section ${p.data.name} added to ${cluster.name}.`);
  });
}
