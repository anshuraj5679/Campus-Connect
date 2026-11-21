import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarX2, Clock, Megaphone, MessageSquareExclamationPoint, Pin, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroBanner, PersonAvatar, SectionCard } from "@/components/shared/kit";
import { StatusChip } from "@/components/shared/status-chip";
import { EmptyState } from "@/components/shared/empty-state";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { TimetableGrid, TypeLegend } from "@/components/shared/timetable-grid";
import { getViewer } from "@/lib/data/viewer";
import { getCalendar } from "@/lib/data/calendar";
import { getAvailability } from "@/lib/data/availability";
import { getSectionSchedule } from "@/lib/data/section";
import { listAnnouncements } from "@/lib/data/announcements";
import { listComplaints } from "@/lib/data/complaints";
import { formatLongDate, getNow, greetingFor } from "@/lib/datetime";
import { unavailableCellsForWeek } from "@/lib/services/availability";
import { holidayOn, isWorkingDay, istDateTime, istParts } from "@/lib/services/time";
import { slotForPeriod } from "@/lib/services/periods";
import { OPEN_STATUSES } from "@/lib/services/complaintWorkflow";
import { firstName, fmtTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

export default async function StudentHomePage() {
  const [viewer, now, calendar] = await Promise.all([getViewer(), getNow(), getCalendar()]);
  const s = viewer.student;
  if (!s) {
    return <EmptyState icon={UserSearch} title="Your academic profile is incomplete" description="Ask the college office to link your USN and section." />;
  }
  const parts = istParts(now);
  const [schedule, notices, complaints] = await Promise.all([getSectionSchedule(s.sectionId), listAnnouncements({ limit: 3 }), listComplaints(viewer, { scope: "student" })]);
  const teacherIds = [...new Set(schedule.map((e) => e.teacherId))];
  const availability = await getAvailability(teacherIds, now);

  const holiday = holidayOn(parts.date, calendar.holidays);
  const working = isWorkingDay(parts.date, calendar.settings, calendar.holidays);

  // Today's classes for my section, with overrides + teacher unavailability applied
  const today = working
    ? schedule
        .filter((e) => e.dayOfWeek === parts.isoDay)
        .map((e) => {
          const a = slotForPeriod(calendar.periods, e.startPeriod)!;
          const b = slotForPeriod(calendar.periods, e.endPeriod)!;
          const startsAt = istDateTime(parts.date, a.start);
          const endsAt = istDateTime(parts.date, b.end);
          const av = availability.get(e.teacherId);
          const cancelled = av?.overrides.some((o) => o.date === parts.date && o.kind === "CANCELLED" && o.period >= e.startPeriod && o.period <= e.endPeriod);
          // Marked "Teacher unavailable" when any active unavailability overlaps the class.
          const unavailable = av ? av.leaves.some((l) => !l.cancelledAt && l.startAt < endsAt && l.endAt > startsAt) : false;
          return { ...e, startsAt, endsAt, cancelled, unavailable };
        })
        .sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime())
    : [];

  const weekUnavailable = new Set<string>();
  for (const id of teacherIds) {
    const av = availability.get(id);
    if (!av) continue;
    const cells = unavailableCellsForWeek(now, schedule.filter((e) => e.teacherId === id), av.leaves, calendar.periods);
    cells.forEach((c) => weekUnavailable.add(c));
  }

  const openCount = complaints.filter((c) => OPEN_STATUSES.includes(c.status)).length;
  const resolvedCount = complaints.filter((c) => c.status === "RESOLVED").length;
  const closedCount = complaints.filter((c) => c.status === "CLOSED").length;
  const teacherCards = teacherIds
    .map((id) => ({ id, name: schedule.find((e) => e.teacherId === id)!.teacherName, subjects: [...new Set(schedule.filter((e) => e.teacherId === id).map((e) => e.subjectCode ?? e.subjectName))], a: availability.get(id)! }))
    .sort((x, y) => x.name.localeCompare(y.name));

  return (
    <>
      <HeroBanner
        eyebrow={formatLongDate(now)}
        title={`${greetingFor(now)}, ${firstName(viewer.fullName)}`}
        subtitle={`${s.usn} · ${s.departmentCode} Section ${s.section} · ${s.clusterName}`}
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90">
            <Link href="/teachers"><UserSearch aria-hidden /> Find a teacher</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
            <Link href="/student/complaints/new"><MessageSquareExclamationPoint aria-hidden /> Raise complaint</Link>
          </Button>
        </div>
      </HeroBanner>

      <SectionCard title="Today's classes" icon={CalendarDays} description={`Section ${s.section}`} action={<LiveRefresh />} className="mb-5">
        {!working ? (
          <EmptyState icon={CalendarX2} title={holiday ? `Holiday: ${holiday.name}` : "No classes today"} description={holiday ? "Enjoy the day off." : "Today is not a working day."} className="py-6" />
        ) : today.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No classes scheduled today" className="py-6" />
        ) : (
          <ol className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2" aria-label="Today's classes">
            {today.map((c) => {
              const live = c.startsAt <= now && now < c.endsAt;
              const done = c.endsAt <= now;
              return (
                <li key={c.id} className={cn("w-60 shrink-0 snap-start rounded-xl border-2 p-4", live ? "border-status-in-class bg-status-in-class-bg" : done ? "border-dashed bg-muted/50" : "bg-card", (c.cancelled || c.unavailable) && "border-status-leave/40 bg-status-leave-bg/60")}>
                  <p className="flex items-center justify-between text-sm font-semibold tabular-nums">
                    <span className="flex items-center gap-1"><Clock aria-hidden className="size-4" />{fmtTime(c.startsAt)}</span>
                    {live && <span className="rounded bg-status-in-class px-1.5 text-xs font-bold text-white">NOW</span>}
                    {done && !live && <span className="text-xs text-muted-foreground">Done</span>}
                  </p>
                  <p className="mt-2 line-clamp-2 font-bold leading-snug">{c.subjectName}</p>
                  <p className="text-sm text-muted-foreground">{c.subjectCode} · {c.type === "LAB" ? "Lab" : "Theory"}</p>
                  <p className="mt-2 text-sm"><Link href={`/teachers/${c.teacherId}`} className="font-medium hover:text-primary hover:underline">{c.teacherName}</Link></p>
                  <p className="text-sm font-semibold">Room {c.room ?? "TBA"}</p>
                  {c.cancelled && <p className="mt-2 rounded bg-status-leave px-2 py-0.5 text-xs font-bold text-white">Class cancelled</p>}
                  {!c.cancelled && c.unavailable && <p className="mt-2 rounded bg-status-leave px-2 py-0.5 text-xs font-bold text-white">Teacher unavailable</p>}
                </li>
              );
            })}
          </ol>
        )}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="My teachers right now" icon={UserSearch} className="lg:col-span-2" action={{ label: "Find a teacher", href: "/teachers" }}>
          {teacherCards.length === 0 ? (
            <EmptyState icon={UserSearch} title="No published timetables for your section yet" className="py-6" />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {teacherCards.map((t) => (
                <li key={t.id}>
                  <Link href={`/teachers/${t.id}`} className="flex gap-3 rounded-xl border p-3.5 transition-colors hover:border-primary/40 hover:bg-accent/30">
                    <PersonAvatar name={t.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.subjects.join(", ")}</p>
                      <StatusChip status={t.a.status.status} label={t.a.status.label} size="sm" className="mt-1.5" />
                      <p className="mt-1 line-clamp-1 text-xs text-foreground/80">{t.a.status.detail}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="Latest notices" icon={Megaphone} action={{ label: "All", href: "/notices" }}>
            {notices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notices right now.</p>
            ) : (
              <ul className="space-y-3">
                {notices.map((n) => (
                  <li key={n.id}>
                    <Link href="/notices" className="block rounded-lg p-2 -m-2 hover:bg-muted/60">
                      <p className="flex items-start gap-1.5 text-sm font-semibold">
                        {n.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        {n.pinned && <Pin aria-label="Pinned" className="mt-0.5 size-3.5 shrink-0 text-maroon" />}
                        <span className="line-clamp-2">{n.title}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{n.scopeLabel} · {relativeTime(n.createdAt, now)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="My complaints" icon={MessageSquareExclamationPoint} action={{ label: "View", href: "/student/complaints" }}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Link href="/student/complaints?status=OPEN" className="rounded-lg bg-status-in-class-bg p-3 hover:ring-2 hover:ring-status-in-class/30"><p className="text-2xl font-bold tabular-nums text-status-in-class-fg">{openCount}</p><p className="text-xs font-medium">Open</p></Link>
              <Link href="/student/complaints?status=RESOLVED" className="rounded-lg bg-status-available-bg p-3 hover:ring-2 hover:ring-status-available/30"><p className="text-2xl font-bold tabular-nums text-status-available-fg">{resolvedCount}</p><p className="text-xs font-medium">Resolved</p></Link>
              <Link href="/student/complaints?status=CLOSED" className="rounded-lg bg-muted p-3 hover:ring-2 hover:ring-border"><p className="text-2xl font-bold tabular-nums">{closedCount}</p><p className="text-xs font-medium">Closed</p></Link>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title={`Section ${s.section} weekly timetable`} icon={CalendarDays} className="mt-5" action={<TypeLegend />}>
        <TimetableGrid
          periods={calendar.periods}
          entries={schedule.map((e) => ({ ...e, extra: e.teacherName }))}
          now={{ isoDay: parts.isoDay, minutes: parts.minutes }}
          unavailable={weekUnavailable}
        />
      </SectionCard>
    </>
  );
}
