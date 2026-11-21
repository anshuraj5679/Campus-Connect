import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Append an entry to the admin audit log. Never throws (auditing must not break the action). */
export async function audit(actorId: string | null, action: string, entity: string, entityId: string | null, meta: Record<string, unknown> = {}) {
  const { error } = await createAdminClient().from("audit_logs").insert({ actor_id: actorId, action, entity, entity_id: entityId, meta });
  if (error) console.error("audit failed:", error.message);
}
