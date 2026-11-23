"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { isDemoMode } from "@/lib/config";
import { changePasswordSchema, loginSchema, safeNextPath, staffSignupSchema, studentSignupSchema } from "@/lib/validators/auth";
import { DEMO_ACCOUNTS, getDemoPassword } from "./demo";
import { notify } from "@/lib/server/notify";
import { studentApprover } from "@/lib/data/people";
import { canAccessPath, homeForRole, isRole, type Role } from "./roles";

export type AuthActionResult = { error: string } | undefined;

async function signInAndRoute(email: string, password: string, next: string | null): Promise<AuthActionResult> {
  if (!isSupabaseConfigured) {
    return { error: "Supabase is not configured. Add the keys to .env.local (see README)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // Same message for unknown email and wrong password (no account enumeration).
    return { error: "Incorrect email or password." };
  }

  const { data: profile } = await supabase.from("profiles").select("role, is_active, rejected_at").eq("id", data.user.id).maybeSingle();

  if (!profile || !isRole(profile.role)) {
    await supabase.auth.signOut();
    return { error: "Your account is not set up yet. Please contact the college office." };
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return {
      error: profile.rejected_at
        ? "Your registration was not approved. If this is a mistake, contact your class teacher or Cluster Head."
        : "Your account has been deactivated. Please contact the college office.",
    };
  }

  const role: Role = profile.role;
  const destination = next && canAccessPath(role, next) ? next : homeForRole(role);
  redirect(destination);
}

export async function signInAction(input: unknown, next?: string): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  return signInAndRoute(parsed.data.email, parsed.data.password, safeNextPath(next));
}

export async function demoSignInAction(role: Role): Promise<AuthActionResult> {
  if (!isDemoMode) return { error: "Demo accounts are disabled." };
  const account = DEMO_ACCOUNTS.find((a) => a.role === role);
  if (!account) return { error: "Unknown demo account." };

  const result = await signInAndRoute(account.email, getDemoPassword(), null);
  if (result?.error === "Incorrect email or password.") {
    return { error: "Demo account not found. Run `npm run seed` first." };
  }
  return result;
}

type Admin = ReturnType<typeof createAdminClient>;

/** Existing cluster of a department by (case-insensitive) name, or create it. Safe under concurrent sign-ups. */
async function findOrCreateCluster(admin: Admin, departmentId: string, name: string) {
  const find = () =>
    admin
      .from("clusters")
      .select("id, name, cluster_head_id, head:profiles!clusters_cluster_head_id_fkey(full_name)")
      .eq("department_id", departmentId)
      .ilike("name", name)
      .maybeSingle();
  const { data: found } = await find();
  if (found) return { cluster: found as any, created: false };
  const { error } = await admin.from("clusters").insert({ department_id: departmentId, name });
  if (error && error.code !== "23505") throw new Error(error.message); // 23505: created meanwhile by someone else
  const { data: again } = await find();
  return { cluster: again as any, created: !error };
}

/**
 * Self-service sign-up for every role except Admin. Clusters and sections are
 * TYPED by the user and created automatically the first time they are used:
 *  - STUDENT      department + section (e.g. 5J) + cluster (e.g. 3). A section that
 *                 already exists must be given with its own cluster.
 *  - TEACHER      department + cluster
 *  - CLUSTER_HEAD department + cluster; only if that cluster has no Cluster Head yet
 *  - HOD          department; only if that department has no HOD yet
 * Head seats are claimed atomically (UPDATE … WHERE head IS NULL), so two people
 * can never head the same cluster/department. The role is written to
 * app_metadata by the server, never taken from user-editable metadata.
 */
