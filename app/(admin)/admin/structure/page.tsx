import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Landmark, Network, UserRound } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/kit";
import { AddClusterForm, AddDepartmentForm, AddSectionForm, AssignHeadSelect, DeleteStructureButton, MoveTeacherSelect } from "@/components/admin/controls";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Departments & Clusters" };

export default async function AdminStructurePage() {
  await requireRole(["ADMIN"]);
  const db = createAdminClient();
  const [{ data: depts }, { data: clusters }, { data: sections }, { data: teachers }, { data: students }] = await Promise.all([
    db.from("departments").select("id, code, name, hod_id").order("code"),
    db.from("clusters").select("id, name, department_id, cluster_head_id").order("name"),
    db.from("sections").select("id, name, cluster_id, department_id, home_room").order("name"),
    db.from("teacher_profiles").select("user_id, department_id, cluster_id, designation, profiles!inner(full_name, role)"),
    db.from("student_profiles").select("section_id"),
  ]);
  const studentCount = new Map<string, number>();
  (students ?? []).forEach((s) => studentCount.set(s.section_id, (studentCount.get(s.section_id) ?? 0) + 1));
  const T = (teachers ?? []).map((t: any) => ({ id: t.user_id as string, name: t.profiles.full_name as string, role: t.profiles.role as string, departmentId: t.department_id as string, clusterId: t.cluster_id as string | null, designation: t.designation as string }));

  return (
    <>
      <PageHeader title="Departments & Clusters" description="Department → Clusters → Sections & Teachers. Appoint one HOD per department and one Cluster Head per cluster." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Departments & Clusters" }]} />
      <SectionCard title="Add department" icon={Landmark} className="mb-5"><AddDepartmentForm /></SectionCard>

      <div className="space-y-4">
        {(depts ?? []).map((d) => {
          const dClusters = (clusters ?? []).filter((c) => c.department_id === d.id);
          const dTeachers = T.filter((t) => t.departmentId === d.id).sort((a, b) => a.name.localeCompare(b.name));
          const hodName = dTeachers.find((t) => t.id === d.hod_id)?.name;
          return (
            <details key={d.id} open={d.code === "CSE"} className="group rounded-xl border bg-card shadow-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
                <span className="flex items-center gap-3">
                  <ChevronRight aria-hidden className="size-5 transition-transform group-open:rotate-90" />
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{d.code}</span>
                  <span>
                    <span className="block font-semibold">{d.name}</span>
                    <span className="block text-sm text-muted-foreground">{dClusters.length} clusters · {dTeachers.length} teachers · HOD: {hodName ?? <em>vacant</em>}</span>
                  </span>
                </span>
              </summary>
              <div className="space-y-4 border-t px-5 py-4">
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3">
                  <span className="text-sm font-semibold">Head of Department</span>
                  <AssignHeadSelect kind="hod" targetId={d.id} currentId={d.hod_id} options={dTeachers.map((t) => ({ id: t.id, name: `${t.name} · ${t.designation}` }))} />
                  <div className="ml-auto"><AddClusterForm departmentId={d.id} /></div>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {dClusters.map((c) => {
                    const members = dTeachers.filter((t) => t.clusterId === c.id);
                    const cSections = (sections ?? []).filter((s) => s.cluster_id === c.id);
                    return (
                      <div key={c.id} className="rounded-xl border p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-2 font-semibold"><Network aria-hidden className="size-4 text-primary" /> {c.name}</p>
                          <DeleteStructureButton kind="cluster" id={c.id} label={c.name} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-sm text-muted-foreground">Cluster Head</span>
                          <AssignHeadSelect kind="cluster" targetId={c.id} currentId={c.cluster_head_id} options={dTeachers.filter((t) => t.id !== d.hod_id).map((t) => ({ id: t.id, name: t.name }))} />
                        </div>
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase">Sections</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {cSections.map((s) => (
                              <span key={s.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2.5 text-xs font-semibold">
                                {s.name}{s.home_room ? ` · ${s.home_room}` : ""} <span className="font-normal text-muted-foreground">({studentCount.get(s.id) ?? 0})</span>
                                <DeleteStructureButton kind="section" id={s.id} label={`section ${s.name}`} />
                              </span>
                            ))}
                          </div>
                          <div className="mt-2"><AddSectionForm departmentId={d.id} clusterId={c.id} /></div>
                        </div>
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase">Teachers ({members.length})</p>
                          <ul className="divide-y rounded-lg border">
                            {members.map((t) => (
                              <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                <Link href={`/teachers/${t.id}`} className="flex min-w-0 items-center gap-2 hover:text-primary">
                                  <UserRound aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{t.name}</span>
                                  {t.id === c.cluster_head_id && <span className="shrink-0 rounded bg-maroon/10 px-1.5 text-xs font-semibold text-maroon">CH</span>}
                                </Link>
                                <MoveTeacherSelect teacherId={t.id} clusterId={t.clusterId} clusters={dClusters.map((x) => ({ id: x.id, name: x.name }))} />
                              </li>
                            ))}
                            {members.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No teachers.</li>}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {dTeachers.some((t) => !t.clusterId && t.id !== d.hod_id) && (
                  <div className="rounded-lg border border-dashed p-3">
                    <p className="mb-2 text-sm font-semibold">Teachers without a cluster</p>
                    <ul className="space-y-1.5">
                      {dTeachers.filter((t) => !t.clusterId && t.id !== d.hod_id).map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                          {t.name}
                          <MoveTeacherSelect teacherId={t.id} clusterId={null} clusters={dClusters.map((x) => ({ id: x.id, name: x.name }))} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
