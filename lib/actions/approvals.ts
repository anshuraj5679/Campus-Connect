"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/session";
import { fail, guard, ok, type ActionResult } from "@/lib/server/action";
import { notify } from "@/lib/server/notify";
import { audit } from "@/lib/server/audit";
import { canDecide, type ApprovalTarget as Target } from "@/lib/services/approvalRules";

/**
 * Account approval chain
 *   Student      → class teacher of their section (Cluster Head if the section has none)
 *   Teacher      → Cluster Head of their cluster
 *   Cluster Head → HOD of the department
 * The HOD (own department) and the admin can always approve.
 */

type Admin = ReturnType<typeof createAdminClient>;
const id = z.uuid();

async function loadTarget(admin: Admin, userId: string): Promise<Target | null> {
  const { data: p } = await admin.from("profiles").select("id, full_name, role, is_verified, is_active").eq("id", userId).maybeSingle();
  if (!p) return null;
  const base = { id: p.id, name: p.full_name, role: p.role, isVerified: p.is_verified, isActive: p.is_active };
  if (p.role === "STUDENT") {
    const { data: s } = await admin
      .from("student_profiles")
      .select("department_id, cluster_id, section_id, sections(name, class_teacher_id), clusters(cluster_head_id), departments(hod_id)")
      .eq("user_id", userId)
      .maybeSingle();
    const r = s as any;
    return { ...base, departmentId: r?.department_id ?? null, clusterId: r?.cluster_id ?? null, sectionId: r?.section_id ?? null, sectionName: r?.sections?.name ?? null, classTeacherId: r?.sections?.class_teacher_id ?? null, clusterHeadId: r?.clusters?.cluster_head_id ?? null, hodId: r?.departments?.hod_id ?? null };
  }
  const { data: t } = await admin.from("teacher_profiles").select("department_id, cluster_id, clusters(cluster_head_id), departments(hod_id)").eq("user_id", userId).maybeSingle();
  const r = t as any;
  return { ...base, departmentId: r?.department_id ?? null, clusterId: r?.cluster_id ?? null, sectionId: null, sectionName: null, classTeacherId: null, clusterHeadId: r?.clusters?.cluster_head_id ?? null, hodId: r?.departments?.hod_id ?? null };
}

function revalidatePeople() {
  revalidatePath("/cluster-head/people");
  revalidatePath("/teacher/my-section");
  revalidatePath("/admin/users");
}

async function decide(userId: unknown, decision: "approve" | "reject" | "restore"): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireUser();
    const parsed = id.safeParse(userId);
    if (!parsed.success) return fail("Invalid account.");
    const admin = createAdminClient();
    const t = await loadTarget(admin, parsed.data);
    if (!t) return fail("Account not found.");
    const denied = canDecide(me, t);
    if (denied) return fail(denied);
    const now = new Date().toISOString();

    if (decision === "approve") {
      const { error } = await admin.from("profiles").update({ is_verified: true, is_active: true, verified_by: me.id, verified_at: now, rejected_at: null }).eq("id", t.id);
      if (error) return fail(error.message);
      await notify([t.id], {
        type: "ACCOUNT_APPROVED",
        title: "Your account has been approved",
        body: `${me.fullName} approved your CampusConnect account${t.sectionName ? ` for Section ${t.sectionName}` : ""}.`,
        link: t.role === "STUDENT" ? "/student" : "/teacher",
      });
    } else if (decision === "reject") {
      if (t.isVerified && me.role !== "ADMIN" && t.hodId !== me.id) return fail("This account is already approved. Ask the HOD or admin to deactivate it.");
      const { error } = await admin.from("profiles").update({ is_verified: false, is_active: false, rejected_at: now, verified_by: me.id, verified_at: null }).eq("id", t.id);
      if (error) return fail(error.message);
    } else {
      const { error } = await admin.from("profiles").update({ is_active: true, rejected_at: null }).eq("id", t.id);
      if (error) return fail(error.message);
    }
    await audit(me.id, decision === "approve" ? "ACCOUNT_APPROVED" : decision === "reject" ? "ACCOUNT_REJECTED" : "ACCOUNT_RESTORED", "profiles", t.id, { role: t.role, section: t.sectionName });
    revalidatePeople();
    return ok(undefined, decision === "approve" ? `${t.name} approved.` : decision === "reject" ? `${t.name}'s registration was rejected. They can no longer sign in.` : `${t.name} is back in the pending list.`);
  });
}

