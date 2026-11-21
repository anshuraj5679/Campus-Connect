import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ComplaintStatusBadge } from "@/components/complaints/badges";
import { getViewer } from "@/lib/data/viewer";
import { listComplaints } from "@/lib/data/complaints";
import { getNow } from "@/lib/datetime";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Complaint Responses" };

export default async function TeacherComplaintsPage() {
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const rows = await listComplaints(viewer, { scope: "responses" });
  return (
    <>
      <PageHeader
        title="Complaint Responses"
        description="Complaints where a Cluster Head or HOD has asked for your response. You can reply privately but cannot change status."
        breadcrumbs={[{ label: "My Dashboard", href: "/teacher" }, { label: "Complaint Responses" }]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No response requests" description="You'll get a notification when a handler asks for your response." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/complaints/${r.code}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5 shadow-card hover:border-primary/40">
                <div>
                  <p className="font-bold text-primary">{r.code}</p>
                  <p className="font-semibold">{r.subject}</p>
                  <p className="text-sm text-muted-foreground">Requested by {r.assigneeName} · {relativeTime(r.updatedAt, now)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r.responseRequested && <span className="rounded-full bg-status-busy-bg px-2.5 py-1 text-xs font-semibold text-status-busy-fg">Awaiting your reply</span>}
                  <ComplaintStatusBadge status={r.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
