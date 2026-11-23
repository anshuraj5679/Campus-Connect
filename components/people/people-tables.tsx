import { Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { ApprovalButtons } from "./people-controls";
import type { PersonStatus, StudentRow, TeacherRow } from "@/lib/data/people";

const STATUS: Record<PersonStatus, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "bg-status-available-bg text-status-available-fg" },
  PENDING: { label: "Verification pending", cls: "bg-status-busy-bg text-status-busy-fg" },
  REJECTED: { label: "Rejected", cls: "bg-destructive/10 text-destructive" },
};

export function StatusBadge({ status }: { status: PersonStatus }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[status].cls)}>{STATUS[status].label}</span>;
}

function Contact({ email, phone }: { email: string; phone: string | null }) {
  return (
    <div className="space-y-0.5 text-sm">
      <a href={`mailto:${email}`} className="flex items-center gap-1.5 break-all hover:text-primary hover:underline"><Mail aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />{email}</a>
      {phone && <a href={`tel:${phone}`} className="flex items-center gap-1.5 hover:text-primary hover:underline"><Phone aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />{phone}</a>}
    </div>
  );
}

/**
 * Student list. `canDecide(row)` says whether the viewer may approve that student
 * (class teacher for their section; Cluster Head for sections without one).
 */
export function StudentTable({ rows, showSection, canDecide, waitingFor }: { rows: StudentRow[]; showSection?: boolean; canDecide: (r: StudentRow) => boolean; waitingFor?: (r: StudentRow) => string | null }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Student</th>
            <th className="px-4 py-2.5 font-semibold">USN</th>
            {showSection && <th className="px-4 py-2.5 font-semibold">Section</th>}
            <th className="px-4 py-2.5 font-semibold">Contact</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn("border-t align-top", r.status === "PENDING" && "bg-status-busy-bg/30")}>
              <td className="px-4 py-3">
                <p className="font-semibold">{r.fullName}</p>
                <p className="text-xs text-muted-foreground">Joined {fmtDate(r.joinedAt)} · Batch {r.batchYear}</p>
              </td>
              <td className="px-4 py-3 font-mono text-sm">{r.usn}</td>
              {showSection && <td className="px-4 py-3 font-semibold">{r.section}</td>}
              <td className="px-4 py-3"><Contact email={r.email} phone={r.phone} /></td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
                {r.status === "APPROVED" && r.verifiedBy && <p className="mt-1 text-xs text-muted-foreground">by {r.verifiedBy}</p>}
                {r.status === "PENDING" && !canDecide(r) && waitingFor?.(r) && <p className="mt-1 text-xs text-muted-foreground">Waiting for {waitingFor(r)}</p>}
              </td>
              <td className="px-4 py-3 text-right">{canDecide(r) && <ApprovalButtons userId={r.id} name={r.fullName} status={r.status} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { TEACHER: "Teacher", CLUSTER_HEAD: "Cluster Head", HOD: "HOD" };

export function TeacherTable({ rows, canDecide }: { rows: TeacherRow[]; canDecide: (r: TeacherRow) => boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Teacher</th>
            <th className="px-4 py-2.5 font-semibold">Employee ID</th>
            <th className="px-4 py-2.5 font-semibold">Contact</th>
            <th className="px-4 py-2.5 font-semibold">Class teacher of</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn("border-t align-top", r.status === "PENDING" && "bg-status-busy-bg/30")}>
              <td className="px-4 py-3">
                <p className="font-semibold">{r.fullName}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABEL[r.role] ?? r.role} · {r.designation}{r.cabin ? ` · Cabin ${r.cabin}` : ""}</p>
              </td>
              <td className="px-4 py-3 font-mono text-sm">{r.employeeId}</td>
              <td className="px-4 py-3"><Contact email={r.email} phone={r.phone} /></td>
              <td className="px-4 py-3">{r.classTeacherOf ? <span className="font-semibold">Section {r.classTeacherOf}</span> : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              <td className="px-4 py-3 text-right">{canDecide(r) && <ApprovalButtons userId={r.id} name={r.fullName} status={r.status} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
