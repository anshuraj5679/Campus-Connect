import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { escalationTarget } from "@/lib/services/complaintRouting";
import { AWAITING_ACTION, shouldAutoClose, shouldAutoEscalate, AUTO_CLOSE_DAYS } from "@/lib/services/complaintWorkflow";
import { addWorkingDays } from "@/lib/services/time";
import { getCalendar } from "@/lib/data/calendar";
import { addHistory, buildDirectory, complaintLink } from "./complaints";
import { notify } from "./notify";
import { audit } from "./audit";

/**
 * Scheduled job (Vercel Cron → /api/cron/jobs, or "Run now" in admin/demo):
 *  1. SLA: complaints at Cluster Head level not acted on within N working
 *     days are escalated to the HOD automatically.
 *  2. Resolved complaints are closed automatically 7 days after resolution.
 */
export async function runScheduledJobs(now: Date): Promise<{ escalated: number; closed: number }> {
  const admin = createAdminClient();
  const calendar = await getCalendar();
  const dir = await buildDirectory(admin);

  // ---- 1. SLA auto-escalation ----
  const { data: overdue } = await admin
    .from("complaints")
    .select("id, code, status, subject, assignee_level, sla_due_at, department_id, teacher_id, student_id, current_assignee_id")
    .eq("assignee_level", "CLUSTER_HEAD")
    .in("status", AWAITING_ACTION)
    .lt("sla_due_at", now.toISOString());

  let escalated = 0;
  for (const c of overdue ?? []) {
    if (!shouldAutoEscalate({ status: c.status, assigneeLevel: c.assignee_level, slaDueAt: c.sla_due_at ? new Date(c.sla_due_at) : null }, now)) continue;
    const target = escalationTarget("CLUSTER_HEAD", { departmentId: c.department_id, teacherId: c.teacher_id }, dir);
    if (!target) continue;
    const { error } = await admin
      .from("complaints")
      .update({
        status: "ESCALATED",
        current_assignee_id: target.assigneeId,
        assignee_level: target.level,
        escalated_at: now.toISOString(),
        sla_due_at: addWorkingDays(now, calendar.settings.slaWorkingDays, calendar.settings, calendar.holidays).toISOString(),
      })
      .eq("id", c.id)
      .eq("status", c.status); // optimistic: skip if someone acted meanwhile
    if (error) continue;
    await addHistory(admin, {
      complaintId: c.id,
      actorId: null,
      action: "AUTO_ESCALATED",
      fromStatus: c.status,
      toStatus: "ESCALATED",
      remark: `Not acted on within ${calendar.settings.slaWorkingDays} working days at Cluster Head level`,
      meta: { assignee_id: target.assigneeId, previous_assignee_id: c.current_assignee_id },
    });
    await notify([target.assigneeId], { type: "COMPLAINT_ESCALATED", title: `SLA breached, escalated to you: ${c.code}`, body: c.subject, link: complaintLink(c.code) });
    await notify([c.current_assignee_id], { type: "COMPLAINT_ESCALATED", title: `${c.code} auto-escalated to the HOD`, body: "The SLA for first action was missed.", link: complaintLink(c.code) });
    await notify([c.student_id], { type: "COMPLAINT_ESCALATED", title: `Your complaint ${c.code} was escalated`, body: "It has been moved to the HOD for faster action.", link: complaintLink(c.code) });
    escalated++;
  }

  // ---- 2. Auto-close ----
  const cutoff = new Date(now.getTime() - AUTO_CLOSE_DAYS * 86_400_000);
  const { data: resolved } = await admin
    .from("complaints")
    .select("id, code, status, resolved_at, student_id")
    .eq("status", "RESOLVED")
    .lt("resolved_at", cutoff.toISOString());

  let closed = 0;
  for (const c of resolved ?? []) {
    if (!shouldAutoClose({ status: c.status, resolvedAt: new Date(c.resolved_at) }, now)) continue;
    const { error } = await admin.from("complaints").update({ status: "CLOSED", closed_at: now.toISOString() }).eq("id", c.id).eq("status", "RESOLVED");
    if (error) continue;
    await addHistory(admin, { complaintId: c.id, actorId: null, action: "AUTO_CLOSED", fromStatus: "RESOLVED", toStatus: "CLOSED", remark: `Closed automatically ${AUTO_CLOSE_DAYS} days after resolution` });
    await notify([c.student_id], { type: "COMPLAINT_STATUS", title: `Complaint ${c.code} closed`, body: "The reopen window has ended.", link: complaintLink(c.code) });
    closed++;
  }

  if (escalated || closed) await audit(null, "SCHEDULED_JOBS", "complaints", null, { escalated, closed, at: now.toISOString() });
  return { escalated, closed };
}
