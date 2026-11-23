import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailSender } from "./email";

export type NotificationType =
  | "COMPLAINT_ASSIGNED"
  | "COMPLAINT_STATUS"
  | "COMPLAINT_MESSAGE"
  | "RESPONSE_REQUESTED"
  | "COMPLAINT_ESCALATED"
  | "COMPLAINT_RESOLVED"
  | "TEACHER_UNAVAILABLE"
  | "TIMETABLE_PUBLISHED"
  | "ANNOUNCEMENT"
  | "ACCOUNT_APPROVAL_REQUEST"
  | "ACCOUNT_APPROVED"
  | "CLASS_TEACHER_ASSIGNED";

export type NotificationInput = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
};

/**
 * In-app notification for each user (delivered live through Supabase Realtime
 * on the `notifications` table), plus the optional email stub.
 */
export async function notify(userIds: (string | null | undefined)[], n: NotificationInput) {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return;
  const admin = createAdminClient();
  const rows = ids.map((user_id) => ({ user_id, type: n.type, title: n.title.slice(0, 160), body: n.body?.slice(0, 600) ?? null, link: n.link ?? null }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("notifications").insert(rows.slice(i, i + 500));
    if (error) console.error("notify failed:", error.message);
  }
  if (process.env.EMAIL_LOG === "true") {
    const { data } = await admin.from("profiles").select("email").in("id", ids);
    await Promise.all((data ?? []).map((p) => emailSender.send({ to: p.email, subject: n.title, text: n.body ?? "" })));
  }
}
