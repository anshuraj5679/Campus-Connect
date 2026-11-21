/**
 * Role model and route-access rules.
 *
 * This module is pure (no Next.js / Supabase imports) so the same rules are
 * used by the middleware, by server layouts and by unit tests.
 */

export const ROLES = ["STUDENT", "TEACHER", "CLUSTER_HEAD", "HOD", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  CLUSTER_HEAD: "Cluster Head",
  HOD: "Head of Department",
  ADMIN: "Administrator",
};

/** Where each role lands after login. */
export const ROLE_HOME: Record<Role, string> = {
  STUDENT: "/student",
  TEACHER: "/teacher",
  CLUSTER_HEAD: "/cluster-head",
  HOD: "/hod",
  ADMIN: "/admin",
};

/**
 * Route prefix → roles allowed to open it.
 * Cluster Heads and HODs are also faculty, so they can use the teacher area
 * (their own timetable, unavailability, meeting toggle).
 */
export const ROUTE_ACCESS: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/student", roles: ["STUDENT"] },
  { prefix: "/teacher", roles: ["TEACHER", "CLUSTER_HEAD", "HOD"] },
  { prefix: "/cluster-head", roles: ["CLUSTER_HEAD"] },
  { prefix: "/hod", roles: ["HOD"] },
  { prefix: "/admin", roles: ["ADMIN"] },
  // Shared pages available to every signed-in user
  { prefix: "/notifications", roles: ROLES },
  { prefix: "/notices", roles: ROLES },
  { prefix: "/teachers", roles: ROLES },
  // Record-level access to a complaint is checked on the page (RLS + 403).
  { prefix: "/complaints", roles: ROLES },
  { prefix: "/account", roles: ROLES },
];

/** Pages that do not require a session. */
export const PUBLIC_PATHS = ["/login", "/signup", "/forbidden"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => matchesPrefix(pathname, p));
}

/** Roles allowed for a path, or `null` when the path is not role-restricted. */
export function rolesForPath(pathname: string): readonly Role[] | null {
  const rule = ROUTE_ACCESS.find((r) => matchesPrefix(pathname, r.prefix));
  return rule ? rule.roles : null;
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const allowed = rolesForPath(pathname);
  return allowed === null || allowed.includes(role);
}

export function homeForRole(role: Role): string {
  return ROLE_HOME[role];
}
