import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CalendarDays, CalendarOff, ListChecks, MessagesSquare, Upload, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroBanner, SectionCard } from "@/components/shared/kit";
import { StatusChip } from "@/components/shared/status-chip";
import { EmptyState } from "@/components/shared/empty-state";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { Countdown } from "@/components/shared/countdown";
import { MeetingToggle } from "@/components/teacher/meeting-toggle";
import { TYPE_STYLE } from "@/components/shared/timetable-grid";
import { getViewer } from "@/lib/data/viewer";
import { ApprovalsReminder, PendingSelfBanner } from "@/components/people/approval-banners";
import { approverLabel, pendingApprovalsFor } from "@/lib/data/people";
import { getAvailability } from "@/lib/data/availability";
import { getCalendar } from "@/lib/data/calendar";
import { createClient } from "@/lib/supabase/server";
import { formatLongDate, getNow, greetingFor } from "@/lib/datetime";
import { classesOn } from "@/lib/services/availability";
import { istParts } from "@/lib/services/time";
import { firstName, fmtDate, fmtTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My Dashboard" };

export default async function TeacherDashboardPage() {
  const [viewer, now, calendar] = await Promise.all([getViewer(), getNow(), getCalendar()]);
  const a = (await getAvailability([viewer.id], now)).get(viewer.id)!;
  const today = istParts(now).date;
  const todays = a.entries ? classesOn(today, { periods: calendar.periods, entries: a.entries, overrides: a.overrides }) : [];
  const onLeaveNow = a.status.status === "ON_LEAVE";

  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("complaints")
    .select("id, code, subject, response_requested_at, status")
    .eq("response_requested_from", viewer.id)
    .is("response_received_at", null)
    .not("status", "in", "(RESOLVED,CLOSED)")
    .order("response_requested_at", { ascending: false });

  const locked = ["IN_CLASS", "ON_LEAVE", "HOLIDAY", "OFF_HOURS"].includes(a.status.status)
    ? `Your status is "${a.status.label}" right now. The meeting switch only applies to free periods and can't override it.`
    : null;

  const [approver, toApprove] = await Promise.all([viewer.isVerified ? null : approverLabel(viewer), pendingApprovalsFor({ ...viewer, clusterHeadOf: [] })]);
  return (
    <>
      {approver && <PendingSelfBanner approver={approver} restriction="Until then you don't appear in Find a Teacher or on section routines." />}
      <ApprovalsReminder students={toApprove.students} teachers={0} studentsHref="/teacher/my-section?status=PENDING" />
      <HeroBanner
        eyebrow={formatLongDate(now)}
        title={`${greetingFor(now)}, ${firstName(viewer.fullName)}`}
        subtitle={`${viewer.teacher?.designation ?? "Faculty"} · ${viewer.teacher?.departmentCode ?? ""}${viewer.teacher?.clusterName ? ` · ${viewer.teacher.clusterName}` : ""}`}
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90">
            <Link href="/teacher/unavailability"><CalendarOff aria-hidden /> Mark Unavailability</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
            <Link href="/teacher/timetable"><CalendarDays aria-hidden /> Edit Timetable</Link>
          </Button>
        </div>
      </HeroBanner>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-6 shadow-card lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">My status (what students see)</h2>
            <LiveRefresh />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col justify-center rounded-xl bg-muted/40 p-5">
              <StatusChip status={a.status.status} label={a.status.label} size="lg" className="h-12 self-start px-5 text-lg" />
              <p className="mt-3 text-base font-medium">{a.status.detail}</p>
              {onLeaveNow && (
                <Link href="/teacher/unavailability" className="mt-2 text-sm font-semibold text-primary hover:underline">Manage unavailability →</Link>
              )}
            </div>
            <MeetingToggle initial={a.acceptingMeetings} note={a.meetingNote} lockedReason={locked} />
          </div>
        </section>

        <SectionCard title="Next class" icon={CalendarClock}>
          {a.next ? (
            <div className="space-y-2">
              <p className="text-xl font-bold leading-tight">{a.next.subjectName}</p>
              <p className="text-muted-foreground">
                {[a.next.subjectCode, a.next.section && `Section ${a.next.section}`].filter(Boolean).join(" · ")}
              </p>
              <p className="text-lg font-semibold">Room {a.next.room ?? "TBA"}</p>
              <p className="text-sm text-muted-foreground">
                {istParts(a.next.startsAt).date === today ? "Today" : fmtDate(a.next.startsAt)}, {fmtTime(a.next.startsAt)} – {fmtTime(a.next.endsAt)}
              </p>
              <p className="rounded-lg bg-status-in-class-bg px-3 py-2 text-status-in-class-fg">
                <Countdown targetIso={a.next.startsAt.toISOString()} nowIso={now.toISOString()} />
              </p>
            </div>
          ) : (
            <EmptyState icon={CalendarClock} title={a.entries ? "No upcoming classes" : "Timetable not published"} description={a.entries ? "Nothing scheduled in the next two weeks." : "Publish your timetable so students can see your classes."} action={!a.entries ? <Button asChild><Link href="/teacher/timetable">Create timetable</Link></Button> : undefined} className="py-6" />
          )}
        </SectionCard>

        <SectionCard title="Today" icon={ListChecks} className="lg:col-span-2" action={{ label: "Full timetable", href: "/teacher/timetable" }}>
          {todays.length === 0 ? (
            <EmptyState icon={CircleCheck} title="No classes today" description={a.entries ? "Enjoy the free day." : "Publish your timetable to see today's classes here."} className="py-6" />
          ) : (
            <ol className="relative space-y-3 border-l-2 border-border pl-6">
              {todays.map((c, i) => {
                const live = c.startsAt <= now && now < c.endsAt;
                const done = c.endsAt <= now;
                return (
                  <li key={i} className="relative">
                    <span className={cn("absolute top-3 -left-[31px] size-4 rounded-full border-2 border-card", live ? "bg-status-in-class ring-4 ring-status-in-class/20" : done ? "bg-muted-foreground/40" : "bg-primary")} aria-hidden />
                    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 px-4 py-3", done ? "border-muted-foreground/40 bg-muted/60" : TYPE_STYLE[c.type].cell)}>
                      <div>
                        <p className="font-semibold">{c.subjectName}{c.isExtra && <span className="ml-2 rounded bg-black/10 px-1.5 text-xs">Extra</span>}</p>
                        <p className="text-sm opacity-85">{[c.section && `Section ${c.section}`, c.room && `Room ${c.room}`].filter(Boolean).join(" · ")}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {fmtTime(c.startsAt)} – {fmtTime(c.endsAt)}
                        {live && <span className="ml-2 rounded bg-status-in-class px-1.5 py-0.5 text-xs text-white">NOW</span>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>

        <SectionCard title="Pending complaint responses" icon={MessagesSquare} action={{ label: "All", href: "/teacher/complaints" }}>
          {!requests?.length ? (
            <EmptyState icon={CircleCheck} title="Nothing pending" description="You'll be notified if a handler requests your response." className="py-6" />
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/complaints/${r.code}`} className="block rounded-lg border p-3 hover:border-primary/40 hover:bg-accent/40">
                    <p className="text-xs font-semibold text-primary">{r.code}</p>
                    <p className="line-clamp-2 text-sm font-medium">{r.subject}</p>
                    <p className="text-xs text-muted-foreground">Requested {r.response_requested_at ? relativeTime(r.response_requested_at, now) : ""}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t pt-4">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/teacher/timetable/upload"><Upload aria-hidden /> Upload timetable (scan)</Link>
            </Button>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