export async function approveAccount(userId: unknown) {
  return decide(userId, "approve");
}
export async function rejectAccount(userId: unknown) {
  return decide(userId, "reject");
}
export async function restoreAccount(userId: unknown) {
  return decide(userId, "restore");
}

/** Cluster Head (or HOD / admin) sets or clears a section's class teacher. */
export async function assignClassTeacher(sectionId: unknown, teacherId: unknown): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireUser();
    const sid = id.safeParse(sectionId);
    const tid = teacherId === null || teacherId === "" ? { success: true as const, data: null } : id.safeParse(teacherId);
    if (!sid.success || !tid.success) return fail("Invalid input.");
    const admin = createAdminClient();
    const { data: s } = await admin
      .from("sections")
      .select("id, name, cluster_id, department_id, class_teacher_id, clusters(name, cluster_head_id), departments(hod_id)")
      .eq("id", sid.data)
      .maybeSingle();
    if (!s) return fail("Section not found.");
    const sec = s as any;
    if (me.role !== "ADMIN" && sec.clusters?.cluster_head_id !== me.id && sec.departments?.hod_id !== me.id) return fail("Only the Cluster Head of this section's cluster can assign its class teacher.");

    if (tid.data) {
      const { data: t } = await admin.from("teacher_profiles").select("cluster_id, profiles!teacher_profiles_user_id_fkey!inner(full_name, is_verified, is_active)").eq("user_id", tid.data).maybeSingle();
      const tr = t as any;
      if (!tr || tr.cluster_id !== sec.cluster_id) return fail("The class teacher must be a teacher of this cluster.");
      if (!tr.profiles.is_verified || !tr.profiles.is_active) return fail("Approve this teacher first.");
      const { data: other } = await admin.from("sections").select("name").eq("class_teacher_id", tid.data).neq("id", sec.id).maybeSingle();
      if (other) return fail(`${tr.profiles.full_name} is already class teacher of Section ${other.name}.`);
      const { error } = await admin.from("sections").update({ class_teacher_id: tid.data }).eq("id", sec.id);
      if (error) return fail(error.message);
      const { count } = await admin
        .from("student_profiles")
        .select("user_id, profiles!student_profiles_user_id_fkey!inner(is_verified, is_active)", { count: "exact", head: true })
        .eq("section_id", sec.id)
        .eq("profiles.is_verified", false)
        .eq("profiles.is_active", true);
      await notify([tid.data], {
        type: "CLASS_TEACHER_ASSIGNED",
        title: `You are now class teacher of Section ${sec.name}`,
        body: count ? `${count} student${count > 1 ? "s are" : " is"} waiting for your approval.` : "You'll approve new students of this section.",
        link: "/teacher/my-section",
      });
      await audit(me.id, "CLASS_TEACHER_ASSIGNED", "sections", sec.id, { section: sec.name, teacher: tr.profiles.full_name, previous: sec.class_teacher_id });
      revalidatePeople();
      return ok(undefined, `${tr.profiles.full_name} is class teacher of Section ${sec.name}.`);
    }
    const { error } = await admin.from("sections").update({ class_teacher_id: null }).eq("id", sec.id);
    if (error) return fail(error.message);
    await audit(me.id, "CLASS_TEACHER_REMOVED", "sections", sec.id, { section: sec.name, previous: sec.class_teacher_id });
    revalidatePeople();
    return ok(undefined, `Section ${sec.name} has no class teacher now. You approve its new students until one is assigned.`);
  });
}
