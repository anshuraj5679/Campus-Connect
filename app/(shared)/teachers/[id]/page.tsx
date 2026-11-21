import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, CalendarOff, Clock, MapPin, MessageCircle, Radio } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { PersonAvatar, SectionCard } from "@/components/shared/kit";
import { TimetableGrid, TypeLegend } from "@/components/shared/timetable-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { getTeacher } from "@/lib/data/teachers";
import { getAvailability } from "@/lib/data/availability";
import { getCalendar } from "@/lib/data/calendar";
import { getViewer } from "@/lib/data/viewer";
import { getNow } from "@/lib/datetime";
import { istParts } from "@/lib/services/time";
import { unavailableCellsForWeek } from "@/lib/services/availability";
import { fmtDate, fmtDateTime, fmtTime, relativeTime } from "@/lib/format";
import { ROLE_LABEL, isRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Teacher profile" };

export default async function TeacherProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [teacher, viewer, now, calendar] = await Promise.all([getTeacher(id), getViewer(), getNow(), getCalendar()]);
  if (!teacher) notFound();

  const a = (await getAvailability([id], now)).get(id)!;
  const { status, next } = a;
  const parts = istParts(now);
  const upcomingLeave = a.leaves.filter((l) => l.endAt > now).sort((x, y) => x.startAt.getTime() - y.startAt.getTime());
  const unavailable = a.entries ? unavailableCellsForWeek(now, a.entries, a.leaves, calendar.periods) : new Set<string>();
  const homeCrumb = viewer.role === "STUDENT" ? { label: "Home", href: "/student" } : { label: "Find a Teacher", href: "/teachers" };

  return (
    <>
      <PageHeader
        title={teacher.fullName}
        breadcrumbs={[homeCrumb, { label: "Find a Teacher", href: "/teachers" }, { label: teacher.fullName }].filter((c, i, arr) => arr.findIndex((x) => x.label === c.label) === i)}
        actions={<LiveRefresh />}
      />

      {upcomingLeave.length > 0 && (
        <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-status-leave/30 bg-status-leave-bg px-5 py-4 text-status-leave-fg">
          <CalendarOff aria-hidden className="mt-0.5 size-5 shrink-0 text-status-leave" />
          <div className="text-sm">
            <p className="font-semibold">Upcoming unavailability</p>
            <ul className="mt-1 space-y-0.5">
              {upcomingLeave.slice(0, 3).map((l) => (
                <li key={l.id}>
                  {l.startAt <= now ? "Now" : fmtDateTime(l.startAt)} – {fmtDateTime(l.endAt)}
                  {l.type === "HALF_DAY" && ` (${l.half === "FN" ? "Forenoon" : "Afternoon"})`}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-6 shadow-card lg:col-span-2">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <PersonAvatar name={teacher.fullName} src={teacher.avatarUrl} className="size-20 text-xl" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-lg font-semibold">{teacher.designation}</p>
              <p className="text-muted-foreground">
                {teacher.departmentName}
                {teacher.clusterName ? ` · ${teacher.clusterName}` : ""}
              </p>
              {(teacher.role === "HOD" || teacher.role === "CLUSTER_HEAD") && isRole(teacher.role) && (
                <p className="inline-block rounded bg-maroon/10 px-2 py-0.5 text-sm font-semibold text-maroon">{ROLE_LABEL[teacher.role]}</p>
              )}
              {teacher.cabin && (
                <p className="flex items-center gap-1.5 pt-1 text-sm">
                  <MapPin aria-hidden className="size-4 text-muted-foreground" /> {teacher.cabin}
                </p>
              )}
              {teacher.subjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {teacher.subjects.map((s) => (
                    <span key={s} className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs font-medium">{s}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-6 rounded-xl border bg-muted/30 p-5">
            <p className="mb-2 text-sm font-medium text-muted-foreground">Status right now</p>
            <StatusChip status={status.status} label={status.label} size="lg" className="h-11 px-5 text-base" />
            <p className="mt-2.5 text-base font-medium">{status.detail}</p>
            {a.meetingNote && status.status !== "ON_LEAVE" && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <MessageCircle aria-hidden className="size-4" /> {a.meetingNote}
              </p>
            )}
          </div>
        </section>

        <SectionCard title="Right now / Next" icon={Radio}>
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Right now</p>
              {status.current ? (
                <div className="mt-1.5">
                  <p className="font-semibold">{status.current.subjectName}</p>
                  <p className="text-sm text-muted-foreground">
                    {[status.current.section, status.current.room].filter(Boolean).join(" · ")} · until {fmtTime(status.current.endsAt)}
                  </p>
                </div>
              ) : (
                <p className="mt-1.5 text-sm">{status.label}</p>
              )}
            </div>
            <div className="border-t pt-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next class</p>
              {next ? (
                <div className="mt-1.5">
                  <p className="font-semibold">{next.subjectName}</p>
                  <p className="text-sm text-muted-foreground">{[next.section, next.room].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-primary">
                    <CalendarClock aria-hidden className="size-4" />
                    {istParts(next.startsAt).date === parts.date ? `Today ${fmtTime(next.startsAt)}` : `${fmtDate(next.startsAt)}, ${fmtTime(next.startsAt)}`} · {relativeTime(next.startsAt, now)}
                  </p>
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">No upcoming classes in the next two weeks.</p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Weekly timetable" icon={Clock} className="mt-5" action={<TypeLegend />}>
        {a.entries ? (
          <TimetableGrid periods={calendar.periods} entries={a.entries} now={{ isoDay: parts.isoDay, minutes: parts.minutes }} unavailable={unavailable} />
        ) : (
          <EmptyState icon={CalendarClock} title="Timetable not published yet" description="This teacher has not published a timetable for this semester." />
        )}
      </SectionCard>
    </>
  );
}
