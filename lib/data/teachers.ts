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
  };
}

const SELECT =
  "user_id, employee_id, designation, department_id, cluster_id, cabin_location, subjects, profiles!inner(full_name, avatar_url, role, is_active), departments(code, name), clusters(name)";

/** Active teachers (incl. Cluster Heads and HODs), optionally filtered. */
export async function listTeachers(filters: { departmentId?: string; clusterId?: string } = {}): Promise<DirectoryTeacher[]> {
  const supabase = await createClient();
  let q = supabase.from("teacher_profiles").select(SELECT).eq("profiles.is_active", true);
  if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
  if (filters.clusterId) q = q.eq("cluster_id", filters.clusterId);
  const { data } = await q;
  return (data ?? []).map(mapTeacher).sort((a, b) => a.departmentCode.localeCompare(b.departmentCode) || a.fullName.localeCompare(b.fullName));
}

export async function getTeacher(id: string): Promise<DirectoryTeacher | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("teacher_profiles").select(SELECT).eq("user_id", id).maybeSingle();
  return data ? mapTeacher(data) : null;
}

export async function listDepartmentsAndClusters() {
  const supabase = await createClient();
  const [d, c] = await Promise.all([
    supabase.from("departments").select("id, code, name").order("code"),
    supabase.from("clusters").select("id, name, department_id").order("name"),
  ]);
  return { departments: d.data ?? [], clusters: c.data ?? [] };
}
