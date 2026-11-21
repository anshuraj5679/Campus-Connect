import "server-only";
import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { isDemoMode, siteConfig } from "@/lib/config";

const TZ = siteConfig.timeZone;
export const SIM_TIME_COOKIE = "cc_sim_time";

/**
 * Single source of "now" for every screen and service.
 * In demo mode an evaluator can pin the clock with the "Simulate time"
 * control (stored in a cookie), to watch In Class → Available → On Leave.
 */
export async function getNow(): Promise<Date> {
  if (isDemoMode) {
    const value = (await cookies()).get(SIM_TIME_COOKIE)?.value;
    if (value) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

export async function isTimeSimulated(): Promise<boolean> {
  return isDemoMode && Boolean((await cookies()).get(SIM_TIME_COOKIE)?.value);
}

export function formatIST(date: Date, pattern: string): string {
  return formatInTimeZone(date, TZ, pattern);
}

export function greetingFor(date: Date): string {
  const hour = Number(formatInTimeZone(date, TZ, "H"));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function formatLongDate(date: Date): string {
  return formatIST(date, "EEEE, d MMMM yyyy");
}
