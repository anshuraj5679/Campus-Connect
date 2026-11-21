import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PeriodSlot } from "@/lib/services/periods";
import type { CalendarSettings, Holiday, SaturdayRule } from "@/lib/services/time";

export type CollegeSettings = CalendarSettings & {
  academicYear: string;
  semesterType: "ODD" | "EVEN";
  slaWorkingDays: number;
};

export type Calendar = {
  settings: CollegeSettings;
  periods: PeriodSlot[];
  holidays: (Holiday & { id: string })[];
};

/**
 * College calendar (settings, period slots, holidays). This is non-sensitive
 * reference data, read once per request with the service client so it also
 * works on public pages (sign-up) and in scheduled jobs.
 */
export const getCalendar = cache(async (): Promise<Calendar> => {
  const admin = createAdminClient();
  const [settingsRes, periodsRes, holidaysRes] = await Promise.all([
    admin.from("college_settings").select("*").eq("id", 1).single(),
    admin.from("period_slots").select("*").order("sort_order"),
    admin.from("holidays").select("id, date, name").order("date"),
  ]);
  const s = settingsRes.data;
  return {
    settings: {
      workingDays: s?.working_days ?? [1, 2, 3, 4, 5, 6],
      saturdayRule: (s?.saturday_rule ?? "SECOND_FOURTH_OFF") as SaturdayRule,
      collegeStart: (s?.college_start ?? "09:00").slice(0, 5),
      collegeEnd: (s?.college_end ?? "16:30").slice(0, 5),
      academicYear: s?.academic_year ?? "2026-27",
      semesterType: s?.semester_type ?? "ODD",
      slaWorkingDays: s?.sla_working_days ?? 5,
    },
    periods: (periodsRes.data ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      periodNo: p.period_no,
      start: p.start_time.slice(0, 5),
      end: p.end_time.slice(0, 5),
      isBreak: p.is_break,
      sortOrder: p.sort_order,
    })),
    holidays: (holidaysRes.data ?? []).map((h) => ({ id: h.id, date: h.date, name: h.name })),
  };
});
