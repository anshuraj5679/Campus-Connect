import Link from "next/link";
import { Inbox, ShieldExclamationPoint as ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterChips, FilterSelect, Pagination, SearchBox, ToggleParam } from "@/components/shared/url-controls";
import { ComplaintStatusBadge, SlaChip } from "./badges";
import { CATEGORY_LABEL } from "@/lib/services/complaintRouting";
import { OPEN_STATUSES, STATUS_LABEL, slaState, type ComplaintStatus } from "@/lib/services/complaintWorkflow";
import type { ComplaintRow } from "@/lib/data/complaints";
import { fmtDate, relativeTime } from "@/lib/format";

export type TableParams = { q?: string; status?: string; category?: string; overdue?: string; page?: string; mine?: string };

const PAGE_SIZE = 10;

export function filterComplaints(rows: ComplaintRow[], sp: TableParams, now: Date, viewerName?: string) {
  const q = (sp.q ?? "").toLowerCase();
  return rows.filter((r) => {
    if (sp.status === "OPEN" && !OPEN_STATUSES.includes(r.status)) return false;
    if (sp.status && sp.status !== "OPEN" && r.status !== sp.status) return false;
    if (sp.category && r.category !== sp.category) return false;
    if (sp.overdue === "1" && slaState(r, now).kind !== "overdue") return false;
    if (sp.mine === "1" && viewerName && r.assigneeName !== viewerName) return false;
    if (q && ![r.code, r.subject, r.studentName, r.teacherName ?? "", r.assigneeName ?? ""].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Handler complaints table with search, status chips, category filter, SLA toggle and pagination. */
export function ComplaintsTable({
  rows,
  sp,
  now,
  showAssignee = true,
  showStudent = true,
  emptyText = "No complaints match these filters.",
}: {
  rows: ComplaintRow[];
  sp: TableParams;
  now: Date;
  showAssignee?: boolean;
  showStudent?: boolean;
  emptyText?: string;
}) {
  const filtered = filterComplaints(rows, sp, now);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pageCount);
  const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const count = (s: ComplaintStatus | "OPEN") => rows.filter((r) => (s === "OPEN" ? OPEN_STATUSES.includes(r.status) : r.status === s)).length;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
        <SearchBox placeholder="Search by ID, subject, student or teacher…" />
        <FilterChips
          param="status"
          options={[
            { value: "OPEN", label: "Open", count: count("OPEN") },
            ...(["ASSIGNED", "UNDER_REVIEW", "ESCALATED", "REOPENED", "RESOLVED", "CLOSED"] as ComplaintStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s], count: count(s) })),
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <FilterSelect param="category" label="Category" options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
          <ToggleParam param="overdue" label="Overdue SLA only" />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Inbox} title={emptyText} description="Try clearing the filters." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          {/* Desktop table */}
          <table className="hidden w-full text-sm md:table">
            <thead className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">Complaint</th>
                {showStudent && <th scope="col" className="px-4 py-3">Raised by</th>}
                {showAssignee && <th scope="col" className="px-4 py-3">With</th>}
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">SLA</th>
                <th scope="col" className="px-4 py-3 text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="max-w-md px-4 py-3">
                    <Link href={`/complaints/${r.code}`} className="font-semibold text-primary hover:underline">{r.code}</Link>
                    {r.isConfidential && <ShieldAlert aria-label="Confidential" className="ml-1.5 inline size-4 text-maroon" />}
                    <p className="line-clamp-1 font-medium">{r.subject}</p>
                    <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[r.category]}{r.teacherName ? ` · about ${r.teacherName}` : ""}</p>
                  </td>
                  {showStudent && <td className="px-4 py-3">{r.studentName}</td>}
                  {showAssignee && <td className="px-4 py-3">{r.assigneeName ?? "—"}</td>}
                  <td className="px-4 py-3"><ComplaintStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3"><SlaChip status={r.status} slaDueAt={r.slaDueAt} firstActionAt={r.firstActionAt} now={now} /></td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums" title={fmtDate(r.updatedAt)}>{relativeTime(r.updatedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <ul className="divide-y md:hidden">
            {items.map((r) => (
              <li key={r.id}>
                <Link href={`/complaints/${r.code}`} className="block space-y-1.5 p-4 hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary">{r.code}</span>
                    <ComplaintStatusBadge status={r.status} />
                  </div>
                  <p className="font-medium">{r.subject}</p>
                  <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[r.category]} · {showStudent ? r.studentName : r.assigneeName}</p>
                  <SlaChip status={r.status} slaDueAt={r.slaDueAt} firstActionAt={r.firstActionAt} now={now} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} total={filtered.length} />
    </div>
  );
}