export async function signupAction(input: unknown): Promise<AuthActionResult> {
  if (!isSupabaseConfigured) return { error: "Supabase is not configured." };
  const role = (input as { role?: string })?.role;
  const parsed = role === "STUDENT" ? studentSignupSchema.safeParse(input) : staffSignupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const v = parsed.data;

  const admin = createAdminClient();

  const { data: existing } = await admin.from("profiles").select("id").ilike("email", v.email).maybeSingle();
  if (existing) return { error: "An account with this email already exists. Please sign in." };

  const { data: dept } = await admin.from("departments").select("code, hod_id, hod:profiles!departments_hod_id_fkey(full_name)").eq("id", v.departmentId).maybeSingle();
  if (!dept) return { error: "Choose a valid department." };

  // ---- Pre-checks + resolve (or create) the typed cluster / section ----
  let sectionId: string | null = null;
  let clusterId: string | null = null;

  if (v.role === "STUDENT") {
    const { data: usnTaken } = await admin.from("student_profiles").select("user_id").eq("usn", v.usn).maybeSingle();
    if (usnTaken) return { error: "This USN is already registered." };

    const { data: section } = await admin
      .from("sections")
      .select("id, cluster_id, clusters(name)")
      .eq("department_id", v.departmentId)
      .eq("name", v.section)
      .maybeSingle();
    if (section) {
      const actual = (section as any).clusters?.name as string;
      if (actual.toLowerCase() !== v.cluster.toLowerCase()) {
        return { error: `Section ${dept.code} ${v.section} already belongs to ${actual}. Please check your cluster.` };
      }
      sectionId = section.id;
      clusterId = section.cluster_id;
    } else {
      const { cluster } = await findOrCreateCluster(admin, v.departmentId, v.cluster);
      clusterId = cluster.id;
      const { error } = await admin.from("sections").insert({ department_id: v.departmentId, cluster_id: cluster.id, semester: Number(v.section[0]), name: v.section });
      if (error && error.code !== "23505") return { error: "Could not create your section. Please try again." };
      const { data: created } = await admin.from("sections").select("id, cluster_id").eq("department_id", v.departmentId).eq("name", v.section).maybeSingle();
      if (!created) return { error: "Could not create your section. Please try again." };
      if (created.cluster_id !== cluster.id) return { error: `Section ${dept.code} ${v.section} was just registered under another cluster. Please check your cluster.` };
      sectionId = created.id;
    }
  } else {
    const { data: empTaken } = await admin.from("teacher_profiles").select("user_id").eq("employee_id", v.employeeId).maybeSingle();
    if (empTaken) return { error: "This employee ID is already registered." };

    if (v.role === "HOD" && dept.hod_id) {
      return { error: `${dept.code} already has an HOD (${(dept as any).hod?.full_name ?? "assigned"}). Only one HOD is allowed per department.` };
    }
    if (v.role !== "HOD") {
      // Check a Cluster Head seat before creating anything
      const { data: existingCluster } = await admin
        .from("clusters")
        .select("id, cluster_head_id, head:profiles!clusters_cluster_head_id_fkey(full_name)")
        .eq("department_id", v.departmentId)
        .ilike("name", v.cluster)
        .maybeSingle();
      if (v.role === "CLUSTER_HEAD" && existingCluster?.cluster_head_id) {
        return { error: `${dept.code} ${v.cluster} already has a Cluster Head (${(existingCluster as any).head?.full_name ?? "assigned"}). Only one Cluster Head is allowed per cluster.` };
      }
      clusterId = existingCluster?.id ?? (await findOrCreateCluster(admin, v.departmentId, v.cluster)).cluster.id;
    }
  }

  // ---- Create the account ----
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
    app_metadata: { role: v.role },
    user_metadata: { full_name: v.fullName },
  });
  if (createError || !created.user) {
    return { error: createError?.message.includes("already") ? "An account with this email already exists." : "Could not create the account. Please try again." };
  }
  const userId = created.user.id;
  const rollback = async (message: string): Promise<AuthActionResult> => {
    await admin.auth.admin.deleteUser(userId);
    return { error: message };
  };

  if (v.role === "STUDENT") {
    const { error } = await admin
      .from("student_profiles")
      .insert({ user_id: userId, usn: v.usn, section_id: sectionId, batch_year: 2000 + Number(v.usn.slice(3, 5)) });
    if (error) return rollback("Could not save your college details. Please try again.");
  } else {
    const { error } = await admin.from("teacher_profiles").insert({
      user_id: userId,
      employee_id: v.employeeId,
      designation: v.designation,
      department_id: v.departmentId,
      cluster_id: v.role === "HOD" ? null : clusterId,
    });
    if (error) return rollback("Could not save your college details. Please try again.");

    // Atomic claim of the head position: succeeds only if still vacant.
    if (v.role === "HOD") {
      const { data: claimed } = await admin.from("departments").update({ hod_id: userId }).eq("id", v.departmentId).is("hod_id", null).select("id");
      if (!claimed?.length) return rollback("This department already has an HOD. Only one HOD is allowed per department.");
    }
    if (v.role === "CLUSTER_HEAD") {
      const { data: claimed } = await admin.from("clusters").update({ cluster_head_id: userId }).eq("id", clusterId!).is("cluster_head_id", null).select("id");
      if (!claimed?.length) return rollback("This cluster already has a Cluster Head. Only one Cluster Head is allowed per cluster.");
    }
    await admin.from("availability_preferences").insert({ teacher_id: userId, accepting_meetings: true });
  }

  await admin.from("profiles").update({ full_name: v.fullName }).eq("id", userId);
  await notifyApprover(admin, v.role, userId, v.fullName, { sectionId: v.role === "STUDENT" ? sectionId : null, clusterId, departmentId: v.departmentId });
  return signInAndRoute(v.email, v.password, null);
}

