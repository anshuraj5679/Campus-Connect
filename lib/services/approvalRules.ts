/**
 * Who may approve or reject an account (pure, unit-tested):
 *   Student      → class teacher of their section (Cluster Head while the section has none)
 *   Teacher      → Cluster Head of their cluster
 *   Cluster Head → HOD of the department
 * The HOD (own department) and the admin may always decide; nobody approves themselves.
 */
export type ApprovalTarget = {
  id: string;
  name: string;
  role: string;
  isVerified: boolean;
  isActive: boolean;
  departmentId: string | null;
  clusterId: string | null;
  sectionId: string | null;
  sectionName: string | null;
  classTeacherId: string | null;
  clusterHeadId: string | null;
  hodId: string | null;
};

export type Approver = { id: string; role: string };

/** Returns null when `me` may decide on `t`, otherwise the reason why not. */
export function canDecide(me: Approver, t: ApprovalTarget): string | null {
  if (t.id === me.id) return "You can't approve your own account.";
  if (me.role === "ADMIN") return null;
  if (t.hodId && t.hodId === me.id) return null;
  if (t.role === "STUDENT") {
    if (t.classTeacherId) return t.classTeacherId === me.id ? null : "Only this section's class teacher can approve this student.";
    return t.clusterHeadId === me.id ? null : "Only the class teacher (or the Cluster Head, while the section has no class teacher) can approve this student.";
  }
  if (t.role === "TEACHER") return t.clusterHeadId === me.id ? null : "Only the Cluster Head of this teacher's cluster can approve them.";
  return "Only the HOD or the admin can approve this account.";
}
