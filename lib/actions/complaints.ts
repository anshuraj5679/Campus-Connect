"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/auth/session";
import { getViewer } from "@/lib/data/viewer";
import { toAccessViewer } from "@/lib/data/complaints";
import { getCalendar } from "@/lib/data/calendar";
import { getNow } from "@/lib/datetime";
import { complaintActionSchema, complaintSchema, messageSchema } from "@/lib/validators/complaint";
import { routeComplaint, escalationTarget, RoutingError, CATEGORY_LABEL, type ComplaintCategory } from "@/lib/services/complaintRouting";
import {
  allowedActions,
  nextStatus,
  isHandlerAction,
  AWAITING_ACTION,
  EVIDENCE_MIME,
  MAX_COMPLAINTS_PER_DAY,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  STATUS_LABEL,
  type ComplaintAction,
  type ComplaintStatus,
} from "@/lib/services/complaintWorkflow";
import { canViewComplaint, isHandler } from "@/lib/services/complaintAccess";
import { addWorkingDays, istDateTime, istParts } from "@/lib/services/time";
import { addHistory, buildDirectory, complaintLink, LEVEL_LABEL } from "@/lib/server/complaints";
import { fail, guard, ok, parse, type ActionResult } from "@/lib/server/action";
import { notify } from "@/lib/server/notify";
import { audit } from "@/lib/server/audit";
import { verifyUploadedFile } from "@/lib/server/uploads";

type Admin = ReturnType<typeof createAdminClient>;

async function studentContext(admin: Admin, studentId: string) {
  const { data } = await admin.from("student_profiles").select("department_id, cluster_id").eq("user_id", studentId).maybeSingle();
  return data ? { departmentId: data.department_id as string, clusterId: data.cluster_id as string } : null;
}

async function teacherContext(admin: Admin, teacherId: string | undefined | null) {
  if (!teacherId) return null;
  const { data } = await admin.from("teacher_profiles").select("user_id, department_id, cluster_id").eq("user_id", teacherId).maybeSingle();
  return data ? { id: data.user_id as string, departmentId: data.department_id as string, clusterId: data.cluster_id as string | null } : null;
}

/** For the wizard's "This will go to: …" box. Does not create anything. */
export async function previewRouting(input: { category: ComplaintCategory; teacherId?: string; isConfidential: boolean }): Promise<ActionResult<{ text: string; to?: string }>> {
  return guard(async () => {
    const user = await requireRole(["STUDENT"]);
    const admin = createAdminClient();
    const student = await studentContext(admin, user.id);
    if (!student) return fail("Your academic profile is incomplete. Contact the office.");
    const teacher = await teacherContext(admin, input.teacherId);
    if (input.category === "TEACHER" && !teacher) return ok({ text: "Choose the teacher to see who will receive this." });
    const route = routeComplaint({ category: input.category, isConfidential: input.isConfidential, student, teacher }, await buildDirectory(admin));
    const { data: p } = await admin.from("profiles").select("full_name").eq("id", route.assigneeId).single();
    let where = "";
    if (route.level === "CLUSTER_HEAD" && route.clusterId) {
      const { data: c } = await admin.from("clusters").select("name").eq("id", route.clusterId).single();
      where = ` – ${c?.name ?? ""}`;
    } else if (route.level === "HOD" && route.departmentId) {
      const { data: d } = await admin.from("departments").select("code").eq("id", route.departmentId).single();
      where = ` – ${d?.code ?? ""}`;
    }
    const to = `${p?.full_name ?? "Handler"}, ${LEVEL_LABEL[route.level]}${where}`;
    return ok({ to, text: `${to}. ${route.reason}.` });
  });
}

