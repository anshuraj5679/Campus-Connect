import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus, MessageSquareExclamationPoint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterChips } from "@/components/shared/url-controls";
import { ComplaintStatusBadge, ConfidentialBadge } from "@/components/complaints/badges";
import { getViewer } from "@/lib/data/viewer";
import { listComplaints } from "@/lib/data/complaints";
import { getNow } from "@/lib/datetime";
import { CATEGORY_LABEL } from "@/lib/services/complaintRouting";
import { OPEN_STATUSES } from "@/lib/services/complaintWorkflow";
import { fmtDate, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "My Complaints" };

export default async function StudentComplaintsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const rows = await listComplaints(viewer, { scope: "student" });
  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const resolved = rows.filter((r) => r.status === "RESOLVED");
  const closed = rows.filter((r) => r.status === "CLOSED");
  const list = sp.status === "OPEN" ? open : sp.status === "RESOLVED" ? resolved : sp.status === "CLOSED" ? closed : rows;

  return (
    <>
      <PageHeader
        title="My Complaints"
        description="Track every complaint you raised, from submission to closure."
        breadcrumbs={[{ label: "Home", href: "/student" }, { label: "My Complaints" }]}
        actions={
          <Button asChild size="lg">
            <Link href="/student/complaints/new"><FilePlus aria-hidden /> Raise a complaint</Link>
          </Button>
        }
      />
      <div className="mb-5">
        <FilterChips
          param="status"
          options={[
            { value: "OPEN", label: "Open", count: open.length },
            { value: "RESOLVED", label: "Resolved", count: resolved.length },
            { value: "CLOSED", label: "Closed", count: closed.length },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={MessageSquareExclamationPoint}
          title={rows.length ? "No complaints in this view" : "You haven't raised any complaints"}
          description="Facing an issue with a class, teacher or facility? Let us know."
          action={<Button asChild><Link href="/student/complaints/new">Raise a complaint</Link></Button>}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/complaints/${r.code}`} className="block h-full rounded-xl border bg-card p-5 shadow-card transition-colors hover:border-primary/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-primary tabular-nums">{r.code}</span>
                  <span className="flex gap-1.5">{r.isConfidential && <ConfidentialBadge />}<ComplaintStatusBadge status={r.status} /></span>
                </div>
                <p className="mt-2 text-base font-semibold">{r.subject}</p>
                <p className="mt-1 text-sm text-muted-foreground">{CATEGORY_LABEL[r.category]}{r.teacherName ? ` · ${r.teacherName}` : ""}</p>
                <p className="mt-3 text-sm">With <span className="font-medium">{r.assigneeName ?? "—"}</span></p>
                <p className="text-xs text-muted-foreground">Raised {fmtDate(r.createdAt)} · updated {relativeTime(r.updatedAt, now)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
