import type { Metadata } from "next";
import Link from "next/link";
import { Network } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ApprovalButtons } from "@/components/people/people-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { SectionCard } from "@/components/shared/kit";
import { TeacherStatusTable } from "@/components/dashboards/teacher-status-table";
import { getViewer } from "@/lib/data/viewer";
import { listTeachers } from "@/lib/data/teachers";
import { getAvailability } from "@/lib/data/availability";
import { listComplaints } from "@/lib/data/complaints";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNow } from "@/lib/datetime";
import { OPEN_STATUSES } from "@/lib/services/complaintWorkflow";

export const metadata: Metadata = { title: "Clusters" };

export default async function HodClustersPage() {
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const deptId = viewer.hodOf[0];
  if (!deptId) return <EmptyState icon={Network} title="You are not assigned as HOD of a department" />;
  const admin = createAdminClient();
  const [{ data: clusters }, { data: sections }, teachers, complaints] = await Promise.all([
    admin.from("clusters").select("id, name, head:profiles!clusters_cluster_head_id_fkey(id, full_name, is_verified, is_active)").eq("department_id", deptId).order("name"),
    admin.from("sections").select("name, cluster_id").eq("department_id", deptId).order("name"),
    listTeachers({ departmentId: deptId }),
    listComplaints(viewer, { scope: "handler" }),
  ]);
  const availability = await getAvailability(teachers.map((t) => t.id), now);

  return (
    <>
      <PageHeader title="Clusters" description="Every cluster in your department with live teacher status." breadcrumbs={[{ label: "Department Overview", href: "/hod" }, { label: "Clusters" }]} actions={<LiveRefresh />} />
      <div className="space-y-5">
        {(clusters ?? []).map((c: any) => {
          const members = teachers.filter((t) => t.clusterId === c.id);
          const open = complaints.filter((x) => x.clusterId === c.id && OPEN_STATUSES.includes(x.status)).length;
          const leave = members.filter((t) => availability.get(t.id)?.status.status === "ON_LEAVE").length;
          return (
            <SectionCard
              key={c.id}
              title={c.name}
              icon={Network}
              description={`Cluster Head: ${c.head?.full_name ?? "vacant"} · Sections ${(sections ?? []).filter((s) => s.cluster_id === c.id).map((s) => s.name).join(", ") || "none"}`}
              action={
                <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  {c.head && !c.head.is_verified && (
                    <span className="flex items-center gap-2 rounded-full bg-status-busy-bg py-0.5 pl-2.5 pr-1 text-status-busy-fg">
                      Cluster Head pending approval
                      <ApprovalButtons userId={c.head.id} name={c.head.full_name} status={c.head.is_active ? "PENDING" : "REJECTED"} />
                    </span>
                  )}
                  <span className="rounded-full bg-muted px-2.5 py-1">{members.length} teachers</span>
                  <Link href="/hod/complaints?status=OPEN" className="rounded-full bg-status-in-class-bg px-2.5 py-1 text-status-in-class-fg">{open} open complaints</Link>
                  {leave > 0 && <span className="rounded-full bg-status-leave-bg px-2.5 py-1 text-status-leave-fg">{leave} on leave</span>}
                </span>
              }
              bodyClassName="p-0"
            >
              {members.length ? <TeacherStatusTable teachers={members} availability={availability} /> : <p className="p-5 text-sm text-muted-foreground">No teachers yet.</p>}
            </SectionCard>
          );
        })}
      </div>
    </>
  );
}
