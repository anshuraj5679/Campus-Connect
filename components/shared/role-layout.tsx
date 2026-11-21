import { requireRole, requireUser } from "@/lib/auth/session";
import { ROLES, rolesForPath } from "@/lib/auth/roles";
import { AppShell } from "./app-shell";

/**
 * Server-side gate for a route group. Uses the same ROUTE_ACCESS table as the
 * middleware, then checks the role against the `profiles` table (source of truth).
 */
export async function RoleLayout({
  sectionPrefix,
  children,
}: {
  /** e.g. "/student". Omit for pages every signed-in user may open. */
  sectionPrefix?: string;
  children: React.ReactNode;
}) {
  const allowed = sectionPrefix ? (rolesForPath(sectionPrefix) ?? ROLES) : ROLES;
  const user = sectionPrefix ? await requireRole(allowed) : await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
