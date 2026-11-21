import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { FileText, Clock as History, Lock, MessagesSquare, Paperclip, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard, InfoList } from "@/components/shared/kit";
import { ComplaintStatusBadge, ConfidentialBadge, SlaChip } from "@/components/complaints/badges";
import { ComplaintThread } from "@/components/complaints/thread";
import { ComplaintActionBar } from "@/components/complaints/action-bar";
import { getViewer } from "@/lib/data/viewer";
import { getComplaintDetail } from "@/lib/data/complaints";
import { getNow } from "@/lib/datetime";
import { CATEGORY_LABEL } from "@/lib/services/complaintRouting";
import { allowedActions, canReopen, STATUS_LABEL, REOPEN_WINDOW_DAYS } from "@/lib/services/complaintWorkflow";
import { LEVEL_LABEL } from "@/lib/server/complaints";
import { bytesLabel, fmtDateTime, relativeTime } from "@/lib/format";
import { homeForRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  return { title: (await params).code };
}

const ACTION_TEXT: Record<string, string> = {
  SUBMITTED: "Submitted the complaint",
  ASSIGNED: "Assigned",
  STATUS_CHANGED: "Changed status",
  RESPONSE_REQUESTED: "Requested a response from the teacher",
  TEACHER_RESPONDED: "Teacher responded",
  ESCALATED: "Escalated",
  AUTO_ESCALATED: "Auto-escalated (SLA breached)",
  RESOLVED: "Resolved",
  RESOLVE: "Resolved",
  REOPEN: "Reopened by the student",
  CLOSE: "Closed",
  CLOSED: "Closed",
  AUTO_CLOSED: "Auto-closed",
  ESCALATE: "Escalated",
  MESSAGE: "Posted a message",
  INTERNAL_NOTE: "Added an internal note",
  TEACHER_MESSAGE: "Messaged the teacher",
};

