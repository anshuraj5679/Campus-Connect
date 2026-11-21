"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/config";
import { SIM_TIME_COOKIE } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { runScheduledJobs } from "@/lib/server/jobs";
import { fail, ok, type ActionResult } from "@/lib/server/action";

/** Pin (or clear) the app clock for this browser. Demo mode only. */
export async function setSimulatedTime(iso: string | null): Promise<ActionResult> {
  if (!isDemoMode) return fail("Simulated time is available only in demo mode.");
  await requireUser();
  const store = await cookies();
  if (!iso) {
    store.delete(SIM_TIME_COOKIE);
  } else {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fail("Invalid date/time.");
    store.set(SIM_TIME_COOKIE, d.toISOString(), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 12 });
  }
  revalidatePath("/", "layout");
  return ok();
}

/**
 * Run the SLA auto-escalation + auto-close job now (instead of waiting for
 * the cron), using the simulated clock. Admin, or anyone in demo mode.
 */
export async function runJobsNow(): Promise<ActionResult<{ escalated: number; closed: number }>> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && !isDemoMode) return fail("Only the administrator can run scheduled jobs.");
  const { getNow } = await import("@/lib/datetime");
  const result = await runScheduledJobs(await getNow());
  revalidatePath("/", "layout");
  return ok(result, `Escalated ${result.escalated}, closed ${result.closed}.`);
}
