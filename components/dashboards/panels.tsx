import Link from "next/link";
import { CalendarCheck, CalendarOff, CalendarX2, Inbox } from "lucide-react";
import { SectionCard, PersonAvatar } from "@/components/shared/kit";
import { EmptyState } from "@/components/shared/empty-state";
import { ComplaintStatusBadge, SlaChip } from "@/components/complaints/badges";
import type { DirectoryTeacher } from "@/lib/data/teachers";
import type { ComplaintRow } from "@/lib/data/complaints";
import type { TeacherStatus } from "@/lib/services/availability";
import { OPEN_STATUSES } from "@/lib/services/complaintWorkflow";
import { fmtDateTime } from "@/lib/format";

export function OnLeavePanel({ items, reasons, className }: { items: { teacher: DirectoryTeacher; leave: { id: string; startAt: Date; endAt: Date; type: string; half: string | null }; status: TeacherStatus }[]; reasons?: Map<string, string | null>; className?: string }) {
  return (
    <SectionCard title="Teachers on leave today" icon={CalendarOff} className={className}>
      {items.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Everyone is available today" className="py-6" />
      ) : (
        <ul className="space-y-3">
          {items.map(({ teacher, leave }) => (
            <li key={leave.id} className="flex items-start gap-3">
              <PersonAvatar name={teacher.fullName} className="size-10" />
              <div className="min-w-0">
                <Link href={`/teachers/${teacher.id}`} className="font-semibold hover:text-primary hover:underline">{teacher.fullName}</Link>
                <p className="text-sm text-muted-foreground">
                  {leave.type === "HALF_DAY" ? `Half day (${leave.half})` : leave.type === "FULL_DAY" ? "Full day" : leave.type === "DATE_RANGE" ? "Multiple days" : "Some periods"} · until {fmtDateTime(leave.endAt)}
                </p>
                {reasons?.get(leave.id) && <p className="text-xs text-muted-foreground">Reason (private): {reasons.get(leave.id)}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function UnpublishedPanel({ teachers, className }: { teachers: DirectoryTeacher[]; className?: string }) {
  return (
    <SectionCard title="Timetables not yet published" icon={CalendarX2} className={className}>
      {teachers.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="All timetables are published" className="py-6" />
      ) : (
        <ul className="divide-y">
          {teachers.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <Link href={`/teachers/${t.id}`} className="font-medium hover:text-primary hover:underline">{t.fullName}</Link>
                <span className="block text-xs text-muted-foreground">{t.departmentCode}{t.clusterName ? ` · ${t.clusterName}` : ""}</span>
              </span>
              <span className="rounded-full border border-dashed border-status-unpublished px-2.5 py-0.5 text-xs font-medium text-status-unpublished-fg">Not published</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function UrgentComplaints({ rows, now, href, className }: { rows: ComplaintRow[]; now: Date; href: string; className?: string }) {
  const open = rows
    .filter((r) => OPEN_STATUSES.includes(r.status))
    .sort((a, b) => (a.slaDueAt?.getTime() ?? Infinity) - (b.slaDueAt?.getTime() ?? Infinity))
    .slice(0, 6);
  return (
    <SectionCard title="Open complaints (by SLA)" icon={Inbox} action={{ label: "All complaints", href }} className={className} bodyClassName="p-0">
      {open.length === 0 ? (
        <EmptyState icon={Inbox} title="No open complaints" className="m-5 py-6" />
      ) : (
        <ul className="divide-y">
          {open.map((r) => (
            <li key={r.id}>
              <Link href={`/complaints/${r.code}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="text-sm font-bold text-primary">{r.code}</span>
                  <span className="block truncate font-medium">{r.subject}</span>
                  <span className="block text-xs text-muted-foreground">{r.studentName} · with {r.assigneeName}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <ComplaintStatusBadge status={r.status} />
                  <SlaChip status={r.status} slaDueAt={r.slaDueAt} firstActionAt={r.firstActionAt} now={now} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