/** Create a complaint: validate, rate-limit, route, store evidence, write timeline, notify. */
export async function createComplaint(form: FormData): Promise<ActionResult<{ code: string }>> {
  return guard(async () => {
    const user = await requireRole(["STUDENT"]);
    const p = parse(complaintSchema, {
      category: form.get("category"),
      teacherId: form.get("teacherId") ?? "",
      subject: form.get("subject"),
      description: form.get("description"),
      isConfidential: form.get("isConfidential") === "true",
    });
    if ("error" in p) return fail(p.error);
    const v = p.data;

    // Evidence was uploaded straight to Storage; we receive paths and verify each one
    // (own folder, real size ≤ 5 MB, real type jpg/png/pdf). Max 5 files.
    let evidence: { path: string; name: string }[] = [];
    try {
      evidence = JSON.parse(String(form.get("evidence") ?? "[]"));
    } catch {
      return fail("Invalid evidence list.");
    }
    if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE_FILES) return fail(`Attach at most ${MAX_EVIDENCE_FILES} files.`);
    const verified: { path: string; name: string; size: number; mime: string }[] = [];
    for (const e of evidence) {
      const check = await verifyUploadedFile("complaint-evidence", user.id, e?.path, { maxBytes: MAX_EVIDENCE_BYTES, mime: EVIDENCE_MIME });
      if (!check.ok) return fail(check.error);
      verified.push({ path: e.path, name: String(e.name ?? "evidence").slice(0, 120), size: check.size, mime: check.contentType });
    }

    const admin = createAdminClient();
    const now = await getNow();

    // Anti-abuse: max 3 complaints per student per (IST) day
    const today = istParts(now).date;
    const { count } = await admin
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("student_id", user.id)
      .gte("created_at", istDateTime(today, "00:00").toISOString());
    if ((count ?? 0) >= MAX_COMPLAINTS_PER_DAY) return fail(`You can raise at most ${MAX_COMPLAINTS_PER_DAY} complaints per day. Please try again tomorrow.`);

    const student = await studentContext(admin, user.id);
    if (!student) return fail("Your academic profile is incomplete. Contact the office.");
    const teacher = await teacherContext(admin, v.teacherId || null);

    let route;
    try {
      route = routeComplaint({ category: v.category, isConfidential: v.isConfidential, student, teacher }, await buildDirectory(admin));
    } catch (e) {
      if (e instanceof RoutingError) return fail(e.message);
      throw e;
    }

    const calendar = await getCalendar();
    const { data: codeRow, error: codeErr } = await admin.rpc("next_complaint_code", { p_year: Number(today.slice(0, 4)) });
    if (codeErr) return fail(codeErr.message);
    const code = codeRow as unknown as string;

    const { data: created, error } = await admin
      .from("complaints")
      .insert({
        code,
        student_id: user.id,
        category: v.category,
        subject: v.subject,
        description: v.description,
        teacher_id: teacher?.id ?? null,
        department_id: route.departmentId,
        cluster_id: route.clusterId,
        is_confidential: route.isConfidential,
        status: "ASSIGNED",
        current_assignee_id: route.assigneeId,
        assignee_level: route.level,
        sla_due_at: addWorkingDays(now, calendar.settings.slaWorkingDays, calendar.settings, calendar.holidays).toISOString(),
        created_at: now.toISOString(),
      })
      .select("id")
      .single();
    if (error) return fail(error.message);

    await addHistory(admin, { complaintId: created.id, actorId: user.id, action: "SUBMITTED", toStatus: "SUBMITTED", remark: "Complaint submitted" });
    await addHistory(admin, { complaintId: created.id, actorId: null, action: "ASSIGNED", fromStatus: "SUBMITTED", toStatus: "ASSIGNED", remark: route.reason, meta: { assignee_id: route.assigneeId, level: route.level } });

    if (verified.length) {
      await admin.from("complaint_attachments").insert(
        verified.map((f) => ({ complaint_id: created.id, uploaded_by: user.id, path: f.path, file_name: f.name, mime: f.mime, size: f.size })),
      );
    }

    await notify([route.assigneeId], {
      type: "COMPLAINT_ASSIGNED",
      title: `${route.isConfidential ? "Confidential complaint" : "New complaint"} assigned: ${code}`,
      body: `${CATEGORY_LABEL[v.category]} · ${v.subject}`,
      link: complaintLink(code),
    });
    revalidatePath("/student", "layout");
    return ok({ code }, `Complaint ${code} submitted.`);
  });
}

