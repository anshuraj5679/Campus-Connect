import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MASKED_STUDENT, shouldMaskStudent, canViewComplaint, isHandler, type AccessViewer } from "@/lib/services/complaintAccess";
import type { ComplaintCategory, HandlerLevel } from "@/lib/services/complaintRouting";
import type { ComplaintStatus } from "@/lib/services/complaintWorkflow";
import type { Viewer } from "./viewer";

export type ComplaintRow = {
  id: string;
  code: string;
  category: ComplaintCategory;
  subject: string;
  status: ComplaintStatus;
  isConfidential: boolean;
  assigneeName: string | null;
  assigneeLevel: HandlerLevel | null;
  studentName: string;
  teacherName: string | null;
  slaDueAt: Date | null;
  firstActionAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  responseRequested: boolean;
  departmentId: string | null;
  clusterId: string | null;
  assigneeId: string | null;
};

export function toAccessViewer(v: Viewer): AccessViewer {
  return { id: v.id, role: v.role, clusterHeadOf: v.clusterHeadOf, hodOf: v.hodOf };
}

const LIST_SELECT =
  "id, code, category, subject, status, is_confidential, assignee_level, sla_due_at, first_action_at, resolved_at, created_at, updated_at, student_id, teacher_id, department_id, cluster_id, current_assignee_id, response_requested_from, response_received_at";

export type ListScope = "student" | "handler" | "responses";

/**
 * Complaints visible to the viewer. Visibility comes from RLS
 * (public.can_view_complaint), names are filled in and masked here.
 */
export async function listComplaints(viewer: Viewer, opts: { scope: ListScope; assignedOnly?: boolean }) {
  const supabase = await createClient();
  let q = supabase.from("complaints").select(LIST_SELECT).order("created_at", { ascending: false }).limit(500);
  if (opts.scope === "student") q = q.eq("student_id", viewer.id);
  if (opts.scope === "responses") q = q.eq("response_requested_from", viewer.id);
  if (opts.scope === "handler") q = q.neq("student_id", viewer.id);
  if (opts.assignedOnly) q = q.eq("current_assignee_id", viewer.id);
  const { data } = await q;
  const rows = data ?? [];

  const ids = [...new Set(rows.flatMap((r) => [r.student_id, r.teacher_id, r.current_assignee_id]).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await createAdminClient().from("profiles").select("id, full_name").in("id", ids) : { data: [] as any[] };
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name as string]));
  const av = toAccessViewer(viewer);

  return rows.map<ComplaintRow>((r) => {
    const access = {
      studentId: r.student_id,
      teacherId: r.teacher_id,
      departmentId: r.department_id,
      clusterId: r.cluster_id,
      isConfidential: r.is_confidential,
      currentAssigneeId: r.current_assignee_id,
      responseRequestedFrom: r.response_requested_from,
    };
    return {
      id: r.id,
      code: r.code,
      category: r.category,
      subject: r.subject,
      status: r.status,
      isConfidential: r.is_confidential,
      assigneeName: r.current_assignee_id ? (name.get(r.current_assignee_id) ?? null) : null,
      assigneeLevel: r.assignee_level,
      studentName: shouldMaskStudent(av, access) ? MASKED_STUDENT.name : (name.get(r.student_id) ?? "Student"),
      teacherName: r.teacher_id ? (name.get(r.teacher_id) ?? null) : null,
      slaDueAt: r.sla_due_at ? new Date(r.sla_due_at) : null,
      firstActionAt: r.first_action_at ? new Date(r.first_action_at) : null,
      resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      responseRequested: !!r.response_requested_from && !r.response_received_at,
      departmentId: r.department_id,
      clusterId: r.cluster_id,
      assigneeId: r.current_assignee_id,
    };
  });
}

export type ComplaintDetail = Awaited<ReturnType<typeof loadDetail>>;

