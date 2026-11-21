/**
 * Announcement targeting. Mirrors SQL public.is_announcement_target() (RLS),
 * and is also used to decide who gets a notification when one is published.
 */

export type AnnouncementScope = "COLLEGE" | "DEPARTMENT" | "CLUSTER";
export type AnnouncementAudience = "STUDENTS" | "TEACHERS" | "BOTH";

export type TargetAnnouncement = {
  scope: AnnouncementScope;
  departmentId: string | null;
  clusterId: string | null;
  audience: AnnouncementAudience;
  semesters: number[];
  sections: string[];
  expiresAt: Date | null;
};

export type TargetViewer = {
  role: "STUDENT" | "TEACHER" | "CLUSTER_HEAD" | "HOD" | "ADMIN";
  departmentId: string | null;
  clusterId: string | null;
  semester: number | null;
  section: string | null;
};

export function isAnnouncementTarget(a: TargetAnnouncement, v: TargetViewer, now: Date): boolean {
  if (a.expiresAt && a.expiresAt <= now) return false;
  if (v.role === "ADMIN") return true;

  const isStudent = v.role === "STUDENT";
  if (a.audience === "STUDENTS" && !isStudent) return false;
  if (a.audience === "TEACHERS" && isStudent) return false;

  if (a.scope === "DEPARTMENT" && a.departmentId !== v.departmentId) return false;
  if (a.scope === "CLUSTER" && a.clusterId !== v.clusterId) return false;

  if (isStudent) {
    if (a.semesters.length && (v.semester === null || !a.semesters.includes(v.semester))) return false;
    if (a.sections.length && (v.section === null || !a.sections.includes(v.section))) return false;
  }
  return true;
}

/** Which scopes a role may publish to. */
export function allowedScopes(role: TargetViewer["role"]): AnnouncementScope[] {
  if (role === "ADMIN") return ["COLLEGE"];
  if (role === "HOD") return ["DEPARTMENT"];
  if (role === "CLUSTER_HEAD") return ["CLUSTER"];
  return [];
}
