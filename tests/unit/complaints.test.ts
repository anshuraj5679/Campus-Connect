import { describe, expect, it } from "vitest";
import { escalationTarget, routeComplaint, RoutingError, type RoutingDirectory } from "@/lib/services/complaintRouting";
import {
  allowedActions,
  canReopen,
  nextStatus,
  shouldAutoClose,
  shouldAutoEscalate,
  slaState,
  type WorkflowComplaint,
} from "@/lib/services/complaintWorkflow";
import { canViewComplaint, shouldMaskStudent, type AccessComplaint, type AccessViewer } from "@/lib/services/complaintAccess";
import { addWorkingDays, istDateTime, type CalendarSettings } from "@/lib/services/time";

const dir: RoutingDirectory = {
  clusterHeadOf: (c) => ({ c1: "ch1", c2: "ch2" })[c] ?? null,
  hodOf: (d) => ({ cse: "hod-cse" })[d] ?? null,
  adminId: "admin",
};
const student = { departmentId: "cse", clusterId: "c1" };

describe("routeComplaint", () => {
  it("against a teacher → Cluster Head of the TEACHER's cluster", () => {
    const r = routeComplaint({ category: "TEACHER", isConfidential: false, student, teacher: { id: "t9", departmentId: "cse", clusterId: "c2" } }, dir);
    expect(r).toMatchObject({ assigneeId: "ch2", level: "CLUSTER_HEAD", clusterId: "c2" });
  });

  it("against the Cluster Head → HOD", () => {
    const r = routeComplaint({ category: "TEACHER", isConfidential: false, student, teacher: { id: "ch2", departmentId: "cse", clusterId: "c2" } }, dir);
    expect(r).toMatchObject({ assigneeId: "hod-cse", level: "HOD" });
  });

  it("against the HOD → Admin", () => {
    const r = routeComplaint({ category: "TEACHER", isConfidential: false, student, teacher: { id: "hod-cse", departmentId: "cse", clusterId: null } }, dir);
    expect(r).toMatchObject({ assigneeId: "admin", level: "ADMIN" });
  });

  it("academic → student's Cluster Head; department → HOD", () => {
    expect(routeComplaint({ category: "ACADEMIC", isConfidential: false, student }, dir).assigneeId).toBe("ch1");
    expect(routeComplaint({ category: "DEPARTMENT", isConfidential: false, student }, dir).assigneeId).toBe("hod-cse");
  });

  it("facility and college-wide → Admin", () => {
    expect(routeComplaint({ category: "FACILITY", isConfidential: false, student }, dir).level).toBe("ADMIN");
    expect(routeComplaint({ category: "COLLEGE", isConfidential: false, student }, dir).level).toBe("ADMIN");
  });

  it("confidential (category or toggle) → HOD directly, flagged confidential", () => {
    const a = routeComplaint({ category: "CONFIDENTIAL", isConfidential: false, student }, dir);
    expect(a).toMatchObject({ assigneeId: "hod-cse", level: "HOD", isConfidential: true });
    const b = routeComplaint({ category: "TEACHER", isConfidential: true, student, teacher: { id: "t9", departmentId: "cse", clusterId: "c2" } }, dir);
    expect(b).toMatchObject({ assigneeId: "hod-cse", isConfidential: true });
  });

  it("falls back when an office is vacant", () => {
    const r = routeComplaint({ category: "ACADEMIC", isConfidential: false, student: { departmentId: "cse", clusterId: "c3" } }, dir);
    expect(r.assigneeId).toBe("hod-cse");
    const r2 = routeComplaint({ category: "DEPARTMENT", isConfidential: false, student: { departmentId: "ece", clusterId: "x" } }, dir);
    expect(r2.assigneeId).toBe("admin");
  });

  it("requires a teacher for teacher complaints", () => {
    expect(() => routeComplaint({ category: "TEACHER", isConfidential: false, student }, dir)).toThrow(RoutingError);
  });

  it("escalation goes CH → HOD → Admin, skipping an accused HOD", () => {
    expect(escalationTarget("CLUSTER_HEAD", { departmentId: "cse", teacherId: "t1" }, dir)).toEqual({ assigneeId: "hod-cse", level: "HOD" });
    expect(escalationTarget("CLUSTER_HEAD", { departmentId: "cse", teacherId: "hod-cse" }, dir)).toEqual({ assigneeId: "admin", level: "ADMIN" });
    expect(escalationTarget("HOD", { departmentId: "cse", teacherId: null }, dir)).toEqual({ assigneeId: "admin", level: "ADMIN" });
    expect(escalationTarget("ADMIN", { departmentId: "cse", teacherId: null }, dir)).toBeNull();
  });
});

