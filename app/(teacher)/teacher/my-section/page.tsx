import type { Metadata } from "next";
import { GraduationCap, Hourglass, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kit";
import { FilterChips, SearchBox } from "@/components/shared/url-controls";
import { StudentTable } from "@/components/people/people-tables";
import { getViewer } from "@/lib/data/viewer";
import { loadSectionStudents } from "@/lib/data/people";

export const metadata: Metadata = { title: "My Section" };

/** Class teacher's view: only the students of their own section. */
export default async function MySectionPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const mine = viewer.classTeacherOf;
  if (!mine) {
    return (
      <>
        <PageHeader title="My Section" breadcrumbs={[{ label: "My Dashboard", href: "/teacher" }, { label: "My Section" }]} />
        <EmptyState icon={Users} title="You are not a class teacher yet" description="Your Cluster Head assigns a class teacher to each section. Once you are assigned, your section's students and their approvals appear here." />
      </>
    );
  }
  const students = await loadSectionStudents(mine.sectionId);
  const q = (sp.q ?? "").trim().toLowerCase();
  const shown = students.filter((s) => (!sp.status || s.status === sp.status) && (!q || s.fullName.toLowerCase().includes(q) || s.usn.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)));
  const pending = students.filter((s) => s.status === "PENDING").length;

  return (
    <>
      <PageHeader
        title={`Section ${mine.name}`}
        description="You are the class teacher. New students of this section appear here as “verification pending” until you approve them."
        breadcrumbs={[{ label: "My Dashboard", href: "/teacher" }, { label: "My Section" }]}
      />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Students" value={students.filter((s) => s.status === "APPROVED").length} icon={GraduationCap} tone="navy" />
        <KpiCard label="Waiting for your approval" value={pending} icon={Hourglass} tone={pending ? "amber" : "slate"} href="/teacher/my-section?status=PENDING" />
        <KpiCard label="Rejected" value={students.filter((s) => s.status === "REJECTED").length} icon={Users} tone="slate" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search name, USN or email…" className="w-full sm:w-72" />
        <FilterChips param="status" options={[{ value: "PENDING", label: "Pending", count: pending }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }]} />
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={GraduationCap} title={students.length ? "No students match" : "No students have joined this section yet"} description={students.length ? undefined : "Students choose their section when they sign up."} />
      ) : (
        <StudentTable rows={shown} canDecide={() => true} />
      )}
    </>
  );
}