/**
 * Tell whoever approves the new account: class teacher (or Cluster Head) for a
 * student, Cluster Head for a teacher, HOD for a Cluster Head.
 */
async function notifyApprover(
  admin: ReturnType<typeof createAdminClient>,
  role: string,
  userId: string,
  name: string,
  where: { sectionId: string | null; clusterId: string | null; departmentId: string },
) {
  try {
    if (role === "STUDENT" && where.sectionId) {
      const approver = await studentApprover(where.sectionId);
      const { data: sp } = await admin.from("student_profiles").select("usn, section").eq("user_id", userId).maybeSingle();
      if (approver)
        await notify([approver.id], {
          type: "ACCOUNT_APPROVAL_REQUEST",
          title: `New student in Section ${sp?.section ?? ""}: ${name}`,
          body: `${name} (${sp?.usn ?? ""}) signed up and is waiting for your approval.`,
          link: approver.role === "CLASS_TEACHER" ? "/teacher/my-section?status=PENDING" : "/cluster-head/people?status=PENDING#students",
        });
    } else if (role === "TEACHER" && where.clusterId) {
      const { data: c } = await admin.from("clusters").select("cluster_head_id, name").eq("id", where.clusterId).maybeSingle();
      if (c?.cluster_head_id)
        await notify([c.cluster_head_id], { type: "ACCOUNT_APPROVAL_REQUEST", title: `New teacher in ${c.name}: ${name}`, body: `${name} signed up for your cluster and is waiting for your approval.`, link: "/cluster-head/people#teachers" });
    } else if (role === "CLUSTER_HEAD") {
      const { data: d } = await admin.from("departments").select("hod_id").eq("id", where.departmentId).maybeSingle();
      if (d?.hod_id) await notify([d.hod_id], { type: "ACCOUNT_APPROVAL_REQUEST", title: `New Cluster Head: ${name}`, body: `${name} signed up as a Cluster Head and is waiting for approval.`, link: "/hod/clusters" });
    }
  } catch (err) {
    console.error("notifyApprover", err); // never block sign-up on a notification
  }
}

/** Change the signed-in user's password after re-checking the current one. */
export async function changePasswordAction(input: unknown): Promise<{ ok: true } | { error: string }> {
  if (!isSupabaseConfigured) return { error: "Supabase is not configured." };
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return { error: "Please sign in again." };
  // Verify the current password with a throwaway client (does not touch this session's cookies)
  const { createClient: createPlainClient } = await import("@supabase/supabase-js");
  const { supabaseUrl, supabaseAnonKey } = await import("@/lib/env");
  const verifier = createPlainClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { error: wrong } = await verifier.auth.signInWithPassword({ email: auth.user.email, password: parsed.data.currentPassword });
  if (wrong) return { error: "Your current password is incorrect." };
  await verifier.auth.signOut();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function signOutAction() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