type LoadedComplaint = Awaited<ReturnType<typeof loadForAction>>;
async function loadForAction(admin: Admin, complaintId: string) {
  const { data } = await admin.from("complaints").select("*").eq("id", complaintId).maybeSingle();
  return data;
}

function workflowShape(c: NonNullable<LoadedComplaint>) {
  return {
    status: c.status as ComplaintStatus,
    studentId: c.student_id,
    teacherId: c.teacher_id,
    isConfidential: c.is_confidential,
    currentAssigneeId: c.current_assignee_id,
    assigneeLevel: c.assignee_level,
    responseRequestedFrom: c.response_requested_from,
    resolvedAt: c.resolved_at ? new Date(c.resolved_at) : null,
    reopenCount: c.reopen_count,
  };
}

/** Status changes for handlers (review, action taken, resolve, escalate, request response) and students (reopen, close). */
export async function complaintAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    await requireUser();
    const viewer = await getViewer();
    const p = parse(complaintActionSchema, input);
    if ("error" in p) return fail(p.error);
    const { complaintId, action, remark } = p.data;
    const admin = createAdminClient();
    const c = await loadForAction(admin, complaintId);
    if (!c) return fail("Complaint not found.");

    const access = {
      studentId: c.student_id, teacherId: c.teacher_id, departmentId: c.department_id, clusterId: c.cluster_id,
      isConfidential: c.is_confidential, currentAssigneeId: c.current_assignee_id, responseRequestedFrom: c.response_requested_from,
    };
    if (!canViewComplaint(toAccessViewer(viewer), access)) return fail("You do not have access to this complaint.");
    const now = await getNow();
    const allowed = allowedActions(workflowShape(c), { id: viewer.id, role: viewer.role }, now);
    if (!allowed.has(action as ComplaintAction)) return fail("This action is not allowed for this complaint right now.");

    const from = c.status as ComplaintStatus;
    const to = nextStatus(action as ComplaintAction, from);
    const calendar = await getCalendar();
    const sla = () => addWorkingDays(now, calendar.settings.slaWorkingDays, calendar.settings, calendar.holidays).toISOString();
    const patch: Record<string, unknown> = {};
    if (to) patch.status = to;
    if (isHandlerAction(action as ComplaintAction) && !c.first_action_at) patch.first_action_at = now.toISOString();
    const link = complaintLink(c.code);
    let historyRemark = remark || null;
    let historyMeta: Record<string, unknown> = {};

    switch (action) {
      case "RESOLVE":
        if (!remark || remark.length < 5) return fail("Add resolution remarks (at least 5 characters).");
        Object.assign(patch, { resolved_at: now.toISOString(), resolution_remarks: remark, response_requested_from: null });
        break;
      case "ESCALATE": {
        const target = escalationTarget(c.assignee_level, { departmentId: c.department_id, teacherId: c.teacher_id }, await buildDirectory(admin));
        if (!target) return fail("There is no higher level to escalate to.");
        Object.assign(patch, { current_assignee_id: target.assigneeId, assignee_level: target.level, escalated_at: now.toISOString(), sla_due_at: sla(), first_action_at: null });
        historyMeta = { assignee_id: target.assigneeId, level: target.level, previous_assignee_id: c.current_assignee_id };
        break;
      }
      case "REQUEST_RESPONSE":
        if (!c.teacher_id) return fail("This complaint is not about a teacher.");
        Object.assign(patch, { response_requested_from: c.teacher_id, response_requested_at: now.toISOString(), response_received_at: null });
        historyRemark = "Requested a response from the teacher";
        break;
      case "REOPEN":
        if (!remark || remark.length < 10) return fail("Tell us why you are reopening (at least 10 characters).");
        Object.assign(patch, { reopen_count: (c.reopen_count ?? 0) + 1, reopen_reason: remark, resolved_at: null, sla_due_at: sla(), first_action_at: null });
        break;
      case "CLOSE":
        Object.assign(patch, { closed_at: now.toISOString() });
        historyRemark = remark || "Closed by the student";
        break;
    }

    const { error } = await admin.from("complaints").update(patch).eq("id", c.id).eq("status", from);
    if (error) return fail(error.message);
    await addHistory(admin, {
      complaintId: c.id,
      actorId: viewer.id,
      action: action === "REQUEST_RESPONSE" ? "RESPONSE_REQUESTED" : action === "START_REVIEW" || action === "MARK_ACTION_TAKEN" ? "STATUS_CHANGED" : action,
      fromStatus: to ? from : null,
      toStatus: to,
      remark: historyRemark,
      meta: historyMeta,
    });

    // Request text goes into the private handler ↔ teacher channel
    if (action === "REQUEST_RESPONSE") {
      await admin.from("complaint_messages").insert({ complaint_id: c.id, sender_id: viewer.id, audience: "TEACHER", body: remark || "Please share your response regarding this complaint." });
      await notify([c.teacher_id], { type: "RESPONSE_REQUESTED", title: `Your response is requested: ${c.code}`, body: `${viewer.fullName} has asked for your response.`, link });
    }
    if (action === "ESCALATE") {
      await notify([historyMeta.assignee_id as string], { type: "COMPLAINT_ESCALATED", title: `Complaint escalated to you: ${c.code}`, body: c.subject, link });
      await notify([c.student_id], { type: "COMPLAINT_ESCALATED", title: `Your complaint ${c.code} was escalated`, body: `Now with the ${LEVEL_LABEL[historyMeta.level as keyof typeof LEVEL_LABEL]}.`, link });
    } else if (action === "RESOLVE") {
      await notify([c.student_id], { type: "COMPLAINT_RESOLVED", title: `Your complaint ${c.code} was resolved`, body: `${remark}. You can reopen it within 7 days if the issue continues.`, link });
    } else if (action === "REOPEN") {
      await notify([c.current_assignee_id], { type: "COMPLAINT_STATUS", title: `Complaint reopened by the student: ${c.code}`, body: remark, link });
    } else if (to && action !== "REQUEST_RESPONSE") {
      await notify([c.student_id === viewer.id ? c.current_assignee_id : c.student_id], { type: "COMPLAINT_STATUS", title: `${c.code} is now ${STATUS_LABEL[to]}`, body: c.subject, link });
    }

    await audit(viewer.id, `COMPLAINT_${action}`, "complaints", c.id, { code: c.code, from, to });
    revalidatePath(link);
    revalidatePath("/", "layout");
    return ok(undefined, to ? `Status changed to ${STATUS_LABEL[to]}.` : "Done.");
  });
}

