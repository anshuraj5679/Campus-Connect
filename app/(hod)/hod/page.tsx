import type { Metadata } from "next";
import { AlarmClock, ChartColumn, CircleCheckBig, Hourglass, Inbox } from "lucide-react";
import { HeroBanner, KpiCard, SectionCard } from "@/components/shared/kit";
import { BarChartView } from "@/components/shared/bar-chart";
import { OnLeavePanel, UnpublishedPanel, UrgentComplaints } from "@/components/dashboards/panels";
import { getViewer } from "@/lib/data/viewer";
import { listComplaints } from "@/lib/data/complaints";
import { listTeachers } from "@/lib/data/teachers";
import { getAvailability } from "@/lib/data/availability";
import { complaintKpis, teachersOnLeaveToday, timetablesNotPublished } from "@/lib/data/dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatLongDate, getNow, greetingFor } from "@/lib/datetime";
import { OPEN_STATUSES } from "@/lib/services/complaintWorkflow";
import { firstName } from "@/lib/format";

export const metadata: Metadata = { title: "Department Overview" };

export default async function HodDashboardPage() {
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const deptId = viewer.hodOf[0];
  const admin = createAdminClient();
  const [complaints, teachers, deptRes, clustersRes] = await Promise.all([
    listComplaints(viewer, { scope: "handler" }),
    deptId ? listTeachers({ departmentId: deptId }) : Promise.resolve([]),
    deptId ? admin.from("departments").select("code, name").eq("id", deptId).single() : Promise.resolve({ data: null }),
    deptId ? admin.from("clusters").select("id, name").eq("department_id", deptId).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const deptComplaints = complaints.filter((c) => !deptId || c.departmentId === deptId || c.assigneeId === viewer.id);
  const availability = await getAvailability(teachers.map((t) => t.id), now);
  const kpi = complaintKpis(deptComplaints, now);
  const onLeave = teachersOnLeaveToday(teachers, availability, now);
  const reasons = new Map<string, string | null>();
  if (onLeave.length) {
    const { data } = await admin.from("teacher_unavailability").select("id, reason_private").in("id", onLeave.map((o) => o.leave.id));
    (data ?? []).forEach((r) => reasons.set(r.id, r.reason_private));
  }
  const chart = (clustersRes.data ?? []).map((c) => ({
    name: c.name,
    open: deptComplaints.filter((x) => x.clusterId === c.id && OPEN_STATUSES.includes(x.status)).length,
    resolved: deptComplaints.filter((x) => x.clusterId === c.id && (x.status === "RESOLVED" || x.status === "CLOSED")).length,
  }));
  const dept = deptRes.data as { code: string; name: string } | null;

  return (
    <>
      <HeroBanner eyebrow={formatLongDate(now)} title={`${greetingFor(now)}, ${firstName(viewer.fullName)}`} subtitle={`Head of Department · ${dept ? `${dept.code} · ${dept.name}` : "No department assigned"}`} />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open complaints" value={kpi.open} icon={Inbox} tone="blue" href="/hod/complaints?status=OPEN" />
        <KpiCard label="Overdue SLA" value={kpi.overdue} icon={AlarmClock} tone={kpi.overdue ? "red" : "slate"} href="/hod/complaints?overdue=1" />
        <KpiCard label="Resolved this month" value={kpi.resolvedThisMonth} icon={CircleCheckBig} tone="green" />
        <KpiCard label="Avg. resolution" value={kpi.avgResolutionDays} icon={Hourglass} tone="navy" hint="days" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Cluster comparison" icon={ChartColumn} description="Open vs resolved complaints per cluster" className="lg:col-span-2">
          <BarChartView
            data={chart}
            categoryKey="name"
            caption="Open and resolved complaints per cluster"
            series={[
              { key: "open", label: "Open", color: "var(--chart-1)" },
              { key: "resolved", label: "Resolved / closed", color: "var(--chart-2)" },
            ]}
          />
        </SectionCard>
        <OnLeavePanel items={onLeave} reasons={reasons} />
        <UrgentComplaints rows={deptComplaints} now={now} href="/hod/complaints" className="lg:col-span-2" />
        <UnpublishedPanel teachers={timetablesNotPublished(teachers, availability)} />
      </div>
    </>
  );
}
