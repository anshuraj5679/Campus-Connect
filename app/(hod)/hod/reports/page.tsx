import type { Metadata } from "next";
import { ChartColumn, Tags } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard, KpiCard } from "@/components/shared/kit";
import { BarChartView } from "@/components/shared/bar-chart";
import { getViewer } from "@/lib/data/viewer";
import { listComplaints } from "@/lib/data/complaints";
import { complaintKpis } from "@/lib/data/dashboard";
import { getNow } from "@/lib/datetime";
import { CATEGORY_LABEL, type ComplaintCategory } from "@/lib/services/complaintRouting";
import { STATUS_LABEL, type ComplaintStatus } from "@/lib/services/complaintWorkflow";
import { AlarmClock, CircleCheckBig, Hourglass, Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Reports" };

const SHORT: Record<ComplaintCategory, string> = { TEACHER: "Teacher", ACADEMIC: "Academic", DEPARTMENT: "Department", FACILITY: "Facility", COLLEGE: "College", CONFIDENTIAL: "Confidential" };

export default async function HodReportsPage() {
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const rows = (await listComplaints(viewer, { scope: "handler" })).filter((c) => !viewer.hodOf[0] || c.departmentId === viewer.hodOf[0] || c.assigneeId === viewer.id);
  const kpi = complaintKpis(rows, now);
  const byCategory = (Object.keys(CATEGORY_LABEL) as ComplaintCategory[]).map((c) => ({ name: SHORT[c], complaints: rows.filter((r) => r.category === c).length }));
  const byStatus = (["ASSIGNED", "UNDER_REVIEW", "ACTION_TAKEN", "ESCALATED", "REOPENED", "RESOLVED", "CLOSED"] as ComplaintStatus[]).map((s) => ({ name: STATUS_LABEL[s], complaints: rows.filter((r) => r.status === s).length }));

  return (
    <>
      <PageHeader title="Reports" description="Complaint statistics for your department." breadcrumbs={[{ label: "Department Overview", href: "/hod" }, { label: "Reports" }]} />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open" value={kpi.open} icon={Inbox} tone="blue" />
        <KpiCard label="Overdue SLA" value={kpi.overdue} icon={AlarmClock} tone={kpi.overdue ? "red" : "slate"} />
        <KpiCard label="Resolved this month" value={kpi.resolvedThisMonth} icon={CircleCheckBig} tone="green" />
        <KpiCard label="Avg. resolution" value={kpi.avgResolutionDays} icon={Hourglass} hint="days" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Complaints by category" icon={Tags}>
          <BarChartView data={byCategory} categoryKey="name" caption="Complaints by category" series={[{ key: "complaints", label: "Complaints", color: "var(--chart-1)" }]} />
        </SectionCard>
        <SectionCard title="Complaints by status" icon={ChartColumn}>
          <BarChartView data={byStatus} categoryKey="name" caption="Complaints by status" series={[{ key: "complaints", label: "Complaints", color: "var(--chart-1)" }]} />
        </SectionCard>
      </div>
    </>
  );
}
