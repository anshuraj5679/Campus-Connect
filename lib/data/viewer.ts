import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser, type CurrentUser } from "@/lib/auth/session";

export type Viewer = CurrentUser & {
  student: {
    usn: string;
    sectionId: string;
    section: string;
    semester: number;
    departmentId: string;
    clusterId: string;
    departmentCode: string;
    clusterName: string;
  } | null;
  teacher: {
    employeeId: string;
    designation: string;
    departmentId: string;
    clusterId: string | null;
    cabin: string | null;
    departmentCode: string;
    clusterName: string | null;
  } | null;
  /** Clusters this user heads / departments this user is HOD of. */
  clusterHeadOf: string[];
  hodOf: string[];
};

/** The signed-in user with academic context, loaded once per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const user = await requireUser();
  const supabase = await createClient();

  const [studentRes, teacherRes, clustersRes, deptsRes] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("usn, section_id, section, semester, department_id, cluster_id, departments(code), clusters(name)")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("teacher_profiles")
      .select("employee_id, designation, department_id, cluster_id, cabin_location, departments(code), clusters(name)")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("clusters").select("id").eq("cluster_head_id", user.id),
    supabase.from("departments").select("id").eq("hod_id", user.id),
  ]);

  const s = studentRes.data as any;
  const t = teacherRes.data as any;

  return {
    ...user,
    student: s
      ? {
          usn: s.usn,
          sectionId: s.section_id,
          section: s.section,
          semester: s.semester,
          departmentId: s.department_id,
          clusterId: s.cluster_id,
          departmentCode: s.departments?.code ?? "",
          clusterName: s.clusters?.name ?? "",
        }
      : null,
    teacher: t
      ? {
          employeeId: t.employee_id,
          designation: t.designation,
          departmentId: t.department_id,
          clusterId: t.cluster_id,
          cabin: t.cabin_location,
          departmentCode: t.departments?.code ?? "",
          clusterName: t.clusters?.name ?? null,
        }
      : null,
    clusterHeadOf: (clustersRes.data ?? []).map((c) => c.id),
    hodOf: (deptsRes.data ?? []).map((d) => d.id),
  };
});
