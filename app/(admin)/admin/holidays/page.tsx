import type { Metadata } from "next";
import { CalendarX2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/kit";
import { EmptyState } from "@/components/shared/empty-state";
import { AddHolidayForm, DeleteHolidayButton } from "@/components/admin/controls";
import { getCalendar } from "@/lib/data/calendar";
import { requireRole } from "@/lib/auth/session";
import { getNow } from "@/lib/datetime";
import { istDateTime, istParts } from "@/lib/services/time";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Holidays" };

export default async function AdminHolidaysPage() {
  await requireRole(["ADMIN"]);
  const [{ holidays }, now] = await Promise.all([getCalendar(), getNow()]);
  const today = istParts(now).date;
  const byMonth = new Map<string, typeof holidays>();
  for (const h of holidays) {
    const key = formatInTimeZone(istDateTime(h.date, "12:00"), "Asia/Kolkata", "MMMM yyyy");
    byMonth.set(key, [...(byMonth.get(key) ?? []), h]);
  }
  return (
    <>
      <PageHeader title="Holiday calendar" description="On holidays every teacher shows as “Holiday” and SLA deadlines skip the day." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Holidays" }]} />
      <SectionCard title="Add holiday" icon={CalendarX2} className="mb-5"><AddHolidayForm /></SectionCard>
      {holidays.length === 0 ? (
        <EmptyState icon={CalendarX2} title="No holidays added" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...byMonth.entries()].map(([month, list]) => (
            <SectionCard key={month} title={month}>
              <ul className="divide-y">
                {list.map((h) => {
                  const d = istDateTime(h.date, "12:00");
                  return (
                    <li key={h.id} className={cn("flex items-center gap-3 py-2.5", h.date < today && "opacity-50")}>
                      <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-maroon/10 py-1 text-maroon">
                        <span className="text-lg leading-none font-bold tabular-nums">{formatInTimeZone(d, "Asia/Kolkata", "d")}</span>
                        <span className="text-[11px] font-semibold uppercase">{formatInTimeZone(d, "Asia/Kolkata", "EEE")}</span>
                      </span>
                      <span className="flex-1 font-medium">{h.name}</span>
                      <DeleteHolidayButton id={h.id} name={h.name} />
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          ))}
        </div>
      )}
    </>
  );
}
