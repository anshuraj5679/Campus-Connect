import type { Metadata } from "next";
import { GraduationCap, Hourglass, UserCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard, SectionCard } from "@/components/shared/kit";
import { FilterChips, SearchBox } from "@/components/shared/url-controls";
import { StudentTable, TeacherTable } from "@/components/people/people-tables";
import { ClassTeacherSelect } from "@/components/people/people-controls";
import { getViewer } from "@/lib/data/viewer";
import { loadClusterPeople } from "@/lib/data/people";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Students & Teachers" };

export default async function ClusterPeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; section?: string; status?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const clusterId = viewer.clusterHeadOf[0];
  if (!clusterId) return <EmptyState icon={Users} title="You are not assigned to a cluster yet" />;

  const [{ sections, teachers, students }, { data: cluster }] = await Promise.all([
    loadClusterPeople(clusterId),
    createAdminClient().from("clusters").select("name, departments(code)").eq("id", clusterId).single(),
  ]);
  const clusterLabel = `${(cluster as any)?.departments?.code ?? ""} ${cluster?.name ?? ""}`.trim();
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  // Students: the Cluster Head approves only in sections that have no class teacher yet.
  const canDecideStudent = (sectionId: string) => !sectionById.get(sectionId)?.classTeacherId || sectionById.get(sectionId)?.classTeacherId === viewer.id;
  const q = (sp.q ?? "").trim().toLowerCase();
  const shown = students.filter(
    (s) =>
      (!sp.section || s.section === sp.section) &&
      (!sp.status || s.status === sp.status) &&
      (!q || s.fullName.toLowerCase().includes(q) || s.usn.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)),
  );
  const pendingTeachers = teachers.filter((t) => t.status === "PENDING").length;
  const pendingStudents = students.filter((s) => s.status === "PENDING").length;
  const mineToApprove = students.filter((s) => s.status === "PENDING" && canDecideStudent(s.sectionId)).length;
  const approvedTeachers = teachers.filter((t) => t.status === "APPROVED");

  return (
    <>
      <PageHeader
        title="Students & Teachers"
        description={`${clusterLabel} · approve new teachers, assign a class teacher to each section, and see every student's details.`}
        breadcrumbs={[{ label: "Cluster Overview", href: "/cluster-head" }, { label: "Students & Teachers" }]}
      />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Students" value={students.filter((s) => s.status === "APPROVED").length} icon={GraduationCap} tone="navy" hint={`${sections.length} section${sections.length === 1 ? "" : "s"}`} />
        <KpiCard label="Students pending" value={pendingStudents} icon={Hourglass} tone={pendingStudents ? "amber" : "slate"} hint={mineToApprove ? `${mineToApprove} waiting for you` : "approved by class teachers"} href="/cluster-head/people?status=PENDING#students" />
        <KpiCard label="Teachers" value={approvedTeachers.length} icon={Users} tone="blue" />
        <KpiCard label="Teachers pending" value={pendingTeachers} icon={UserCheck} tone={pendingTeachers ? "amber" : "slate"} hint="you approve these" href="#teachers" />
      </div>

      <SectionCard title="Sections & class teachers" icon={GraduationCap} description="Each section's class teacher approves its new students. Until one is assigned, you approve them." className="mb-5" bodyClassName="p-0">
        {sections.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No sections yet. They are added when students sign up, or from Section Routines.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Section</th>
                  <th className="px-5 py-2.5 font-semibold">Class teacher</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Students</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Pending</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-5 py-3"><p className="font-bold">Section {s.name}</p><p className="text-xs text-muted-foreground">Semester {s.semester}</p></td>
                    <td className="px-5 py-3">
                      <ClassTeacherSelect
                        sectionId={s.id}
                        sectionName={s.name}
                        currentId={s.classTeacherId}
                        options={approvedTeachers.map((t) => ({ id: t.id, name: t.fullName, busyWith: t.classTeacherOf && t.classTeacherOf !== s.name ? `Section ${t.classTeacherOf}` : null }))}
                      />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.students}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.pending ? <span className="font-semibold text-status-busy-fg">{s.pending}</span> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {approvedTeachers.length === 0 && <p className="border-t px-5 py-3 text-sm text-muted-foreground">Approve teachers below first; then you can make them class teachers.</p>}
          </div>
        )}
      </SectionCard>

      <section id="teachers" className="mb-6 scroll-mt-20">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Users aria-hidden className="size-5 text-primary" /> Cluster teachers <span className="text-sm font-normal text-muted-foreground">({teachers.length})</span></h2>
        {teachers.length === 0 ? (
          <EmptyState icon={Users} title="No teachers in your cluster yet" description="Teachers who sign up for your cluster appear here for your approval." className="py-8" />
        ) : (
          <TeacherTable rows={teachers} canDecide={(t) => t.role === "TEACHER" && t.id !== viewer.id} />
        )}
      </section>

      <section id="students" className="scroll-mt-20">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><GraduationCap aria-hidden className="size-5 text-primary" /> Students <span className="text-sm font-normal text-muted-foreground">({shown.length} of {students.length})</span></h2>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SearchBox placeholder="Search name, USN or email…" className="w-full sm:w-72" />
          <FilterChips param="section" options={sections.map((s) => ({ value: s.name, label: `Section ${s.name}`, count: s.students }))} />
          <FilterChips param="status" options={[{ value: "PENDING", label: "Pending", count: pendingStudents }]} />
        </div>
        {shown.length === 0 ? (
          <EmptyState icon={GraduationCap} title={students.length ? "No students match" : "No students in your cluster yet"} className="py-8" />
        ) : (
          <StudentTable
            rows={shown}
            showSection
            canDecide={(s) => canDecideStudent(s.sectionId)}
            waitingFor={(s) => {
              const sec = sectionById.get(s.sectionId);
              return sec?.classTeacherName ? `class teacher ${sec.classTeacherName}` : null;
            }}
          />
        )}
      </section>
    </>
  );
}
