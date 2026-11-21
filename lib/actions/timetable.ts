"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { rolesForPath } from "@/lib/auth/roles";
import { getCalendar } from "@/lib/data/calendar";
import { saveDraftSchema } from "@/lib/validators/timetable";
import { teachingPeriods } from "@/lib/services/periods";
import { hasBlockingIssues, summarize, validateTimetable } from "@/lib/services/timetableValidation";
import { loadOtherEntries, mapDraftRow } from "@/lib/data/timetable";
import { fail, guard, ok, parse, type ActionResult } from "@/lib/server/action";
import { notify } from "@/lib/server/notify";
import { audit } from "@/lib/server/audit";

type Admin = ReturnType<typeof createAdminClient>;
const teacherRoles = () => rolesForPath("/teacher")!;

async function ensureDraft(admin: Admin, teacherId: string, source: "MANUAL" | "UPLOAD", filePath?: string | null) {
  const { data: draft } = await admin.from("timetable_versions").select("id").eq("teacher_id", teacherId).eq("status", "DRAFT").maybeSingle();
  if (draft) {
    if (source === "UPLOAD") await admin.from("timetable_versions").update({ source, file_path: filePath ?? null }).eq("id", draft.id);
    return draft.id as string;
  }
  const { data, error } = await admin
    .from("timetable_versions")
    .insert({ teacher_id: teacherId, status: "DRAFT", source, file_path: filePath ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Replace the teacher's draft with the editor's entries. */
export async function saveTimetableDraft(input: unknown): Promise<ActionResult<{ versionId: string }>> {
  return guard(async () => {
    const user = await requireRole(teacherRoles());
    const p = parse(saveDraftSchema, input);
    if ("error" in p) return fail(p.error);
    // The scan was uploaded straight to Storage; only accept a path in this teacher's own folder.
    if (p.data.filePath && !p.data.filePath.startsWith(`${user.id}/`)) return fail("Invalid timetable file reference.");
    const admin = createAdminClient();
    const versionId = await ensureDraft(admin, user.id, p.data.source, p.data.filePath);

    const sectionIds = [...new Set(p.data.entries.map((e) => e.sectionId).filter((x): x is string => !!x))];
    const { data: sections } = sectionIds.length ? await admin.from("sections").select("id, name, semester").in("id", sectionIds) : { data: [] as any[] };
    const sectionById = new Map((sections ?? []).map((s) => [s.id, s]));

    await admin.from("timetable_entries").delete().eq("version_id", versionId);
    if (p.data.entries.length) {
      const { error } = await admin.from("timetable_entries").insert(
        p.data.entries.map((e) => {
          const s = e.sectionId ? sectionById.get(e.sectionId) : null;
          return {
            version_id: versionId,
            teacher_id: user.id,
            day_of_week: e.dayOfWeek,
            start_period: e.startPeriod,
            end_period: e.endPeriod,
            subject_code: e.subjectCode || null,
            subject_name: e.subjectName,
            section_id: s ? s.id : null,
            section: s ? s.name : null,
            semester: s ? s.semester : null,
            room: e.room || null,
            type: e.type,
            low_confidence: e.lowConfidence ?? false,
          };
        }),
      );
      if (error) {
        return fail(error.message.includes("exclude") || error.code === "23P01" ? "Two classes overlap in the same period. Fix the conflict and save again." : error.message);
      }
    }
    revalidatePath("/teacher/timetable");
    return ok({ versionId }, "Draft saved.");
  });
}

/**
 * Publish the draft: server-side validation (errors block, warnings don't),
 * archive the previously published version, make the draft live, notify.
 */
export async function publishTimetable(): Promise<ActionResult<{ classes: number; labs: number; warnings: number }>> {
  return guard(async () => {
    const user = await requireRole(teacherRoles());
    const admin = createAdminClient();
    const { data: draft } = await admin.from("timetable_versions").select("id").eq("teacher_id", user.id).eq("status", "DRAFT").maybeSingle();
    if (!draft) return fail("There is no draft to publish. Make a change first.");

    const { data: rows } = await admin.from("timetable_entries").select("*").eq("version_id", draft.id);
    const entries = (rows ?? []).map(mapDraftRow);
    const { periods } = await getCalendar();
    const issues = validateTimetable(entries, {
      validPeriods: teachingPeriods(periods).map((p) => p.periodNo!),
      otherEntries: await loadOtherEntries(admin, user.id),
    });
    if (hasBlockingIssues(issues)) return fail(issues.find((i) => i.severity === "error")!.message);

    const now = new Date().toISOString();
    await admin.from("timetable_versions").update({ status: "ARCHIVED" }).eq("teacher_id", user.id).eq("status", "PUBLISHED");
    const { error } = await admin.from("timetable_versions").update({ status: "PUBLISHED", published_at: now }).eq("id", draft.id);
    if (error) return fail(error.message);

    const subjects = [...new Set(entries.map((e) => e.subjectName))];
    await admin.from("teacher_profiles").update({ subjects }).eq("user_id", user.id);

    const sectionIds = [...new Set(entries.map((e) => e.sectionId).filter((x): x is string => !!x))];
    if (sectionIds.length) {
      const { data: students } = await admin.from("student_profiles").select("user_id").in("section_id", sectionIds);
      await notify((students ?? []).map((s) => s.user_id), {
        type: "TIMETABLE_PUBLISHED",
        title: `${user.fullName} published an updated timetable`,
        body: "Your section's classes may have changed. Check today's classes.",
        link: `/teachers/${user.id}`,
      });
    }
    const { data: tp } = await admin.from("teacher_profiles").select("clusters(cluster_head_id)").eq("user_id", user.id).maybeSingle();
    const chId = (tp as any)?.clusters?.cluster_head_id;
    if (chId && chId !== user.id) {
      await notify([chId], { type: "TIMETABLE_PUBLISHED", title: `${user.fullName} published their timetable`, link: `/teachers/${user.id}` });
    }

    const s = summarize(entries);
    const warnings = issues.filter((i) => i.severity === "warning").length;
    await audit(user.id, "TIMETABLE_PUBLISHED", "timetable_versions", draft.id, { ...s, warnings });
    revalidatePath("/teacher", "layout");
    revalidatePath("/teachers", "layout");
    return ok({ classes: s.classes, labs: s.labs, warnings }, `Published: ${s.classes} classes, ${s.labs} labs.`);
  });
}

export async function discardTimetableDraft(): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireRole(teacherRoles());
    const admin = createAdminClient();
    const { error } = await admin.from("timetable_versions").delete().eq("teacher_id", user.id).eq("status", "DRAFT");
    if (error) return fail(error.message);
    revalidatePath("/teacher/timetable");
    return ok(undefined, "Draft discarded. The published timetable is unchanged.");
  });
}
