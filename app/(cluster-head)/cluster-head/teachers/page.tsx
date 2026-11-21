import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { TeacherStatusTable } from "@/components/dashboards/teacher-status-table";
import { OnLeavePanel } from "@/components/dashboards/panels";
import { getViewer } from "@/lib/data/viewer";
import { listTeachers } from "@/lib/data/teachers";
import { getAvailability } from "@/lib/data/availability";
import { teachersOnLeaveToday } from "@/lib/data/dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNow } from "@/lib/datetime";

export const metadata: Metadata = { title: "Cluster Teachers" };

export default async function ClusterTeachersPage() {
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const clusterId = viewer.clusterHeadOf[0];
  const teachers = clusterId ? await listTeachers({ clusterId }) : [];
  const availability = await getAvailability(teachers.map((t) => t.id), now);
  const onLeave = teachersOnLeaveToday(teachers, availability, now);
  const reasons = new Map<string, string | null>();
  if (onLeave.length) {
    const { data } = await createAdminClient().from("teacher_unavailability").select("id, reason_private").in("id", onLeave.map((o) => o.leave.id));
    (data ?? []).forEach((r) => reasons.set(r.id, r.reason_private));
  }
  return (
    <>
      <PageHeader title="Cluster Teachers" description="Live status, next class and timetable status for your cluster." breadcrumbs={[{ label: "Cluster Overview", href: "/cluster-head" }, { label: "Cluster Teachers" }]} actions={<LiveRefresh />} />
      {teachers.length === 0 ? (
        <EmptyState icon={Users} title="No teachers in your cluster yet" />
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2"><TeacherStatusTable teachers={teachers} availability={availability} /></div>
          <OnLeavePanel items={onLeave} reasons={reasons} className="xl:self-start" />
        </div>
      )}
    </>
  );
}
