/**
 * Complaint routing (spec §3.5). Pure function: decides who receives a new
 * complaint and at which level.
 *
 * | Category                  | Routed to                                     |
 * |---------------------------|-----------------------------------------------|
 * | TEACHER                   | Cluster Head of the teacher's cluster         |
 * |                           |   (teacher is that CH → HOD; is the HOD → Admin)|
 * | ACADEMIC                  | Cluster Head of the student's cluster         |
 * | DEPARTMENT                | HOD of the student's department               |
 * | FACILITY                  | Admin (facilities)                            |
 * | COLLEGE                   | Admin                                         |
 * | CONFIDENTIAL / toggle on  | HOD directly (accused HOD → Admin)            |
 * Missing office holders fall back one level up (CH → HOD → Admin).
 */

export type ComplaintCategory = "TEACHER" | "ACADEMIC" | "DEPARTMENT" | "FACILITY" | "COLLEGE" | "CONFIDENTIAL";
export type HandlerLevel = "CLUSTER_HEAD" | "HOD" | "ADMIN";

export const CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  TEACHER: "Against a teacher",
  ACADEMIC: "Academic / Cluster",
  DEPARTMENT: "Department",
  FACILITY: "Classroom / Lab / Infrastructure",
  COLLEGE: "College-wide",
  CONFIDENTIAL: "Confidential / Sensitive",
};

export type RoutingDirectory = {
  clusterHeadOf: (clusterId: string) => string | null;
  hodOf: (departmentId: string) => string | null;
  adminId: string | null;
};

export type RoutingInput = {
  category: ComplaintCategory;
  isConfidential: boolean;
  student: { departmentId: string; clusterId: string };
  teacher?: { id: string; departmentId: string; clusterId: string | null } | null;
};

export type RoutingResult = {
  assigneeId: string;
  level: HandlerLevel;
  departmentId: string | null;
  clusterId: string | null;
  isConfidential: boolean;
  /** Human-readable explanation, shown in the wizard and the timeline. */
  reason: string;
};

export class RoutingError extends Error {}

export function routeComplaint(input: RoutingInput, dir: RoutingDirectory): RoutingResult {
  const { category, student, teacher } = input;
  const confidential = category === "CONFIDENTIAL" || input.isConfidential;

  if (category === "TEACHER" && !teacher) {
    throw new RoutingError("Choose the teacher this complaint is about.");
  }

  const admin = (departmentId: string | null, clusterId: string | null, reason: string): RoutingResult => {
    if (!dir.adminId) throw new RoutingError("No administrator is configured to receive complaints.");
    return { assigneeId: dir.adminId, level: "ADMIN", departmentId, clusterId, isConfidential: confidential, reason };
  };

  /** HOD of a department, unless they are the accused (then Admin). */
  const hod = (departmentId: string, clusterId: string | null, reason: string): RoutingResult => {
    const hodId = dir.hodOf(departmentId);
    if (!hodId) return admin(departmentId, clusterId, "No HOD assigned, sent to the Administrator");
    if (teacher && hodId === teacher.id) return admin(departmentId, clusterId, "Complaint concerns the HOD, sent to the Administrator");
    return { assigneeId: hodId, level: "HOD", departmentId, clusterId, isConfidential: confidential, reason };
  };

  /** Cluster Head of a cluster, unless missing or the accused (then HOD). */
  const clusterHead = (clusterId: string | null, departmentId: string, reason: string): RoutingResult => {
    const chId = clusterId ? dir.clusterHeadOf(clusterId) : null;
    if (!chId) return hod(departmentId, clusterId, "No Cluster Head assigned, sent to the HOD");
    if (teacher && chId === teacher.id) return hod(departmentId, clusterId, "Complaint concerns the Cluster Head, sent to the HOD");
    return { assigneeId: chId, level: "CLUSTER_HEAD", departmentId, clusterId, isConfidential: confidential, reason };
  };

  if (confidential) {
    const dept = teacher?.departmentId ?? student.departmentId;
    const cluster = teacher?.clusterId ?? student.clusterId;
    return hod(dept, cluster, "Confidential complaints go directly to the HOD");
  }

  switch (category) {
    case "TEACHER":
      return clusterHead(teacher!.clusterId, teacher!.departmentId, "Cluster Head of the teacher's cluster");
    case "ACADEMIC":
      return clusterHead(student.clusterId, student.departmentId, "Cluster Head of your cluster");
    case "DEPARTMENT":
      return hod(student.departmentId, student.clusterId, "HOD of your department");
    case "FACILITY":
      return admin(student.departmentId, student.clusterId, "Facilities are handled by the Administrator");
    case "COLLEGE":
      return admin(null, null, "College-wide matters are handled by the Administrator");
    default:
      throw new RoutingError("Unknown category.");
  }
}

/**
 * Who receives an escalation: Cluster Head → HOD of the complaint's
 * department (Admin if the HOD is the accused or missing); HOD → Admin.
 */
export function escalationTarget(
  level: HandlerLevel,
  complaint: { departmentId: string | null; teacherId: string | null },
  dir: RoutingDirectory,
): { assigneeId: string; level: HandlerLevel } | null {
  if (level === "CLUSTER_HEAD" && complaint.departmentId) {
    const hodId = dir.hodOf(complaint.departmentId);
    if (hodId && hodId !== complaint.teacherId) return { assigneeId: hodId, level: "HOD" };
  }
  if (level === "CLUSTER_HEAD" || level === "HOD") {
    return dir.adminId ? { assigneeId: dir.adminId, level: "ADMIN" } : null;
  }
  return null;
}
