/**
 * Who can see a complaint, and whose identity is masked.
 * Mirrors the SQL function public.can_view_complaint() used by RLS, so the
 * rule is enforced in the database AND explained/tested in TypeScript.
 */

export type AccessViewer = {
  id: string;
  role: "STUDENT" | "TEACHER" | "CLUSTER_HEAD" | "HOD" | "ADMIN";
  /** Clusters this user heads */
  clusterHeadOf: string[];
  /** Departments this user is HOD of */
  hodOf: string[];
};

export type AccessComplaint = {
  studentId: string;
  teacherId: string | null;
  departmentId: string | null;
  clusterId: string | null;
  isConfidential: boolean;
  currentAssigneeId: string | null;
  responseRequestedFrom: string | null;
};

export function canViewComplaint(v: AccessViewer, c: AccessComplaint): boolean {
  if (c.studentId === v.id) return true;
  if (v.role === "ADMIN") return true;
  if (c.currentAssigneeId === v.id) return true;
  if (c.teacherId !== v.id) {
    if (c.departmentId && v.hodOf.includes(c.departmentId)) return true;
    if (!c.isConfidential && c.clusterId && v.clusterHeadOf.includes(c.clusterId)) return true;
  }
  if (!c.isConfidential && c.responseRequestedFrom === v.id) return true;
  return false;
}

/** True when the viewer may act as a handler (not the student, not the requested teacher). */
export function isHandler(v: AccessViewer, c: AccessComplaint): boolean {
  if (c.studentId === v.id) return false;
  if (c.responseRequestedFrom === v.id && c.currentAssigneeId !== v.id) return false;
  return v.role === "CLUSTER_HEAD" || v.role === "HOD" || v.role === "ADMIN";
}

/**
 * Should the student's name / USN / section be hidden from this viewer?
 *  - Confidential: hidden from everyone except the student, the HOD of the
 *    department and the Admin.
 *  - A teacher asked to respond never sees who complained (protects the student).
 */
export function shouldMaskStudent(v: AccessViewer, c: AccessComplaint): boolean {
  if (c.studentId === v.id) return false;
  if (c.responseRequestedFrom === v.id && c.currentAssigneeId !== v.id) return true;
  if (!c.isConfidential) return false;
  if (v.role === "ADMIN") return false;
  return !(c.departmentId && v.hodOf.includes(c.departmentId));
}

export const MASKED_STUDENT = { name: "Confidential Student", usn: "Hidden", section: "Hidden" } as const;