export default async function ComplaintDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^CMP-\d{4}-\d{4,}$/.test(code)) notFound();
  const viewer = await getViewer();
  const result = await getComplaintDetail(viewer, code);
  if (result.kind === "missing") notFound();
  if (result.kind === "forbidden") forbidden();
  const c = result.detail;
  const now = await getNow();

  const actions = [...allowedActions(
    {
      status: c.status,
      studentId: c.studentId,
      teacherId: c.teacherId,
      isConfidential: c.isConfidential,
      currentAssigneeId: c.assigneeId,
      assigneeLevel: c.assigneeLevel,
      responseRequestedFrom: c.responseRequestedFrom,
      resolvedAt: c.resolvedAt,
      reopenCount: c.reopenCount,
    },
    { id: viewer.id, role: viewer.role },
    now,
  )];

  const channels: ("PUBLIC" | "INTERNAL" | "TEACHER")[] = c.viewerIsStudent
    ? actions.includes("COMMENT") ? ["PUBLIC"] : []
    : c.viewerIsRequestedTeacher
      ? actions.includes("RESPOND") ? ["TEACHER"] : []
      : [
          ...(actions.includes("COMMENT") ? (["PUBLIC"] as const) : []),
          ...(actions.includes("INTERNAL_NOTE") ? (["INTERNAL"] as const) : []),
          ...(c.assigneeId === viewer.id && c.responseRequestedFrom ? (["TEACHER"] as const) : []),
        ];

  const backHref = viewer.role === "STUDENT" ? "/student/complaints" : viewer.role === "TEACHER" ? "/teacher/complaints" : `${homeForRole(viewer.role)}/complaints`;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{c.code} <ComplaintStatusBadge status={c.status} className="h-8 text-sm" />{c.isConfidential && <ConfidentialBadge />}</span>}
        description={c.subject}
        breadcrumbs={[{ label: "Complaints", href: backHref }, { label: c.code }]}
        actions={<SlaChip status={c.status} slaDueAt={c.slaDueAt} firstActionAt={c.firstActionAt} now={now} />}
      />

      {c.viewerIsRequestedTeacher && (
        <div role="status" className="mb-5 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:bg-violet-950/40 dark:text-violet-100">
          <p className="font-semibold">Your response has been requested</p>
          <p>Reply in the thread. Only the handler sees your reply. You cannot change the status, and the student&apos;s identity is withheld.</p>
        </div>
      )}
      {c.viewerIsStudent && c.status === "RESOLVED" && (
        <div role="status" className="mb-5 rounded-xl border border-status-available/30 bg-status-available-bg p-4 text-sm text-status-available-fg">
          <p className="font-semibold">Resolved: {c.resolutionRemarks}</p>
          <p>
            {canReopen({ status: c.status, studentId: c.studentId, teacherId: c.teacherId, isConfidential: c.isConfidential, currentAssigneeId: c.assigneeId, assigneeLevel: c.assigneeLevel, responseRequestedFrom: c.responseRequestedFrom, resolvedAt: c.resolvedAt, reopenCount: c.reopenCount }, now)
              ? `Not satisfied? You can reopen it once within ${REOPEN_WINDOW_DAYS} days. It will close automatically after that.`
              : "This complaint can no longer be reopened."}
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="Details" icon={FileText}>
            <InfoList
              items={[
                { label: "Category", value: CATEGORY_LABEL[c.category] },
                ...(c.teacherName ? [{ label: "About", value: c.teacherName }] : []),
                { label: "Raised by", value: <span className={cn(c.masked && "inline-flex items-center gap-1 text-maroon")}>{c.masked && <Lock aria-hidden className="size-3.5" />}{c.student.name}</span> },
                { label: "USN · Section", value: `${c.student.usn} · ${c.student.section}` },
                { label: "Currently with", value: c.assigneeName ? `${c.assigneeName} (${c.assigneeLevel ? LEVEL_LABEL[c.assigneeLevel] : ""})` : "—" },
                ...(c.departmentLabel ? [{ label: "Department · Cluster", value: [c.departmentLabel, c.clusterLabel].filter(Boolean).join(" · ") }] : []),
                { label: "Submitted", value: `${fmtDateTime(c.createdAt)} (${relativeTime(c.createdAt, now)})` },
                ...(c.slaDueAt && ["ASSIGNED", "ESCALATED", "REOPENED"].includes(c.status) ? [{ label: "First action due", value: fmtDateTime(c.slaDueAt) }] : []),
              ]}
            />
            <div className="mt-4">
              <p className="mb-1 text-sm font-medium text-muted-foreground">Description</p>
              <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{c.description}</p>
            </div>
            {c.isConfidential && (c.viewerIsHandler || c.viewerIsStudent) && (
              <p className="mt-4 flex gap-2 rounded-lg border border-maroon/20 bg-maroon/5 p-3 text-xs">
                <ShieldCheck aria-hidden className="size-4 shrink-0 text-maroon" />
                Confidential: the student&apos;s identity is visible only to the HOD and the Administrator. The teacher concerned cannot access this complaint.
              </p>
            )}
          </SectionCard>

          {c.attachments.length > 0 && (
            <SectionCard title={`Evidence (${c.attachments.length})`} icon={Paperclip}>
              <ul className="grid grid-cols-2 gap-3">
                {c.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border hover:border-primary/40">
                      {a.mime.startsWith("image/") && a.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt={a.name} className="h-28 w-full object-cover" />
                      ) : (
                        <span className="flex h-28 items-center justify-center bg-muted"><FileText aria-hidden className="size-8 text-muted-foreground" /></span>
                      )}
                      <span className="block truncate px-2 py-1.5 text-xs">{a.name} · {bytesLabel(a.size)}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Private files. Links expire after 10 minutes.</p>
            </SectionCard>
          )}

          <SectionCard title="Timeline" icon={History}>
            <ol className="relative space-y-4 border-l-2 border-border pl-6">
              {c.history.map((h) => (
                <li key={h.id} className="relative">
                  <span className={cn("absolute top-1 -left-[31px] size-4 rounded-full border-2 border-card", h.toStatus === "RESOLVED" || h.toStatus === "CLOSED" ? "bg-status-available" : h.action.includes("ESCALAT") ? "bg-status-leave" : h.toStatus ? "bg-primary" : "bg-muted-foreground/50")} aria-hidden />
                  <p className="text-sm font-semibold">
                    {ACTION_TEXT[h.action] ?? h.action.replaceAll("_", " ").toLowerCase()}
                    {h.toStatus && h.fromStatus && h.toStatus !== h.fromStatus && <span className="font-normal text-muted-foreground"> · {STATUS_LABEL[h.fromStatus]} → {STATUS_LABEL[h.toStatus]}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{h.actorName} · {fmtDateTime(h.createdAt)}</p>
                  {h.remark && h.remark !== "Message posted" && <p className="mt-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">{h.remark}</p>}
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>

        <div className="space-y-5 lg:col-span-3">
          {actions.some((a) => ["START_REVIEW", "REQUEST_RESPONSE", "MARK_ACTION_TAKEN", "ESCALATE", "RESOLVE", "REOPEN", "CLOSE"].includes(a)) && (
            <section className="rounded-xl border bg-card p-4 shadow-card" aria-label="Actions">
              <p className="mb-3 text-sm font-semibold">{c.viewerIsStudent ? "Your options" : "Handler actions"}</p>
              <ComplaintActionBar complaintId={c.id} actions={actions} />
            </section>
          )}
          <SectionCard title="Conversation" icon={MessagesSquare} bodyClassName="p-0" description={c.viewerIsHandler ? "Yellow notes are internal and never shown to the student" : undefined}>
            <ComplaintThread
              complaintId={c.id}
              channels={channels}
              disabledReason={c.status === "CLOSED" ? "This complaint is closed." : c.viewerIsHandler ? "Only the current handler can reply to the student." : undefined}
              messages={c.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
