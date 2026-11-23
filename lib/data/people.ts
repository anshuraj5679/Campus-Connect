import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Students and teachers of a cluster / section, with approval state.
 * Loaded with the service role; every page that calls these checks first that
 * the viewer is the cluster's Cluster Head or the section's class teacher.
 */

export type PersonStatus = "APPROVED" | "PENDING" | "REJECTED";

export type StudentRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  usn: string;
  sectionId: string;
  section: string;
  batchYear: number;
  status: PersonStatus;
  joinedAt: Date;
  verifiedBy: string | null;
};

export type TeacherRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  employeeId: string;
  designation: string;
  cabin: string | null;
  status: PersonStatus;
  joinedAt: Date;
  classTeacherOf: string | null;
};

export type SectionRow = { id: string; name: string; semester: number; classTeacherId: string | null; classTeacherName: string | null; students: number; pending: number };

const statusOf = (p: { is_verified: boolean; is_active: boolean; rejected_at: string | null }): PersonStatus =>
  p.is_verified ? "APPROVED" : !p.is_active && p.rejected_at ? "REJECTED" : "PENDING";

const PROFILE = "full_name, email, phone, is_verified, is_active, rejected_at, created_at, verifier:profiles!verified_by(full_name)";

function mapStudent(r: any): StudentRow {
  const p = r.profiles;
  return {
    id: r.user_id,
    fullName: p.full_name,
    email: p.email,
    phone: p.phone,
    usn: r.usn,
    sectionId: r.section_id,
    section: r.section,
    batchYear: r.batch_year,
    status: statusOf(p),
    joinedAt: new Date(p.created_at),
    verifiedBy: p.verifier?.full_name ?? null,
  };
}

const order = (s: PersonStatus) => (s === "PENDING" ? 0 : s === "APPROVED" ? 1 : 2);
const byStatusThen = <T extends { status: PersonStatus }>(key: (x: T) => string) => (a: T, b: T) => order(a.status) - order(b.status) || key(a).localeCompare(key(b));

async function studentsWhere(column: "cluster_id" | "section_id", value: string) {
  const { data } = await createAdminClient()
    .from("student_profiles")
    .select(`user_id, usn, section_id, section, batch_year, profiles!student_profiles_user_id_fkey!inner(${PROFILE})`)
    .eq(column, value);
  return (data ?? []).map(mapStudent);
}

/** Everything a Cluster Head sees: sections (with class teachers), teachers, students. */
export async function loadClusterPeople(clusterId: string) {
  const admin = createAdminClient();
  const [{ data: sections }, { data: teachers }, students] = await Promise.all([
    admin.from("sections").select("id, name, semester, class_teacher_id, teacher:profiles!sections_class_teacher_id_fkey(full_name)").eq("cluster_id", clusterId).order("name"),
    admin
      .from("teacher_profiles")
      .select(`user_id, employee_id, designation, cabin_location, profiles!teacher_profiles_user_id_fkey!inner(role, ${PROFILE})`)
      .eq("cluster_id", clusterId),
    studentsWhere("cluster_id", clusterId),
  ]);
  const classOf = new Map((sections ?? []).filter((s) => s.class_teacher_id).map((s) => [s.class_teacher_id as string, s.name as string]));
  const teacherRows: TeacherRow[] = (teachers ?? []).map((t: any) => ({
    id: t.user_id,
    fullName: t.profiles.full_name,
    email: t.profiles.email,
    phone: t.profiles.phone,
    role: t.profiles.role,
    employeeId: t.employee_id,
    designation: t.designation,
    cabin: t.cabin_location,
    status: statusOf(t.profiles),
    joinedAt: new Date(t.profiles.created_at),
    classTeacherOf: classOf.get(t.user_id) ?? null,
  }));
  const sectionRows: SectionRow[] = (sections ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    semester: s.semester,
    classTeacherId: s.class_teacher_id,
    classTeacherName: s.teacher?.full_name ?? null,
    students: students.filter((x) => x.sectionId === s.id && x.status !== "REJECTED").length,
    pending: students.filter((x) => x.sectionId === s.id && x.status === "PENDING").length,
  }));
  return {
    sections: sectionRows,
    teachers: teacherRows.sort(byStatusThen((t) => t.fullName)),
    students: students.sort(byStatusThen((s) => s.section + s.usn)),
  };
}

/** What a class teacher sees: the students of their own section. */
export async function loadSectionStudents(sectionId: string) {
  return (await studentsWhere("section_id", sectionId)).sort(byStatusThen((s) => s.usn));
}

