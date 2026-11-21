import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, BadgeCheck, Clock, FileUp, GraduationCap, Inbox, Landmark, Presentation, ScrollText, Settings } from "lucide-react";
import { HeroBanner, KpiCard, SectionCard } from "@/components/shared/kit";
import { UrgentComplaints } from "@/components/dashboards/panels";
import { RunJobsButton } from "@/components/admin/controls";
import { getViewer } from "@/lib/data/viewer";
import { listComplaints } from "@/lib/data/complaints";
import { complaintKpis } from "@/lib/data/dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatLongDate, getNow, greetingFor } from "@/lib/datetime";
import { firstName, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin Overview" };

export default async function AdminDashboardPage() {
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const db = createAdminClient();
  const [d, t, s, pending, complaints, { data: audit }] = await Promise.all([
    db.from("departments").select("id", { count: "exact", head: true }),
    db.from("teacher_profiles").select("user_id", { count: "exact", head: true }),
    db.from("student_profiles").select("user_id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("is_verified", false),
    listComplaints(viewer, { scope: "handler" }),
    db.from("audit_logs").select("id, action, entity, created_at, profiles(full_name)").order("created_at", { ascending: false }).limit(8),
  ]);
  const mine = complaints.filter((c) => c.assigneeId === viewer.id);
  const kpi = complaintKpis(mine, now);

  const links = [
    { href: "/admin/structure", label: "Departments & Clusters", icon: Landmark },
    { href: "/admin/import", label: "Bulk import", icon: FileUp },
    { href: "/admin/periods", label: "Period slots", icon: Clock },
    { href: "/admin/settings", label: "College settings", icon: Settings },
  ];

  return (
    <>
      <HeroBanner eyebrow={formatLongDate(now)} title={`${greetingFor(now)}, ${firstName(viewer.fullName)}`} subtitle="College administration">
        <RunJobsButton className="border-white bg-white text-primary hover:bg-white/90 hover:text-primary dark:border-border dark:bg-card dark:text-foreground" />
      </HeroBanner>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Departments" value={d.count ?? 0} icon={Landmark} href="/admin/structure" />
        <KpiCard label="Teachers" value={t.count ?? 0} icon={Presentation} tone="blue" href="/admin/users?role=TEACHER" />
        <KpiCard label="Students" value={s.count ?? 0} icon={GraduationCap} tone="green" href="/admin/users?role=STUDENT" />
        <KpiCard label="Pending verifications" value={pending.count ?? 0} icon={BadgeCheck} tone={(pending.count ?? 0) > 0 ? "amber" : "slate"} href="/admin/users?verified=0" />
      </div>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard label="Complaints assigned to admin (open)" value={kpi.open} icon={Inbox} tone="blue" href="/admin/complaints?status=OPEN" />
        <KpiCard label="Overdue SLA" value={kpi.overdue} icon={AlarmClock} tone={kpi.overdue ? "red" : "slate"} href="/admin/complaints?overdue=1" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <UrgentComplaints rows={mine} now={now} href="/admin/complaints" className="lg:col-span-2" />
        <div className="space-y-5">
          <SectionCard title="Quick links" icon={Settings}>
            <ul className="grid grid-cols-2 gap-2">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex flex-col items-start gap-2 rounded-lg border p-3 text-sm font-medium hover:border-primary/40 hover:bg-accent/40">
                    <l.icon aria-hidden className="size-5 text-primary" /> {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Recent activity" icon={ScrollText} action={{ label: "Audit log", href: "/admin/audit" }}>
            <ul className="space-y-2.5 text-sm">
              {(audit ?? []).map((a: any) => (
                <li key={a.id}>
                  <span className="font-medium">{a.action.replaceAll("_", " ").toLowerCase()}</span>
                  <span className="block text-xs text-muted-foreground">{a.profiles?.full_name ?? "System"} · {relativeTime(a.created_at, now)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
