import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DraftEntry, OtherEntry } from "@/lib/services/timetableValidation";

type Admin = ReturnType<typeof createAdminClient>;

export function mapDraftRow(r: any): DraftEntry {
  return {
    id: r.id,
    dayOfWeek: r.day_of_week,
    startPeriod: r.start_period,
    endPeriod: r.end_period,
    subjectCode: r.subject_code,
    subjectName: r.subject_name,
    sectionId: r.section_id,
    section: r.section,
    semester: r.semester,
    room: r.room,
    type: r.type,
    lowConfidence: r.low_confidence ?? false,
  };
}

/** Published entries of all OTHER teachers (for room/section clash warnings). */
export async function loadOtherEntries(admin: Admin, teacherId: string): Promise<OtherEntry[]> {
  const { data } = await admin
    .from("timetable_entries")
    .select("*, timetable_versions!inner(status), profiles!timetable_entries_teacher_id_fkey(full_name)")
    .eq("timetable_versions.status", "PUBLISHED")
    .neq("teacher_id", teacherId);
  return (data ?? []).map((r: any) => ({ ...mapDraftRow(r), teacherName: r.profiles?.full_name ?? "another teacher" }));
}

/** The teacher's draft (if any) and published version with entries. */
export async function loadTeacherVersions(teacherId: string) {
  const admin = createAdminClient();
  const { data: versions } = await admin
    .from("timetable_versions")
    .select("id, status, source, file_path, published_at, updated_at")
    .eq("teacher_id", teacherId)
    .in("status", ["DRAFT", "PUBLISHED"]);
  const draft = versions?.find((v) => v.status === "DRAFT") ?? null;
  const published = versions?.find((v) => v.status === "PUBLISHED") ?? null;
  const ids = [draft?.id, published?.id].filter(Boolean) as string[];
  const { data: rows } = ids.length ? await admin.from("timetable_entries").select("*").in("version_id", ids) : { data: [] as any[] };
  return {
    draft,
    published,
    draftEntries: (rows ?? []).filter((r) => r.version_id === draft?.id).map(mapDraftRow),
    publishedEntries: (rows ?? []).filter((r) => r.version_id === published?.id).map(mapDraftRow),
  };
}

export async function loadSectionOptions() {
  const admin = createAdminClient();
  const { data } = await admin.from("sections").select("id, name, semester, home_room, departments(code)").order("name");
  return (data ?? [])
    .map((s: any) => ({ id: s.id, name: s.name, semester: s.semester, homeRoom: s.home_room, departmentCode: s.departments?.code ?? "" }))
    .sort((a, b) => a.departmentCode.localeCompare(b.departmentCode) || a.name.localeCompare(b.name));
}
