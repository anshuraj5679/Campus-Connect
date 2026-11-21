import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/kit";
import { PeriodSlotsEditor } from "@/components/admin/settings-form";
import { getCalendar } from "@/lib/data/calendar";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Period Slots" };

export default async function AdminPeriodsPage() {
  await requireRole(["ADMIN"]);
  const { periods } = await getCalendar();
  return (
    <>
      <PageHeader title="Period slots" description="The bell schedule every timetable and live status is built on." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Period Slots" }]} />
      <SectionCard title="Daily schedule" icon={Clock}>
        <PeriodSlotsEditor initial={periods.map((p) => ({ label: p.label, start: p.start, end: p.end, isBreak: p.isBreak }))} />
      </SectionCard>
    </>
  );
}
