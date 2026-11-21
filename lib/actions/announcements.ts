"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/auth/session";
import { getViewer } from "@/lib/data/viewer";
import { getNow } from "@/lib/datetime";
import { announcementSchema } from "@/lib/validators/admin";
import { allowedScopes, isAnnouncementTarget, type TargetAnnouncement } from "@/lib/services/announcements";
import { istDateTime } from "@/lib/services/time";
import { fail, guard, ok, parse, type ActionResult } from "@/lib/server/action";
import { notify } from "@/lib/server/notify";
import { audit } from "@/lib/server/audit";
import { verifyUploadedFile } from "@/lib/server/uploads";

/** Publish a notice in the author's own scope: Admin → College, HOD → Department, CH → Cluster. */
export async function createAnnouncement(form: FormData): Promise<ActionResult> {
  return guard(async () => {
    await requireRole(["CLUSTER_HEAD", "HOD", "ADMIN"]);
    const viewer = await getViewer();
    const p = parse(announcementSchema, {
      title: form.get("title"),
      body: form.get("body"),
      audience: form.get("audience"),
      semesters: JSON.parse(String(form.get("semesters") ?? "[]")),
      sections: JSON.parse(String(form.get("sections") ?? "[]")),
      pinned: form.get("pinned") === "true",
      expiresAt: form.get("expiresAt") ?? "",
    });
    if ("error" in p) return fail(p.error);
    const v = p.data;
    const scope = allowedScopes(viewer.role)[0];
    if (!scope) return fail("You cannot publish announcements.");

    const admin = createAdminClient();
    let departmentId: string | null = null;
    let clusterId: string | null = null;
    if (scope === "DEPARTMENT") {
      departmentId = viewer.hodOf[0] ?? null;
      if (!departmentId) return fail("You are not assigned as HOD of a department.");
    }
    if (scope === "CLUSTER") {
      clusterId = viewer.clusterHeadOf[0] ?? null;
      if (!clusterId) return fail("You are not assigned as Cluster Head of a cluster.");
      const { data: c } = await admin.from("clusters").select("department_id").eq("id", clusterId).single();
      departmentId = c?.department_id ?? null;
    }

    // The attachment was uploaded straight to Storage; verify the path (own folder, ≤ 10 MB).
    let attachmentPath: string | null = null;
    let attachmentName: string | null = null;
    const path = String(form.get("attachmentPath") ?? "");
    if (path) {
      const check = await verifyUploadedFile("announcements", viewer.id, path, { maxBytes: 10 * 1024 * 1024 });
      if (!check.ok) return fail(check.error);
      attachmentPath = path;
      attachmentName = String(form.get("attachmentName") ?? "attachment").slice(0, 120);
    }

    const expiresAt = v.expiresAt ? istDateTime(v.expiresAt, "23:59").toISOString() : null;
    const { data: created, error } = await admin
      .from("announcements")
      .insert({
        author_id: viewer.id,
        scope,
        department_id: departmentId,
        cluster_id: clusterId,
        audience: v.audience,
        semesters: v.semesters,
        sections: v.sections,
        title: v.title,
        body: v.body,
        pinned: v.pinned,
        expires_at: expiresAt,
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
      })
      .select("id")
      .single();
    if (error) return fail(error.message);

    // Notify every targeted user (same rule as RLS, evaluated in TypeScript)
    const target: TargetAnnouncement = { scope, departmentId, clusterId, audience: v.audience, semesters: v.semesters, sections: v.sections, expiresAt: expiresAt ? new Date(expiresAt) : null };
    const now = await getNow();
    const [{ data: students }, { data: teachers }] = await Promise.all([
      admin.from("student_profiles").select("user_id, department_id, cluster_id, semester, section, profiles!inner(is_active)").eq("profiles.is_active", true),
      admin.from("teacher_profiles").select("user_id, department_id, cluster_id, profiles!inner(role, is_active)").eq("profiles.is_active", true),
    ]);
    const recipients = [
      ...(students ?? []).filter((s) => isAnnouncementTarget(target, { role: "STUDENT", departmentId: s.department_id, clusterId: s.cluster_id, semester: s.semester, section: s.section }, now)).map((s) => s.user_id),
      ...(teachers ?? []).filter((t: any) => isAnnouncementTarget(target, { role: t.profiles.role, departmentId: t.department_id, clusterId: t.cluster_id, semester: null, section: null }, now)).map((t) => t.user_id),
    ].filter((id) => id !== viewer.id);
    await notify(recipients, { type: "ANNOUNCEMENT", title: `New notice: ${v.title}`, body: `From ${viewer.fullName}`, link: "/notices" });

    await audit(viewer.id, "ANNOUNCEMENT_CREATED", "announcements", created.id, { scope, recipients: recipients.length });
    revalidatePath("/", "layout");
    return ok(undefined, `Published to ${recipients.length} people.`);
  });
}

async function ownOrAdmin(id: string) {
  const viewer = await getViewer();
  const admin = createAdminClient();
  const { data } = await admin.from("announcements").select("id, author_id, pinned, attachment_path").eq("id", id).maybeSingle();
  if (!data) return { error: "Announcement not found." as const };
  if (data.author_id !== viewer.id && viewer.role !== "ADMIN") return { error: "You can manage only your own announcements." as const };
  return { viewer, admin, row: data };
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  return guard(async () => {
    await requireRole(["CLUSTER_HEAD", "HOD", "ADMIN"]);
    if (!z.uuid().safeParse(id).success) return fail("Invalid announcement.");
    const r = await ownOrAdmin(id);
    if ("error" in r) return fail(r.error!);
    if (r.row.attachment_path) await r.admin.storage.from("announcements").remove([r.row.attachment_path]);
    const { error } = await r.admin.from("announcements").delete().eq("id", id);
    if (error) return fail(error.message);
    await audit(r.viewer.id, "ANNOUNCEMENT_DELETED", "announcements", id);
    revalidatePath("/", "layout");
    return ok(undefined, "Announcement deleted.");
  });
}

export async function toggleAnnouncementPin(id: string): Promise<ActionResult> {
  return guard(async () => {
    await requireRole(["CLUSTER_HEAD", "HOD", "ADMIN"]);
    if (!z.uuid().safeParse(id).success) return fail("Invalid announcement.");
    const r = await ownOrAdmin(id);
    if ("error" in r) return fail(r.error!);
    const { error } = await r.admin.from("announcements").update({ pinned: !r.row.pinned }).eq("id", id);
    if (error) return fail(error.message);
    revalidatePath("/", "layout");
    return ok(undefined, r.row.pinned ? "Unpinned." : "Pinned to the top.");
  });
}

/** Runs as the user (RLS: insert own read receipts only). */
export async function markAnnouncementsRead(ids: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const valid = ids.filter((id) => z.uuid().safeParse(id).success).slice(0, 200);
  if (!valid.length) return ok();
  const supabase = await createClient();
  await supabase.from("announcement_reads").upsert(valid.map((announcement_id) => ({ announcement_id, user_id: user.id })), { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
  return ok();
}
