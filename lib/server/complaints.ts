import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RoutingDirectory, HandlerLevel } from "@/lib/services/complaintRouting";
import type { ComplaintStatus } from "@/lib/services/complaintWorkflow";

type Admin = ReturnType<typeof createAdminClient>;

/** Who heads what, used by the routing service. */
export async function buildDirectory(admin: Admin): Promise<RoutingDirectory> {
  const [clusters, departments, admins] = await Promise.all([
    admin.from("clusters").select("id, cluster_head_id"),
    admin.from("departments").select("id, hod_id"),
    admin.from("profiles").select("id").eq("role", "ADMIN").eq("is_active", true).order("created_at").limit(1),
  ]);
  const ch = new Map((clusters.data ?? []).map((c) => [c.id, c.cluster_head_id as string | null]));
  const hod = new Map((departments.data ?? []).map((d) => [d.id, d.hod_id as string | null]));
  return {
    clusterHeadOf: (id) => ch.get(id) ?? null,
    hodOf: (id) => hod.get(id) ?? null,
    adminId: admins.data?.[0]?.id ?? null,
  };
}

export async function addHistory(
  admin: Admin,
  row: {
    complaintId: string;
    actorId: string | null;
    action: string;
    fromStatus?: ComplaintStatus | null;
    toStatus?: ComplaintStatus | null;
    remark?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("complaint_history").insert({
    complaint_id: row.complaintId,
    actor_id: row.actorId,
    action: row.action,
    from_status: row.fromStatus ?? null,
    to_status: row.toStatus ?? null,
    remark: row.remark ?? null,
    meta: row.meta ?? {},
  });
  if (error) throw new Error(`Could not write timeline: ${error.message}`);
}

export const LEVEL_LABEL: Record<HandlerLevel, string> = {
  CLUSTER_HEAD: "Cluster Head",
  HOD: "HOD",
  ADMIN: "Administrator",
};

export function complaintLink(code: string) {
  return `/complaints/${code}`;
}
