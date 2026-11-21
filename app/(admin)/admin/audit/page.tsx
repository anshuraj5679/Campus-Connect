import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterSelect, Pagination, SearchBox } from "@/components/shared/url-controls";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit Log" };
const PAGE = 25;
const ENTITIES = ["complaints", "teacher_unavailability", "timetable_versions", "announcements", "profiles", "departments", "clusters", "sections", "holidays", "period_slots", "college_settings", "students", "teachers", "timetables"];

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string; page?: string }> }) {
  await requireRole(["ADMIN"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  let q = createAdminClient().from("audit_logs").select("id, action, entity, entity_id, meta, created_at, profiles(full_name)", { count: "exact" }).order("created_at", { ascending: false });
  if (sp.entity) q = q.eq("entity", sp.entity);
  if (sp.q) q = q.ilike("action", `%${sp.q.replace(/[%,]/g, "").toUpperCase().replace(/\s+/g, "_")}%`);
  const { data, count } = await q.range((page - 1) * PAGE, page * PAGE - 1);

  return (
    <>
      <PageHeader title="Audit log" description="Every administrative and workflow action, newest first. Entries cannot be edited." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Audit Log" }]} />
      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card md:flex-row">
        <SearchBox placeholder="Search action, e.g. complaint resolve" className="flex-1" />
        <FilterSelect param="entity" label="Entity" options={ENTITIES.map((e) => ({ value: e, label: e.replaceAll("_", " ") }))} />
      </div>
      {!data?.length ? (
        <EmptyState icon={ScrollText} title="No audit entries" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card" role="region" aria-label="Audit log entries (scrollable)" tabIndex={0}>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground uppercase">
              <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3">Details</th></tr>
            </thead>
            <tbody className="divide-y">
              {data.map((a: any) => (
                <tr key={a.id} className="align-top hover:bg-muted/40">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">{fmtDateTime(a.created_at)}</td>
                  <td className="px-4 py-2.5">{a.profiles?.full_name ?? <span className="text-muted-foreground">System</span>}</td>
                  <td className="px-4 py-2.5 font-medium">{a.action.replaceAll("_", " ").toLowerCase()}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.entity}</td>
                  <td className="max-w-sm px-4 py-2.5"><code className="line-clamp-2 text-xs break-all text-muted-foreground">{Object.keys(a.meta ?? {}).length ? JSON.stringify(a.meta) : "—"}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-5"><Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / PAGE))} total={count ?? 0} /></div>
    </>
  );
}
