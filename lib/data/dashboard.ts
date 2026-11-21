import "server-only";
import { OPEN_STATUSES, slaState } from "@/lib/services/complaintWorkflow";
import { istParts } from "@/lib/services/time";
import type { ComplaintRow } from "./complaints";
import type { TeacherAvailability } from "./availability";
import type { DirectoryTeacher } from "./teachers";

/** KPI cards: open, overdue SLA, resolved this month, average resolution days. */
export function complaintKpis(rows: ComplaintRow[], now: Date) {
  const month = istParts(now).date.slice(0, 7);
  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const overdue = open.filter((r) => slaState(r, now).kind === "overdue");
  const resolved = rows.filter((r) => r.resolvedAt);
  const resolvedThisMonth = resolved.filter((r) => istParts(r.resolvedAt!).date.slice(0, 7) === month);
  const avgDays = resolved.length
    ? resolved.reduce((n, r) => n + (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 86_400_000, 0) / resolved.length
    : null;
  return {
    open: open.length,
    overdue: overdue.length,
    resolvedThisMonth: resolvedThisMonth.length,
    avgResolutionDays: avgDays === null ? "—" : avgDays.toFixed(1),
  };
}

export function teachersOnLeaveToday(teachers: DirectoryTeacher[], availability: Map<string, TeacherAvailability>, now: Date) {
  const today = istParts(now).date;
  return teachers
    .map((t) => {
      const a = availability.get(t.id);
      const leave = a?.leaves.find((l) => !l.cancelledAt && istParts(l.startAt).date <= today && istParts(new Date(l.endAt.getTime() - 1)).date >= today);
      return leave ? { teacher: t, leave, status: a!.status } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function timetablesNotPublished(teachers: DirectoryTeacher[], availability: Map<string, TeacherAvailability>) {
  return teachers.filter((t) => availability.get(t.id)?.entries === null);
}
