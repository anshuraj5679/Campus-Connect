import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DirectoryTeacher = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  designation: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  clusterId: string | null;
  clusterName: string | null;
  cabin: string | null;
  subjects: string[];
  employeeId: string;
  /** Section this teacher is class teacher of, e.g. "5J" */
  classTeacherOf: string | null;
};

function mapTeacher(r: any): DirectoryTeacher {
  return {
    id: r.user_id,
    fullName: r.profiles?.full_name ?? "Unknown",
    avatarUrl: r.profiles?.avatar_url ?? null,
    role: r.profiles?.role ?? "TEACHER",
    designation: r.designation,
    departmentId: r.department_id,
    departmentCode: r.departments?.code ?? "",
    departmentName: r.departments?.name ?? "",
    clusterId: r.cluster_id,
    clusterName: r.clusters?.name ?? null,
    cabin: r.cabin_location,
    subjects: r.subjects ?? [],
    employeeId: r.employee_id,
    classTeacherOf: null,
  };
}

const SELECT =
  "user_id, employee_id, designation, department_id, cluster_id, cabin_location, subjects, profiles!inner(full_name, avatar_url, role, is_active, is_verified), departments(code, name), clusters(name)";

/** teacherId → name of the section they are class teacher of. */
async function classSections(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("sections").select("name, class_teacher_id").in("class_teacher_id", ids);
  return new Map((data ?? []).map((s) => [s.class_teacher_id as string, s.name as string]));
}

/** Active, approved teachers (incl. Cluster Heads and HODs), optionally filtered. */
export async function listTeachers(filters: { departmentId?: string; clusterId?: string } = {}): Promise<DirectoryTeacher[]> {
  const supabase = await createClient();
  let q = supabase.from("teacher_profiles").select(SELECT).eq("profiles.is_active", true);
  if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
  if (filters.clusterId) q = q.eq("cluster_id", filters.clusterId);
  const { data } = await q;
  const classOf = await classSections((data ?? []).map((r: any) => r.user_id));
  // Teachers waiting for their Cluster Head's approval are not part of the cluster yet.
  return (data ?? [])
    .filter((r: any) => r.profiles?.is_verified || r.profiles?.role !== "TEACHER")
    .map((r: any) => ({ ...mapTeacher(r), classTeacherOf: classOf.get(r.user_id) ?? null })).sort((a, b) => a.departmentCode.localeCompare(b.departmentCode) || a.fullName.localeCompare(b.fullName));
}

export async function getTeacher(id: string): Promise<DirectoryTeacher | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("teacher_profiles").select(SELECT).eq("user_id", id).maybeSingle();
  if (!data) return null;
  const classOf = await classSections([id]);
  return { ...mapTeacher(data), classTeacherOf: classOf.get(id) ?? null };
}

export async function listDepartmentsAndClusters() {
  const supabase = await createClient();
  const [d, c] = await Promise.all([
    supabase.from("departments").select("id, code, name").order("code"),
    supabase.from("clusters").select("id, name, department_id").order("name"),
  ]);
  return { departments: d.data ?? [], clusters: c.data ?? [] };
}
