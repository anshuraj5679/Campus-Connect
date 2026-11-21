import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PersonAvatar } from "@/components/shared/kit";
import { FilterChips, FilterSelect, Pagination, SearchBox } from "@/components/shared/url-controls";
import { UserRowControls } from "@/components/admin/controls";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { ROLE_LABEL, isRole } from "@/lib/auth/roles";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Users" };
const PAGE = 15;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; verified?: string; page?: string }> }) {
  const me = await requireRole(["ADMIN"]);
  const sp = await searchParams;
  const db = createAdminClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = db.from("profiles").select("id, full_name, email, role, is_active, is_verified, created_at, student_profiles(usn, section), teacher_profiles(employee_id, departments(code))", { count: "exact" }).order("created_at", { ascending: false });
  if (sp.role && isRole(sp.role)) q = q.eq("role", sp.role);
  if (sp.verified === "0") q = q.eq("is_verified", false);
  if (sp.verified === "1") q = q.eq("is_verified", true);
  if (sp.q) q = q.or(`full_name.ilike.%${sp.q.replace(/[%,()]/g, "")}%,email.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);
  const { data, count } = await q.range((page - 1) * PAGE, page * PAGE - 1);

  return (
    <>
      <PageHeader title="Users" description="Verify new sign-ups, activate or deactivate accounts and change roles." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Users" }]} />
      <div className="mb-4 space-y-3 rounded-xl border bg-card p-4 shadow-card">
        <SearchBox placeholder="Search by name or email…" />
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips param="role" options={(["STUDENT", "TEACHER", "CLUSTER_HEAD", "HOD", "ADMIN"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          <FilterSelect param="verified" label="Verification" options={[{ value: "0", label: "Pending" }, { value: "1", label: "Verified" }]} />
        </div>
      </div>
      {!data?.length ? (
        <EmptyState icon={Users} title="No users match these filters" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
          {data.map((u: any) => {
            const sp1 = Array.isArray(u.student_profiles) ? u.student_profiles[0] : u.student_profiles;
            const tp = Array.isArray(u.teacher_profiles) ? u.teacher_profiles[0] : u.teacher_profiles;
            return (
              <li key={u.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <PersonAvatar name={u.full_name} className="size-10" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {u.full_name}
                      {!u.is_active && <span className="ml-2 rounded bg-status-leave-bg px-1.5 text-xs text-status-leave-fg">Inactive</span>}
                      {!u.is_verified && <span className="ml-2 rounded bg-status-busy-bg px-1.5 text-xs text-status-busy-fg">Pending</span>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {u.email} · {isRole(u.role) ? ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] : u.role}
                      {sp1 && ` · ${sp1.usn} · ${sp1.section}`}
                      {tp && ` · ${tp.employee_id} · ${tp.departments?.code ?? ""}`}
                    </p>
                    <p className="text-xs text-muted-foreground">Joined {fmtDate(u.created_at)}</p>
                  </div>
                </div>
                <UserRowControls userId={u.id} role={u.role} isActive={u.is_active} isVerified={u.is_verified} isSelf={u.id === me.id} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5"><Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / PAGE))} total={count ?? 0} /></div>
    </>
  );
}
