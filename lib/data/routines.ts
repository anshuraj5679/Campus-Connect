import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DraftEntry } from "@/lib/services/timetableValidation";
import type { TimetableEntry } from "@/lib/services/availability";

/** A class from a section routine. The teacher account is optional (the name is as written on the routine). */
export type RoutineEntry = TimetableEntry & { teacherId: string | null; teacherName: string };

function mapRoutineRow(r: any, section: { id: string; name: string; semester: number }): DraftEntry {
  return {
    id: r.id,
    dayOfWeek: r.day_of_week,
    startPeriod: r.start_period,
    endPeriod: r.end_period,
    subjectCode: r.subject_code,
    subjectName: r.subject_name,
    sectionId: section.id,
    section: section.name,
    semester: section.semester,
    room: r.room,
    type: r.type,
    lowConfidence: r.low_confidence ?? false,
    teacherId: r.teacher_id,
    teacherName: r.teacher_name ?? r.profiles?.full_name ?? null,
  };
}

/** A section with its draft / published routine (for the Cluster Head editor). */
export async function loadRoutine(sectionId: string) {
  const admin = createAdminClient();
  const { data: section } = await admin
    .from("sections")
    .select("id, name, semester, home_room, cluster_id, department_id, departments(code), clusters(name)")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return null;
  const { data: versions } = await admin
    .from("section_timetables")
    .select("id, status, file_path, published_at, updated_at")
    .eq("section_id", sectionId)
    .in("status", ["DRAFT", "PUBLISHED"]);
  const draft = versions?.find((v) => v.status === "DRAFT") ?? null;
  const published = versions?.find((v) => v.status === "PUBLISHED") ?? null;
  const ids = [draft?.id, published?.id].filter(Boolean) as string[];
  const { data: rows } = ids.length
    ? await admin.from("section_timetable_entries").select("*, profiles(full_name)").in("timetable_id", ids)
    : { data: [] as any[] };
  const sec = { id: section.id, name: section.name, semester: section.semester };
  return {
    section: {
      ...sec,
      homeRoom: section.home_room as string | null,
      clusterId: section.cluster_id as string,
      departmentId: section.department_id as string,
      departmentCode: (section as any).departments?.code ?? "",
      clusterName: (section as any).clusters?.name ?? "",
    },
    draft,
    published,
    draftEntries: (rows ?? []).filter((r) => r.timetable_id === draft?.id).map((r) => mapRoutineRow(r, sec)),
    publishedEntries: (rows ?? []).filter((r) => r.timetable_id === published?.id).map((r) => mapRoutineRow(r, sec)),
  };
}

export type RoutineStatus = "PUBLISHED" | "DRAFT" | "NONE";

/** Sections of the given clusters with their routine status. */
export async function listClusterSections(clusterIds: string[]) {
  if (!clusterIds.length) return [];
  const admin = createAdminClient();
  const { data: sections } = await admin
    .from("sections")
    .select("id, name, semester, cluster_id, departments(code), clusters(name)")
    .in("cluster_id", clusterIds)
    .order("name");
  const ids = (sections ?? []).map((s) => s.id);
  const [{ data: routines }, { data: students }] = ids.length
    ? await Promise.all([
        admin.from("section_timetables").select("id, section_id, status, published_at, updated_at, section_timetable_entries(count)").in("section_id", ids).in("status", ["DRAFT", "PUBLISHED"]),
        admin.from("student_profiles").select("section_id").in("section_id", ids),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  return (sections ?? []).map((s: any) => {
    const mine = (routines ?? []).filter((r) => r.section_id === s.id);
    const pub = mine.find((r) => r.status === "PUBLISHED");
    const draft = mine.find((r) => r.status === "DRAFT");
    return {
      id: s.id as string,
      name: s.name as string,
      semester: s.semester as number,
      departmentCode: s.departments?.code ?? "",
      clusterName: s.clusters?.name ?? "",
      students: (students ?? []).filter((x) => x.section_id === s.id).length,
      status: (pub ? "PUBLISHED" : draft ? "DRAFT" : "NONE") as RoutineStatus,
      hasDraft: !!draft,
      classes: (pub as any)?.section_timetable_entries?.[0]?.count ?? 0,
      publishedAt: pub?.published_at ? new Date(pub.published_at) : null,
      updatedAt: draft?.updated_at ? new Date(draft.updated_at) : null,
    };
  });
}

/** Teachers who may appear on a routine: everyone in the section's department (cluster first). */
export async function loadRoutineTeachers(departmentId: string, clusterId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("teacher_profiles")
    .select("user_id, cluster_id, profiles!inner(full_name, is_active)")
    .eq("department_id", departmentId)
    .eq("profiles.is_active", true);
  return (data ?? [])
    .map((t: any) => ({ id: t.user_id as string, name: t.profiles.full_name as string, inCluster: t.cluster_id === clusterId }))
    .sort((a, b) => Number(b.inCluster) - Number(a.inCluster) || a.name.localeCompare(b.name));
}

/**
 * The published routine students see on their dashboard, plus a short-lived
 * link to the original PDF/photo. Null when the Cluster Head hasn't published one.
 */
export async function getPublishedRoutine(sectionId: string) {
  const admin = createAdminClient();
  const { data: tt } = await admin
    .from("section_timetables")
    .select("id, file_path, published_at")
    .eq("section_id", sectionId)
    .eq("status", "PUBLISHED")
    .maybeSingle();
  if (!tt) return null;
  const { data: rows } = await admin.from("section_timetable_entries").select("*, profiles(full_name)").eq("timetable_id", tt.id);
  const entries: RoutineEntry[] = (rows ?? []).map((r: any) => ({
    id: r.id,
    dayOfWeek: r.day_of_week,
    startPeriod: r.start_period,
    endPeriod: r.end_period,
    subjectCode: r.subject_code,
    subjectName: r.subject_name,
    sectionId,
    section: null,
    semester: null,
    room: r.room,
    type: r.type,
    teacherId: r.teacher_id,
    teacherName: r.teacher_name || r.profiles?.full_name || "",
  }));
  let fileUrl: string | null = null;
  if (tt.file_path) {
    const { data } = await admin.storage.from("timetables").createSignedUrl(tt.file_path, 60 * 60);
    fileUrl = data?.signedUrl ?? null;
  }
  return { entries, fileUrl, publishedAt: tt.published_at ? new Date(tt.published_at) : null };
}
