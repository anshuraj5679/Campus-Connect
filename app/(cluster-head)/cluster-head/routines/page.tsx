import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, FileUp, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { AddSectionForm } from "@/components/cluster-head/add-section-form";
import { getViewer } from "@/lib/data/viewer";
import { listClusterSections } from "@/lib/data/routines";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Section Routines" };

const BADGE = {
  PUBLISHED: { label: "Published", cls: "bg-status-available-bg text-status-available-fg" },
  DRAFT: { label: "Draft, not published", cls: "bg-status-busy-bg text-status-busy-fg" },
  NONE: { label: "Not uploaded", cls: "bg-destructive/10 text-destructive" },
} as const;

export default async function SectionRoutinesPage() {
  const viewer = await getViewer();
  const sections = await listClusterSections(viewer.clusterHeadOf);
  const { data: cluster } = viewer.clusterHeadOf[0]
    ? await createAdminClient().from("clusters").select("name, departments(code)").eq("id", viewer.clusterHeadOf[0]).single()
    : { data: null };
  const clusterName = cluster?.name ?? "your cluster";
  const done = sections.filter((s) => s.status === "PUBLISHED").length;

  return (
    <>
      <PageHeader
        title="Section Routines"
        description={
          cluster
            ? `${(cluster as any).departments?.code ?? ""} ${clusterName} · ${done} of ${sections.length} sections published. Upload each section's routine PDF; its students see their classes on their dashboard.`
            : "You are not assigned to a cluster yet."
        }
        breadcrumbs={[{ label: "Cluster Overview", href: "/cluster-head" }, { label: "Section Routines" }]}
      />

      {cluster && (
        <div className="mb-5 rounded-xl border bg-card p-4 shadow-card">
          <AddSectionForm clusterName={clusterName} />
          <p className="mt-2 text-xs text-muted-foreground">Sections are also added automatically when a student signs up with a new section.</p>
        </div>
      )}

      {sections.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No sections in your cluster yet" description="Add a section above (for example 5J), then upload its routine." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => {
            const badge = BADGE[s.status];
            return (
              <li key={s.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold">Section {s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.departmentCode} · Semester {s.semester}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", badge.cls)}>{badge.label}</span>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-sm"><Users aria-hidden className="size-4 text-muted-foreground" /> {s.students} student{s.students === 1 ? "" : "s"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.status === "PUBLISHED" ? `${s.classes} classes · published ${fmtDateTime(s.publishedAt!)}` : s.status === "DRAFT" ? `Draft saved ${s.updatedAt ? fmtDateTime(s.updatedAt) : ""}` : "Students see “Routine not published” until you upload it."}
                  {s.status === "PUBLISHED" && s.hasDraft && " · unpublished changes"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm">
                    <Link href={`/cluster-head/routines/${s.id}/upload`}><FileUp aria-hidden /> {s.status === "NONE" ? "Upload routine PDF" : "Upload new PDF"}</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/cluster-head/routines/${s.id}`}><Pencil aria-hidden /> {s.status === "NONE" ? "Enter manually" : "View / edit"}</Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