const base: WorkflowComplaint = {
  status: "ASSIGNED",
  studentId: "s1",
  teacherId: "t1",
  isConfidential: false,
  currentAssigneeId: "ch1",
  assigneeLevel: "CLUSTER_HEAD",
  responseRequestedFrom: null,
  resolvedAt: null,
  reopenCount: 0,
};
const now = new Date("2026-11-23T06:00:00Z");

describe("complaint workflow", () => {
  it("assignee can review, request response, escalate and resolve", () => {
    const a = allowedActions(base, { id: "ch1", role: "CLUSTER_HEAD" }, now);
    expect([...a]).toEqual(expect.arrayContaining(["START_REVIEW", "REQUEST_RESPONSE", "ESCALATE", "RESOLVE", "INTERNAL_NOTE"]));
  });

  it("requested teacher can only respond (never change status)", () => {
    const a = allowedActions({ ...base, responseRequestedFrom: "t1", status: "UNDER_REVIEW" }, { id: "t1", role: "TEACHER" }, now);
    expect([...a]).toEqual(["RESPOND"]);
  });

  it("teacher cannot respond to a confidential complaint", () => {
    const a = allowedActions({ ...base, isConfidential: true, responseRequestedFrom: "t1" }, { id: "t1", role: "TEACHER" }, now);
    expect(a.size).toBe(0);
  });

  it("student can reopen once within 7 days of resolution", () => {
    const resolved = { ...base, status: "RESOLVED" as const, resolvedAt: new Date(now.getTime() - 3 * 86_400_000) };
    expect(canReopen(resolved, now)).toBe(true);
    expect(allowedActions(resolved, { id: "s1", role: "STUDENT" }, now).has("REOPEN")).toBe(true);
    expect(canReopen({ ...resolved, reopenCount: 1 }, now)).toBe(false);
    expect(canReopen({ ...resolved, resolvedAt: new Date(now.getTime() - 8 * 86_400_000) }, now)).toBe(false);
  });

  it("auto-closes 7 days after resolution", () => {
    expect(shouldAutoClose({ status: "RESOLVED", resolvedAt: new Date(now.getTime() - 8 * 86_400_000) }, now)).toBe(true);
    expect(shouldAutoClose({ status: "RESOLVED", resolvedAt: new Date(now.getTime() - 2 * 86_400_000) }, now)).toBe(false);
  });

  it("auto-escalates only un-acted Cluster Head complaints past SLA", () => {
    const due = new Date(now.getTime() - 1000);
    expect(shouldAutoEscalate({ status: "ASSIGNED", assigneeLevel: "CLUSTER_HEAD", slaDueAt: due }, now)).toBe(true);
    expect(shouldAutoEscalate({ status: "UNDER_REVIEW", assigneeLevel: "CLUSTER_HEAD", slaDueAt: due }, now)).toBe(false);
    expect(shouldAutoEscalate({ status: "ASSIGNED", assigneeLevel: "HOD", slaDueAt: due }, now)).toBe(false);
  });

  it("maps actions to statuses", () => {
    expect(nextStatus("START_REVIEW", "ASSIGNED")).toBe("UNDER_REVIEW");
    expect(nextStatus("REQUEST_RESPONSE", "ASSIGNED")).toBe("UNDER_REVIEW");
    expect(nextStatus("REQUEST_RESPONSE", "ACTION_TAKEN")).toBeNull();
    expect(nextStatus("REOPEN", "RESOLVED")).toBe("REOPENED");
  });

  it("SLA chip states", () => {
    const sla = new Date(now.getTime() + 86_400_000);
    expect(slaState({ status: "ASSIGNED", slaDueAt: sla, firstActionAt: null }, now).kind).toBe("due");
    expect(slaState({ status: "UNDER_REVIEW", slaDueAt: sla, firstActionAt: now }, now).kind).toBe("met");
    expect(slaState({ status: "ASSIGNED", slaDueAt: new Date(now.getTime() - 1), firstActionAt: null }, now).kind).toBe("overdue");
  });
});

