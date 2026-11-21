import { AlarmClock, CircleCheck, ShieldExclamationPoint as ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, slaState, type ComplaintStatus } from "@/lib/services/complaintWorkflow";
import { durationLabel } from "@/lib/format";

const STATUS_STYLE: Record<ComplaintStatus, string> = {
  SUBMITTED: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200",
  ASSIGNED: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200",
  UNDER_REVIEW: "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200",
  ACTION_TAKEN: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-200",
  RESOLVED: "bg-green-50 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200",
  CLOSED: "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-700 dark:text-slate-100",
  ESCALATED: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200",
  REOPENED: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200",
};

export function ComplaintStatusBadge({ status, className }: { status: ComplaintStatus; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap", STATUS_STYLE[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** SLA countdown: "Due in 2 days" / "Overdue by 1 day" / "Responded". */
export function SlaChip({ status, slaDueAt, firstActionAt, now }: { status: ComplaintStatus; slaDueAt: Date | null; firstActionAt: Date | null; now: Date }) {
  const s = slaState({ status, slaDueAt, firstActionAt }, now);
  if (s.kind === "none") return null;
  if (s.kind === "met")
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-status-available-bg px-2.5 text-xs font-semibold text-status-available-fg">
        <CircleCheck aria-hidden className="size-3.5" /> SLA met
      </span>
    );
  const overdue = s.kind === "overdue";
  const soon = !overdue && s.ms < 86_400_000;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        overdue ? "bg-status-leave text-white" : soon ? "bg-status-busy-bg text-status-busy-fg" : "bg-muted text-foreground",
      )}
      title={slaDueAt ? `First action due ${slaDueAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : undefined}
    >
      <AlarmClock aria-hidden className="size-3.5" />
      {overdue ? `Overdue by ${durationLabel(s.ms)}` : `Due in ${durationLabel(s.ms)}`}
    </span>
  );
}

export function ConfidentialBadge() {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full border border-maroon/30 bg-maroon/10 px-2.5 text-xs font-semibold text-maroon">
      <ShieldAlert aria-hidden className="size-3.5" /> Confidential
    </span>
  );
}