async function loadDetail(viewer: Viewer, code: string) {
  const supabase = await createClient();
  const admin = createAdminClient();
  // RLS decides whether this user may see the complaint at all.
  const { data: c } = await supabase.from("complaints").select("*").eq("code", code).maybeSingle();
  if (!c) return null;

  const av = toAccessViewer(viewer);
  const access = {
    studentId: c.student_id,
    teacherId: c.teacher_id,
    departmentId: c.department_id,
    clusterId: c.cluster_id,
    isConfidential: c.is_confidential,
    currentAssigneeId: c.current_assignee_id,
    responseRequestedFrom: c.response_requested_from,
  };
  // Defence in depth: the TypeScript rule must agree with RLS.
  if (!canViewComplaint(av, access)) return null;
  const masked = shouldMaskStudent(av, access);

  const [messagesRes, historyRes, attachmentsRes] = await Promise.all([
    supabase.from("complaint_messages").select("id, sender_id, body, audience, created_at").eq("complaint_id", c.id).order("created_at"),
    supabase.from("complaint_history").select("id, actor_id, action, from_status, to_status, remark, meta, created_at").eq("complaint_id", c.id).order("created_at"),
    supabase.from("complaint_attachments").select("id, path, file_name, mime, size").eq("complaint_id", c.id),
  ]);

  const peopleIds = [
    c.student_id,
    c.teacher_id,
    c.current_assignee_id,
    c.response_requested_from,
    ...(messagesRes.data ?? []).map((m) => m.sender_id),
    ...(historyRes.data ?? []).map((h) => h.actor_id),
  ].filter(Boolean) as string[];
  const [{ data: people }, { data: sp }, { data: dept }, { data: cluster }] = await Promise.all([
    admin.from("profiles").select("id, full_name, role").in("id", [...new Set(peopleIds)]),
    admin.from("student_profiles").select("usn, section, semester, departments(code)").eq("user_id", c.student_id).maybeSingle(),
    c.department_id ? admin.from("departments").select("code, name").eq("id", c.department_id).maybeSingle() : Promise.resolve({ data: null }),
    c.cluster_id ? admin.from("clusters").select("name").eq("id", c.cluster_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const nameOf = (id: string | null) => {
    if (!id) return "System";
    if (id === c.student_id && masked) return MASKED_STUDENT.name;
    return person.get(id)?.full_name ?? "Unknown";
  };

  const files = attachmentsRes.data ?? [];
  const signed = files.length
    ? (await admin.storage.from("complaint-evidence").createSignedUrls(files.map((f) => f.path), 60 * 10)).data ?? []
    : [];

  const isStudentViewer = viewer.id === c.student_id;
  const isTeacherViewer = c.response_requested_from === viewer.id && c.current_assignee_id !== viewer.id;

  return {
    id: c.id as string,
    code: c.code as string,
    category: c.category as ComplaintCategory,
    subject: c.subject as string,
    description: c.description as string,
    status: c.status as ComplaintStatus,
    isConfidential: c.is_confidential as boolean,
    assigneeId: c.current_assignee_id as string | null,
    assigneeName: c.current_assignee_id ? nameOf(c.current_assignee_id) : null,
    assigneeLevel: c.assignee_level as HandlerLevel | null,
    departmentLabel: dept ? `${(dept as any).code}` : null,
    clusterLabel: cluster ? (cluster as any).name : null,
    teacherId: c.teacher_id as string | null,
    teacherName: c.teacher_id ? nameOf(c.teacher_id) : null,
    studentId: c.student_id as string,
    student: masked
      ? { name: MASKED_STUDENT.name, usn: MASKED_STUDENT.usn, section: MASKED_STUDENT.section }
      : { name: nameOf(c.student_id), usn: (sp as any)?.usn ?? "—", section: sp ? `${(sp as any).departments?.code ?? ""} ${(sp as any).section}` : "—" },
    masked,
    responseRequestedFrom: c.response_requested_from as string | null,
    responseRequestedAt: c.response_requested_at ? new Date(c.response_requested_at) : null,
    responseReceivedAt: c.response_received_at ? new Date(c.response_received_at) : null,
    slaDueAt: c.sla_due_at ? new Date(c.sla_due_at) : null,
    firstActionAt: c.first_action_at ? new Date(c.first_action_at) : null,
    resolvedAt: c.resolved_at ? new Date(c.resolved_at) : null,
    resolutionRemarks: c.resolution_remarks as string | null,
    reopenCount: c.reopen_count as number,
    createdAt: new Date(c.created_at),
    messages: (messagesRes.data ?? []).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: nameOf(m.sender_id),
      senderRole: m.sender_id === c.student_id ? "Student" : (person.get(m.sender_id)?.role as string | undefined) ?? "",
      body: m.body,
      audience: m.audience as "PUBLIC" | "INTERNAL" | "TEACHER",
      createdAt: new Date(m.created_at),
      mine: m.sender_id === viewer.id,
    })),
    history: (historyRes.data ?? [])
      // Students never see internal-note or teacher-exchange entries in their timeline.
      .filter((h) => !(isStudentViewer || isTeacherViewer) || !["INTERNAL_NOTE", "TEACHER_MESSAGE"].includes(h.action))
      .map((h) => ({
        id: h.id,
        actorName: nameOf(h.actor_id),
        action: h.action as string,
        fromStatus: h.from_status as ComplaintStatus | null,
        toStatus: h.to_status as ComplaintStatus | null,
        remark: isTeacherViewer && h.action === "SUBMITTED" ? null : (h.remark as string | null),
        createdAt: new Date(h.created_at),
      })),
    attachments: isTeacherViewer
      ? []
      : files.map((f, i) => ({ id: f.id, name: f.file_name, mime: f.mime, size: f.size, url: signed[i]?.signedUrl ?? null })),
    viewerIsHandler: isHandler(av, access),
    viewerIsStudent: isStudentViewer,
    viewerIsRequestedTeacher: isTeacherViewer,
  };
}

/** "ok" with data, or "forbidden" (exists but not yours → 403), or "missing" (404). */
export async function getComplaintDetail(viewer: Viewer, code: string) {
  const detail = await loadDetail(viewer, code);
  if (detail) return { kind: "ok" as const, detail };
  const { data } = await createAdminClient().from("complaints").select("id").eq("code", code).maybeSingle();
  if (data) return { kind: "forbidden" as const };
  return { kind: "missing" as const };
}