/** Pending approvals waiting for this user (shown as a reminder on their dashboard). */
export async function pendingApprovalsFor(viewer: { id: string; clusterHeadOf: string[]; classTeacherOf: { sectionId: string } | null }) {
  const admin = createAdminClient();
  let students = 0;
  let teachers = 0;
  if (viewer.classTeacherOf) {
    const { count } = await admin
      .from("student_profiles")
      .select("user_id, profiles!student_profiles_user_id_fkey!inner(is_verified, is_active)", { count: "exact", head: true })
      .eq("section_id", viewer.classTeacherOf.sectionId)
      .eq("profiles.is_verified", false)
      .eq("profiles.is_active", true);
    students += count ?? 0;
  }
  for (const clusterId of viewer.clusterHeadOf) {
    const { data: noTeacher } = await admin.from("sections").select("id").eq("cluster_id", clusterId).is("class_teacher_id", null);
    const ids = (noTeacher ?? []).map((s) => s.id);
    if (ids.length) {
      const { count } = await admin
        .from("student_profiles")
        .select("user_id, profiles!student_profiles_user_id_fkey!inner(is_verified, is_active)", { count: "exact", head: true })
        .in("section_id", ids)
        .eq("profiles.is_verified", false)
        .eq("profiles.is_active", true);
      students += count ?? 0;
    }
    const { count: t } = await admin
      .from("teacher_profiles")
      .select("user_id, profiles!teacher_profiles_user_id_fkey!inner(is_verified, is_active, role)", { count: "exact", head: true })
      .eq("cluster_id", clusterId)
      .eq("profiles.role", "TEACHER")
      .eq("profiles.is_verified", false)
      .eq("profiles.is_active", true);
    teachers += t ?? 0;
  }
  return { students, teachers };
}

/** Who approves this student: their section's class teacher, otherwise the Cluster Head. */
export async function studentApprover(sectionId: string): Promise<{ id: string; name: string; role: "CLASS_TEACHER" | "CLUSTER_HEAD" } | null> {
  const { data } = await createAdminClient()
    .from("sections")
    .select("class_teacher_id, teacher:profiles!sections_class_teacher_id_fkey(full_name), clusters(cluster_head_id, head:profiles!clusters_cluster_head_id_fkey(full_name))")
    .eq("id", sectionId)
    .maybeSingle();
  if (!data) return null;
  const d = data as any;
  if (d.class_teacher_id) return { id: d.class_teacher_id, name: d.teacher?.full_name ?? "your class teacher", role: "CLASS_TEACHER" };
  if (d.clusters?.cluster_head_id) return { id: d.clusters.cluster_head_id, name: d.clusters.head?.full_name ?? "your Cluster Head", role: "CLUSTER_HEAD" };
  return null;
}

/** "your class teacher, Dr. Savitha S" style description of who approves this account. */
export async function approverLabel(viewer: { id: string; role: string; student: { sectionId: string } | null; teacher: { clusterId: string | null; departmentId: string } | null }): Promise<string> {
  const admin = createAdminClient();
  if (viewer.role === "STUDENT" && viewer.student) {
    const a = await studentApprover(viewer.student.sectionId);
    return a ? `${a.role === "CLASS_TEACHER" ? "your class teacher" : "your Cluster Head (your section has no class teacher yet)"}, ${a.name}` : "your Cluster Head";
  }
  if (viewer.role === "TEACHER" && viewer.teacher?.clusterId) {
    const { data } = await admin.from("clusters").select("head:profiles!clusters_cluster_head_id_fkey(full_name)").eq("id", viewer.teacher.clusterId).maybeSingle();
    const name = (data as any)?.head?.full_name;
    return name ? `your Cluster Head, ${name}` : "your Cluster Head";
  }
  if (viewer.role === "CLUSTER_HEAD" && viewer.teacher) {
    const { data } = await admin.from("departments").select("head:profiles!departments_hod_id_fkey(full_name)").eq("id", viewer.teacher.departmentId).maybeSingle();
    const name = (data as any)?.head?.full_name;
    return name ? `your HOD, ${name}` : "the HOD or the college admin";
  }
  return "the college admin";
}

/** The class teacher of a section, if one is assigned. */
export async function classTeacherOfSection(sectionId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await createAdminClient().from("sections").select("class_teacher_id, teacher:profiles!sections_class_teacher_id_fkey(full_name)").eq("id", sectionId).maybeSingle();
  const d = data as any;
  return d?.class_teacher_id ? { id: d.class_teacher_id, name: d.teacher?.full_name ?? "Class teacher" } : null;
}
