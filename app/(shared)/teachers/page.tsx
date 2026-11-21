import type { Metadata } from "next";
import { UserSearch } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TeacherCard } from "@/components/shared/teacher-card";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { FilterSelect, Pagination, SearchBox, ToggleParam } from "@/components/shared/url-controls";
import { listDepartmentsAndClusters, listTeachers } from "@/lib/data/teachers";
import { getAvailability } from "@/lib/data/availability";
import { getViewer } from "@/lib/data/viewer";
import { getNow } from "@/lib/datetime";

export const metadata: Metadata = { title: "Find a Teacher" };

const PAGE_SIZE = 12;
const ORDER = ["AVAILABLE", "IN_CLASS", "BUSY", "ON_LEAVE", "HOLIDAY", "OFF_HOURS", "NOT_PUBLISHED"];

export default async function FindTeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; cluster?: string; subject?: string; available?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const now = await getNow();
  const [teachers, structure] = await Promise.all([listTeachers(), listDepartmentsAndClusters()]);
  const availability = await getAvailability(teachers.map((t) => t.id), now);

  // Default the department filter to the student's own department on first visit.
  const dept = sp.dept ?? "";
  const q = (sp.q ?? "").toLowerCase();
  let list = teachers.filter((t) => {
    if (dept && t.departmentId !== dept) return false;
    if (sp.cluster && t.clusterId !== sp.cluster) return false;
    if (sp.subject && !t.subjects.includes(sp.subject)) return false;
    if (sp.available === "1" && availability.get(t.id)?.status.status !== "AVAILABLE") return false;
    if (q) {
      const hay = [t.fullName, t.designation, t.cabin, t.departmentCode, t.clusterName, ...t.subjects].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list = list.sort(
    (a, b) =>
      Number(b.departmentId === (viewer.student?.departmentId ?? viewer.teacher?.departmentId)) -
        Number(a.departmentId === (viewer.student?.departmentId ?? viewer.teacher?.departmentId)) ||
      ORDER.indexOf(availability.get(a.id)!.status.status) - ORDER.indexOf(availability.get(b.id)!.status.status) ||
      a.fullName.localeCompare(b.fullName),
  );

  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pageCount);
  const pageItems = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clusters = structure.clusters.filter((c) => !dept || c.department_id === dept);
  const subjects = [...new Set(teachers.filter((t) => !dept || t.departmentId === dept).flatMap((t) => t.subjects))].sort();
  const availableCount = [...availability.values()].filter((a) => a.status.status === "AVAILABLE").length;

  return (
    <>
      <PageHeader
        title="Find a Teacher"
        description="Live availability, current class and cabin for every faculty member."
        actions={<LiveRefresh />}
      />

      <div className="sticky top-16 z-30 -mx-4 mb-5 space-y-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <SearchBox placeholder="Search by name, subject or cabin…" />
        <div className="flex flex-wrap gap-2">
          <FilterSelect param="dept" label="Department" options={structure.departments.map((d) => ({ value: d.id, label: d.code }))} />
          <FilterSelect
            param="cluster"
            label="Cluster"
            options={clusters.map((c) => ({ value: c.id, label: `${structure.departments.find((d) => d.id === c.department_id)?.code ?? ""} · ${c.name}` }))}
          />
          <FilterSelect param="subject" label="Subject" options={subjects.map((s) => ({ value: s, label: s }))} />
          <ToggleParam param="available" label={`Available now (${availableCount})`} />
        </div>
      </div>

      {pageItems.length === 0 ? (
        <EmptyState icon={UserSearch} title="No teachers match your filters" description="Try clearing a filter or searching by subject." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageItems.map((t) => (
            <TeacherCard key={t.id} teacher={t} status={availability.get(t.id)!.status} />
          ))}
        </div>
      )}
      <div className="mt-6">
        <Pagination page={page} pageCount={pageCount} total={total} />
      </div>
    </>
  );
}
