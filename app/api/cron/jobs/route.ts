import { NextResponse, type NextRequest } from "next/server";
import { runScheduledJobs } from "@/lib/server/jobs";

/**
 * Scheduled job endpoint. Vercel Cron calls it (see vercel.json) with
 * "Authorization: Bearer <CRON_SECRET>". Any other caller gets 401.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScheduledJobs(new Date());
  return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}
