import type { Metadata } from "next";
import { CalendarOff, Clock as History, Info, Repeat } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/kit";
import { EmptyState } from "@/components/shared/empty-state";
import { UnavailabilityForm } from "@/components/teacher/unavailability-form";
import { CancelLeaveButton, DeleteOverrideButton, OverrideForm } from "@/components/teacher/override-form";
import { getViewer } from "@/lib/data/viewer";
import { getCalendar } from "@/lib/data/calendar";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNow } from "@/lib/datetime";
import { istDateTime, istParts } from "@/lib/services/time";
import { teachingPeriods } from "@/lib/services/periods";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mark Unavailability" };

const TYPE_LABEL: Record<string, string> = { FULL_DAY: "Full day", HALF_DAY: "Half day", DATE_RANGE: "Date range", CUSTOM_PERIODS: "Specific periods" };

export default async function UnavailabilityPage() {
  const [viewer, calendar, now] = await Promise.all([getViewer(), getCalendar(), getNow()]);
  const today = istParts(now).date;
  // Own rows, including the private reason (the page is gated to the teacher themself).
  const admin = createAdminClient();
  const [{ data: rows }, { data: overrides }, { data: sections }] = await Promise.all([
    admin.from("teacher_unavailability").select("*").eq("teacher_id", viewer.id).order("start_at", { ascending: false }).limit(30),
    admin.from("schedule_overrides").select("id, date, period, kind, subject_name, room, sections(name)").eq("teacher_id", viewer.id).gte("date", today).order("date"),
    admin.from("sections").select("id, name, departments(code)").order("name"),
  ]);
  const periods = teachingPeriods(calendar.periods).map((p) => ({
    no: p.periodNo!,
    label: p.label,
    time: `${fmtTime(istDateTime(today, p.start))}–${fmtTime(istDateTime(today, p.end))}`,
  }));
  const active = (rows ?? []).filter((r) => !r.cancelled_at && new Date(r.end_at) > now);
  const past = (rows ?? []).filter((r) => r.cancelled_at || new Date(r.end_at) <= now);

  return (
    <>
      <PageHeader
        title="Mark Unavailability"
        description="A live status update for students. This is not an HR leave application and needs no approval."
        breadcrumbs={[{ label: "My Dashboard", href: "/teacher" }, { label: "Mark Unavailability" }]}
      />
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="space-y-5 xl:col-span-3">
          <SectionCard title="New unavailability" icon={CalendarOff}>
            <UnavailabilityForm today={today} periods={periods} />
          </SectionCard>
          <SectionCard title="Class changes" icon={Repeat} description="Cancel a single class or add an extra class">
            <OverrideForm today={today} periods={periods.map((p) => ({ no: p.no, label: `${p.label} · ${p.time}` }))} sections={(sections ?? []).map((s: any) => ({ id: s.id, label: `${s.departments?.code ?? ""} ${s.name}` }))} />
            {(overrides ?? []).length > 0 && (
              <ul className="mt-5 divide-y rounded-lg border">
                {(overrides ?? []).map((o: any) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span>
                      <span className={cn("mr-2 rounded px-1.5 py-0.5 text-xs font-bold", o.kind === "CANCELLED" ? "bg-status-leave-bg text-status-leave-fg" : "bg-status-in-class-bg text-status-in-class-fg")}>
                        {o.kind === "CANCELLED" ? "Cancelled" : "Extra"}
                      </span>
                      {fmtDate(istDateTime(o.date, "12:00"))} · P{o.period}
                      {o.subject_name && ` · ${o.subject_name}`}
                      {o.sections?.name && ` · ${o.sections.name}`}
                    </span>
                    <DeleteOverrideButton id={o.id} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5 xl:col-span-2">
          <SectionCard title="Current & upcoming" icon={CalendarOff}>
            {active.length === 0 ? (
              <EmptyState icon={CalendarOff} title="You are not marked unavailable" description="Students see your normal timetable status." className="py-6" />
            ) : (
              <ul className="space-y-3">
                {active.map((r) => {
                  const ongoing = new Date(r.start_at) <= now;
                  return (
                    <li key={r.id} className="rounded-lg border border-status-leave/30 bg-status-leave-bg/50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {TYPE_LABEL[r.type]}
                            {r.half && ` · ${r.half === "FN" ? "Forenoon" : "Afternoon"}`}
                            {ongoing && <span className="ml-2 rounded bg-status-leave px-1.5 py-0.5 text-xs text-white">ACTIVE</span>}
                          </p>
                          <p className="text-sm text-muted-foreground">{fmtDateTime(r.start_at)} – {fmtDateTime(r.end_at)}</p>
                          {r.reason_private && <p className="mt-1 text-sm">Reason (private): {r.reason_private}</p>}
                        </div>
                        <CancelLeaveButton id={r.id} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="History" icon={History}>
            {past.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past entries.</p>
            ) : (
              <ul className="divide-y text-sm">
                {past.slice(0, 10).map((r) => (
                  <li key={r.id} className="py-2">
                    <span className="font-medium">{TYPE_LABEL[r.type]}</span> · {fmtDateTime(r.start_at)} – {fmtDateTime(r.end_at)}
                    {r.cancelled_at && <span className="ml-2 text-xs text-muted-foreground">(cancelled)</span>}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <p className="flex gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            While you are unavailable, students see <strong className="mx-1">On Leave</strong> with your return time. The meeting switch cannot override it.
          </p>
        </div>
      </div>
    </>
  );
}