describe("SLA working days", () => {
  const settings: CalendarSettings = { workingDays: [1, 2, 3, 4, 5, 6], saturdayRule: "SECOND_FOURTH_OFF", collegeStart: "09:00", collegeEnd: "16:30" };
  it("skips Sunday, the 4th Saturday and holidays", () => {
    // Wed 25 Nov 10:00 + 5 working days: Thu 26, Fri 27, (Sat 28 = 4th Sat off), (Sun 29), Mon 30, Tue 1 (holiday), Wed 2, Thu 3
    const due = addWorkingDays(istDateTime("2026-11-25", "10:00"), 5, settings, [{ date: "2026-12-01", name: "H" }]);
    expect(due.getTime()).toBe(istDateTime("2026-12-03", "10:00").getTime());
  });
});

describe("complaint access & masking", () => {
  const c: AccessComplaint = {
    studentId: "s1",
    teacherId: "t1",
    departmentId: "cse",
    clusterId: "c1",
    isConfidential: false,
    currentAssigneeId: "ch1",
    responseRequestedFrom: null,
  };
  const v = (over: Partial<AccessViewer>): AccessViewer => ({ id: "x", role: "STUDENT", clusterHeadOf: [], hodOf: [], ...over });

  it("student A cannot see student B's complaint", () => {
    expect(canViewComplaint(v({ id: "s2" }), c)).toBe(false);
    expect(canViewComplaint(v({ id: "s1" }), c)).toBe(true);
  });

  it("accused teacher sees it only when a response is requested, never if confidential", () => {
    expect(canViewComplaint(v({ id: "t1", role: "TEACHER" }), c)).toBe(false);
    expect(canViewComplaint(v({ id: "t1", role: "TEACHER" }), { ...c, responseRequestedFrom: "t1" })).toBe(true);
    expect(canViewComplaint(v({ id: "t1", role: "TEACHER" }), { ...c, responseRequestedFrom: "t1", isConfidential: true })).toBe(false);
  });

  it("Cluster Head sees cluster complaints but not confidential ones or ones about themselves", () => {
    const ch = v({ id: "ch1", role: "CLUSTER_HEAD", clusterHeadOf: ["c1"] });
    expect(canViewComplaint(ch, { ...c, currentAssigneeId: "hod" })).toBe(true);
    expect(canViewComplaint(ch, { ...c, currentAssigneeId: "hod", isConfidential: true })).toBe(false);
    expect(canViewComplaint(ch, { ...c, currentAssigneeId: "hod", teacherId: "ch1" })).toBe(false);
  });

  it("confidential identity is masked below HOD; requested teacher never sees the student", () => {
    const conf = { ...c, isConfidential: true, currentAssigneeId: "hod" };
    expect(shouldMaskStudent(v({ id: "hod", role: "HOD", hodOf: ["cse"] }), conf)).toBe(false);
    expect(shouldMaskStudent(v({ id: "a", role: "ADMIN" }), conf)).toBe(false);
    expect(shouldMaskStudent(v({ id: "ch1", role: "CLUSTER_HEAD", clusterHeadOf: ["c1"] }), conf)).toBe(true);
    expect(shouldMaskStudent(v({ id: "t1", role: "TEACHER" }), { ...c, responseRequestedFrom: "t1" })).toBe(true);
  });
});