/** Post to the thread. Students: PUBLIC. Handlers: PUBLIC or INTERNAL note. Requested teacher: TEACHER (their response). */
export async function postComplaintMessage(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    await requireUser();
    const viewer = await getViewer();
    const p = parse(messageSchema, input);
    if ("error" in p) return fail(p.error);
    const { complaintId, body } = p.data;
    let audience = p.data.audience;
    const admin = createAdminClient();
    const c = await loadForAction(admin, complaintId);
    if (!c) return fail("Complaint not found.");
    const av = toAccessViewer(viewer);
    const access = {
      studentId: c.student_id, teacherId: c.teacher_id, departmentId: c.department_id, clusterId: c.cluster_id,
      isConfidential: c.is_confidential, currentAssigneeId: c.current_assignee_id, responseRequestedFrom: c.response_requested_from,
    };
    if (!canViewComplaint(av, access)) return fail("You do not have access to this complaint.");
    const now = await getNow();
    const allowed = allowedActions(workflowShape(c), { id: viewer.id, role: viewer.role }, now);

    const isStudent = viewer.id === c.student_id;
    const isRequestedTeacher = allowed.has("RESPOND");
    if (isStudent) {
      if (!allowed.has("COMMENT")) return fail("This complaint is closed.");
      audience = "PUBLIC";
    } else if (isRequestedTeacher) {
      audience = "TEACHER";
    } else if (isHandler(av, access)) {
      if (audience === "INTERNAL" && !allowed.has("INTERNAL_NOTE")) return fail("Notes are closed for this complaint.");
      if (audience === "PUBLIC" && !allowed.has("COMMENT")) return fail("Only the current handler can reply to the student.");
      if (audience === "TEACHER" && c.current_assignee_id !== viewer.id) return fail("Only the current handler can message the teacher.");
    } else {
      return fail("You cannot post on this complaint.");
    }

    const { error } = await admin.from("complaint_messages").insert({ complaint_id: c.id, sender_id: viewer.id, body, audience, created_at: now.toISOString() });
    if (error) return fail(error.message);

    const patch: Record<string, unknown> = {};
    let action = "MESSAGE";
    if (isRequestedTeacher) {
      patch.response_received_at = now.toISOString();
      action = "TEACHER_RESPONDED";
    } else if (audience === "INTERNAL") action = "INTERNAL_NOTE";
    else if (audience === "TEACHER") action = "TEACHER_MESSAGE";
    // The handler's first public reply counts as "acted on" for the SLA.
    if (!isStudent && !isRequestedTeacher && audience === "PUBLIC" && c.current_assignee_id === viewer.id) {
      if (!c.first_action_at) patch.first_action_at = now.toISOString();
      if (AWAITING_ACTION.includes(c.status)) patch.status = "UNDER_REVIEW";
    }
    if (Object.keys(patch).length) await admin.from("complaints").update(patch).eq("id", c.id);
    await addHistory(admin, {
      complaintId: c.id,
      actorId: viewer.id,
      action,
      fromStatus: patch.status ? c.status : null,
      toStatus: (patch.status as ComplaintStatus) ?? null,
      remark: action === "MESSAGE" ? "Message posted" : action === "TEACHER_RESPONDED" ? "Teacher responded" : null,
      meta: { audience },
    });

    const link = complaintLink(c.code);
    if (isStudent) await notify([c.current_assignee_id], { type: "COMPLAINT_MESSAGE", title: `New message from the student: ${c.code}`, body: body.slice(0, 140), link });
    else if (isRequestedTeacher) await notify([c.current_assignee_id], { type: "COMPLAINT_MESSAGE", title: `Teacher responded: ${c.code}`, body: body.slice(0, 140), link });
    else if (audience === "PUBLIC") await notify([c.student_id], { type: "COMPLAINT_MESSAGE", title: `New reply on your complaint ${c.code}`, body: body.slice(0, 140), link });
    else if (audience === "TEACHER" && c.response_requested_from) await notify([c.response_requested_from], { type: "COMPLAINT_MESSAGE", title: `New message about ${c.code}`, link });

    revalidatePath(link);
    return ok(undefined, audience === "INTERNAL" ? "Internal note added." : "Message sent.");
  });
}

export async function getTeachersForComplaint(): Promise<ActionResult<{ id: string; name: string; department: string }[]>> {
  return guard(async () => {
    await requireRole(["STUDENT"]);
    const { data } = await createAdminClient().from("teacher_profiles").select("user_id, profiles!inner(full_name, is_active), departments(code)").eq("profiles.is_active", true);
    return ok(
      (data ?? [])
        .map((t: any) => ({ id: t.user_id, name: t.profiles.full_name, department: t.departments?.code ?? "" }))
        .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name)),
    );
  });
}
