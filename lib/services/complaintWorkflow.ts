/**
 * Complaint state machine (spec §3.5).
 *
 *   SUBMITTED → ASSIGNED → UNDER_REVIEW → ACTION_TAKEN → RESOLVED → CLOSED
 *                  ↘ ESCALATED (manual or SLA)        ↗      ↘ REOPENED (once, ≤ 7 days)
 *
 * allowedActions() is the single place that decides what a viewer may do;
 * the UI uses it to show buttons and the server actions re-check it.
 */
import type { HandlerLevel } from "./complaintRouting";

export type ComplaintStatus =
  | "SUBMITTED"
  | "ASSIGNED"
  | "UNDER_REVIEW"
  | "ACTION_TAKEN"
  | "RESOLVED"
  | "CLOSED"
  | "ESCALATED"
  | "REOPENED";

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  SUBMITTED: "Submitted",
  ASSIGNED: "Assigned",
  UNDER_REVIEW: "Under Review",
  ACTION_TAKEN: "Action Taken",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  ESCALATED: "Escalated",
  REOPENED: "Reopened",
};

export const OPEN_STATUSES: ComplaintStatus[] = ["SUBMITTED", "ASSIGNED", "UNDER_REVIEW", "ACTION_TAKEN", "ESCALATED", "REOPENED"];
/** Statuses in which the handler has not acted yet (SLA clock running). */
export const AWAITING_ACTION: ComplaintStatus[] = ["ASSIGNED", "ESCALATED", "REOPENED"];

export const REOPEN_WINDOW_DAYS = 7;
export const AUTO_CLOSE_DAYS = 7;
export const MAX_COMPLAINTS_PER_DAY = 3;
export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;

export type ComplaintAction =
  | "START_REVIEW"
  | "MARK_ACTION_TAKEN"
  | "RESOLVE"
  | "ESCALATE"
  | "REQUEST_RESPONSE"
  | "RESPOND"
  | "REOPEN"
  | "CLOSE"
  | "COMMENT"
  | "INTERNAL_NOTE";

export type WorkflowComplaint = {
  status: ComplaintStatus;
  studentId: string;
  teacherId: string | null;
  isConfidential: boolean;
  currentAssigneeId: string | null;
  assigneeLevel: HandlerLevel | null;
  responseRequestedFrom: string | null;
  resolvedAt: Date | null;
  reopenCount: number;
};

export type WorkflowViewer = {
  id: string;
  role: "STUDENT" | "TEACHER" | "CLUSTER_HEAD" | "HOD" | "ADMIN";
};

export function isOpen(status: ComplaintStatus) {
  return OPEN_STATUSES.includes(status);
}

export function canReopen(c: WorkflowComplaint, now: Date): boolean {
  if (c.status !== "RESOLVED" || !c.resolvedAt || c.reopenCount >= 1) return false;
  return now.getTime() - c.resolvedAt.getTime() <= REOPEN_WINDOW_DAYS * 86_400_000;
}

export function shouldAutoClose(c: Pick<WorkflowComplaint, "status" | "resolvedAt">, now: Date): boolean {
  return c.status === "RESOLVED" && !!c.resolvedAt && now.getTime() - c.resolvedAt.getTime() > AUTO_CLOSE_DAYS * 86_400_000;
}

/** Spec: un-acted complaints at Cluster Head level auto-escalate after the SLA. */
export function shouldAutoEscalate(
  c: Pick<WorkflowComplaint, "status" | "assigneeLevel"> & { slaDueAt: Date | null },
  now: Date,
): boolean {
  return (
    c.assigneeLevel === "CLUSTER_HEAD" &&
    AWAITING_ACTION.includes(c.status) &&
    !!c.slaDueAt &&
    c.slaDueAt.getTime() < now.getTime()
  );
}

export function allowedActions(c: WorkflowComplaint, viewer: WorkflowViewer, now: Date): Set<ComplaintAction> {
  const actions = new Set<ComplaintAction>();
  const open = isOpen(c.status);
  const isOwner = viewer.id === c.studentId;
  const isAssignee = viewer.id === c.currentAssigneeId;
  const isRequestedTeacher = !isAssignee && viewer.id === c.responseRequestedFrom && !c.isConfidential;
  const isStaffHandler = !isOwner && !isRequestedTeacher && ["CLUSTER_HEAD", "HOD", "ADMIN"].includes(viewer.role);

  if (isOwner) {
    if (c.status !== "CLOSED") actions.add("COMMENT");
    if (canReopen(c, now)) actions.add("REOPEN");
    if (c.status === "RESOLVED") actions.add("CLOSE");
    return actions;
  }

  if (isRequestedTeacher) {
    if (open) actions.add("RESPOND");
    return actions;
  }

  if (isAssignee && open) {
    if (AWAITING_ACTION.includes(c.status)) actions.add("START_REVIEW");
    if (c.status === "UNDER_REVIEW") actions.add("MARK_ACTION_TAKEN");
    actions.add("RESOLVE");
    if (c.assigneeLevel === "CLUSTER_HEAD" || c.assigneeLevel === "HOD") actions.add("ESCALATE");
    if (c.teacherId && !c.isConfidential && c.teacherId !== viewer.id) actions.add("REQUEST_RESPONSE");
    actions.add("COMMENT");
  }

  if ((isAssignee || isStaffHandler) && c.status !== "CLOSED") actions.add("INTERNAL_NOTE");
  return actions;
}

/** Status after an action, or null when the action does not change status. */
export function nextStatus(action: ComplaintAction, current: ComplaintStatus): ComplaintStatus | null {
  switch (action) {
    case "START_REVIEW":
      return "UNDER_REVIEW";
    case "REQUEST_RESPONSE":
      return AWAITING_ACTION.includes(current) ? "UNDER_REVIEW" : null;
    case "MARK_ACTION_TAKEN":
      return "ACTION_TAKEN";
    case "RESOLVE":
      return "RESOLVED";
    case "ESCALATE":
      return "ESCALATED";
    case "REOPEN":
      return "REOPENED";
    case "CLOSE":
      return "CLOSED";
    default:
      return null;
  }
}

/** Counts as "acted on" for the SLA clock. */
export function isHandlerAction(action: ComplaintAction) {
  return ["START_REVIEW", "MARK_ACTION_TAKEN", "RESOLVE", "REQUEST_RESPONSE", "COMMENT"].includes(action);
}

export type SlaState = { kind: "none" } | { kind: "met" } | { kind: "due"; ms: number } | { kind: "overdue"; ms: number };

export function slaState(
  c: { status: ComplaintStatus; slaDueAt: Date | null; firstActionAt: Date | null },
  now: Date,
): SlaState {
  if (!c.slaDueAt || !isOpen(c.status)) return { kind: "none" };
  if (!AWAITING_ACTION.includes(c.status)) return { kind: "met" };
  const ms = c.slaDueAt.getTime() - now.getTime();
  return ms >= 0 ? { kind: "due", ms } : { kind: "overdue", ms: -ms };
}
