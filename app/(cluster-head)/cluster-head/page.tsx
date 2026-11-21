import type { Metadata } from "next";
import { AlarmClock, CircleCheckBig, Hourglass, Inbox, Users } from "lucide-react";
import { HeroBanner, KpiCard } from "@/components/shared/kit";
import { OnLeavePanel, UnpublishedPanel, UrgentComplaints } from "@/components/dashboards/panels";
import { getViewer } from "@/lib/data/viewer";
import { listComplaints } from "@/lib/data/complaints";
import { listTeachers } from "@/lib/data/teachers";
import { getAvailability } from "@/lib/data/availability";
import { complaintKpis, teachersOnLeaveToday, timetablesNotPublished } from "@/lib/data/dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatLongDate, getNow, greetingFor } from "@/lib/datetime";
import { firstName } from "@/lib/format";

export const metadata: Metadata = { title: "Cluster Overview" };

export default async function ClusterHeadDashboardPage() {
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const clusterId = viewer.clusterHeadOf[0];
  const [complaints, teachers] = await Promise.all([
    listComplaints(viewer, { scope: "handler" }),
    clusterId ? listTeachers({ clusterId }) : Promise.resolve([]),
  ]);
  const { data: cluster } = clusterId
    ? await createAdminClient().from("clusters").select("name, departments(code, name)").eq("id", clusterId).single()
    : { data: null };
  const availability = await getAvailability(teachers.map((t) => t.id), now);
  const kpi = complaintKpis(complaints, now);
  const onLeave = teachersOnLeaveToday(teachers, availability, now);

  // Cluster Heads may read private leave reasons of their cluster (SQL function checks it)
  const reasons = new Map<string, string | null>();
  const admin = createAdminClient();
  for (const item of onLeave) {
    const { data } = await admin.from("teacher_unavailability").select("reason_private").eq("id", item.leave.id).single();
    reasons.set(item.leave.id, data?.reason_private ?? null);
  }

  const clusterLabel = cluster ? `${(cluster as any).departments?.code} ${cluster.name}` : "No cluster assigned";

  return (
    <>
      <HeroBanner eyebrow={formatLongDate(now)} title={`${greetingFor(now)}, ${firstName(viewer.fullName)}`} subtitle={`Cluster Head · ${clusterLabel} · ${teachers.length} teachers`} />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open complaints" value={kpi.open} icon={Inbox} tone="blue" href="/cluster-head/complaints?status=OPEN" />
        <KpiCard label="Overdue SLA" value={kpi.overdue} icon={AlarmClock} tone={kpi.overdue ? "red" : "slate"} hint="Not acted on within 5 working days" href="/cluster-head/complaints?overdue=1" />
        <KpiCard label="Resolved this month" value={kpi.resolvedThisMonth} icon={CircleCheckBig} tone="green" />
        <KpiCard label="Avg. resolution" value={kpi.avgResolutionDays} icon={Hourglass} tone="navy" hint="days" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <UrgentComplaints rows={complaints} now={now} href="/cluster-head/complaints" className="lg:col-span-2" />
        <OnLeavePanel items={onLeave} reasons={reasons} />
        <UnpublishedPanel teachers={timetablesNotPublished(teachers, availability)} className="lg:col-span-3" />
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Users aria-hidden className="size-4" /> See every teacher&apos;s live status on the Cluster Teachers page.</p>
    </>
  );
}
