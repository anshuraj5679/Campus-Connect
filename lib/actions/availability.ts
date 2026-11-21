"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { rolesForPath } from "@/lib/auth/roles";
import { getCalendar } from "@/lib/data/calendar";
import { getNow } from "@/lib/datetime";
import { overrideSchema, preferenceSchema, unavailabilitySchema } from "@/lib/validators/timetable";
import { addDaysToDate, istDateTime, istParts } from "@/lib/services/time";
import { slotForPeriod, sortSlots } from "@/lib/services/periods";
import { fail, guard, ok, parse, type ActionResult } from "@/lib/server/action";
import { notify } from "@/lib/server/notify";
import { audit } from "@/lib/server/audit";
import { fmtDate, fmtTime } from "@/lib/format";

const teacherRoles = () => rolesForPath("/teacher")!;

export async function updateMeetingPreference(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireRole(teacherRoles());
    const p = parse(preferenceSchema, input);
    if ("error" in p) return fail(p.error);
    // Runs as the teacher: RLS only allows writing their own row, and the column
    // grants allow updating only accepting_meetings/note (an upsert would also
    // rewrite teacher_id, which is deliberately not updatable). So: update, else insert.
    const supabase = await createClient();
    const values = { accepting_meetings: p.data.acceptingMeetings, note: p.data.note || null };
    const { data: updated, error } = await supabase.from("availability_preferences").update(values).eq("teacher_id", user.id).select("teacher_id");
    if (error) return fail(error.message);
    if (!updated?.length) {
      const { error: insertError } = await supabase.from("availability_preferences").insert({ teacher_id: user.id, ...values });
      if (insertError) return fail(insertError.message);
    }
    revalidatePath("/teacher");
    return ok(undefined, p.data.acceptingMeetings ? "You are accepting meetings." : "Meetings turned off.");
  });
}

/** Converts the form into one or more [start, end) intervals (custom periods → one per contiguous run). */
async function intervalsFor(v: z.infer<typeof unavailabilitySchema>) {
  const { settings, periods } = await getCalendar();
  const slots = sortSlots(periods);
  const breaks = slots.filter((s) => s.isBreak);
  const lunch = breaks.find((b) => /lunch/i.test(b.label)) ?? [...breaks].sort((a, b) => (b.end > a.end ? 1 : -1))[0];
  const day0 = (d: string) => istDateTime(d, "00:00");

  switch (v.type) {
    case "FULL_DAY":
      return [{ start: day0(v.date), end: day0(addDaysToDate(v.date, 1)), periods: null as number[] | null }];
    case "DATE_RANGE":
      return [{ start: day0(v.date), end: day0(addDaysToDate(v.endDate!, 1)), periods: null }];
    case "HALF_DAY":
      return v.half === "FN"
        ? [{ start: istDateTime(v.date, settings.collegeStart), end: istDateTime(v.date, lunch?.start ?? "13:00"), periods: null }]
        : [{ start: istDateTime(v.date, lunch?.end ?? "13:45"), end: istDateTime(v.date, settings.collegeEnd), periods: null }];
    case "CUSTOM_PERIODS": {
      const chosen = [...new Set(v.periods!)].sort((a, b) => a - b);
      const runs: number[][] = [];
      for (const p of chosen) {
        const last = runs[runs.length - 1];
        if (last && last[last.length - 1] === p - 1) last.push(p);
        else runs.push([p]);
      }
      return runs
        .map((run) => {
          const a = slotForPeriod(periods, run[0]);
          const b = slotForPeriod(periods, run[run.length - 1]);
          return a && b ? { start: istDateTime(v.date, a.start), end: istDateTime(v.date, b.end), periods: run } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    }
  }
}

/**
 * "Mark Unavailability": a status update, not an HR leave application.
 * Takes effect immediately; students of affected sections and the Cluster
 * Head are notified. The reason stays private (teacher, CH, HOD, admin).
 */
export async function markUnavailability(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireRole(teacherRoles());
    const p = parse(unavailabilitySchema, input);
    if ("error" in p) return fail(p.error);
    const v = p.data;
    const now = await getNow();
    const intervals = await intervalsFor(v);
    if (!intervals.length) return fail("Choose valid periods.");
    if (intervals.every((i) => i.end <= now)) return fail("That time is already over. Choose a current or future time.");

    const admin = createAdminClient();
    const { error } = await admin.from("teacher_unavailability").insert(
      intervals.map((i) => ({
        teacher_id: user.id,
        type: v.type,
        half: v.type === "HALF_DAY" ? v.half : null,
        periods: i.periods,
        start_at: i.start.toISOString(),
        end_at: i.end.toISOString(),
        reason_private: v.reason || null,
      })),
    );
    if (error) return fail(error.message);

    // Who is affected: sections the teacher teaches inside the interval(s)
    const start = intervals[0].start;
    const end = intervals[intervals.length - 1].end;
    const { periods } = await getCalendar();
    const { data: version } = await admin.from("timetable_versions").select("id").eq("teacher_id", user.id).eq("status", "PUBLISHED").maybeSingle();
    const affectedSections = new Set<string>();
    if (version) {
      const { data: entries } = await admin.from("timetable_entries").select("day_of_week, start_period, end_period, section_id").eq("version_id", version.id);
      for (let d = istParts(start).date, guardDays = 0; d <= istParts(new Date(end.getTime() - 1)).date && guardDays < 62; d = addDaysToDate(d, 1), guardDays++) {
        const isoDay = istParts(istDateTime(d, "12:00")).isoDay;
        for (const e of entries ?? []) {
          if (e.day_of_week !== isoDay || !e.section_id) continue;
          const a = slotForPeriod(periods, e.start_period);
          const b = slotForPeriod(periods, e.end_period);
          if (!a || !b) continue;
          if (intervals.some((i) => i.start < istDateTime(d, b.end) && i.end > istDateTime(d, a.start))) affectedSections.add(e.section_id);
        }
      }
    }

    const when =
      v.type === "FULL_DAY" ? `on ${fmtDate(start)}`
      : v.type === "DATE_RANGE" ? `from ${fmtDate(start)} to ${fmtDate(new Date(end.getTime() - 1))}`
      : v.type === "HALF_DAY" ? `on ${fmtDate(start)} (${v.half === "FN" ? "forenoon" : "afternoon"})`
      : `on ${fmtDate(start)}, ${fmtTime(start)}–${fmtTime(end)}`;

    if (affectedSections.size) {
      const { data: students } = await admin.from("student_profiles").select("user_id").in("section_id", [...affectedSections]);
      await notify((students ?? []).map((s) => s.user_id), {
        type: "TEACHER_UNAVAILABLE",
        title: `${user.fullName} is unavailable ${when}`,
        body: "Affected classes are marked 'Teacher unavailable' in your timetable.",
        link: `/teachers/${user.id}`,
      });
    }
    const { data: tp } = await admin.from("teacher_profiles").select("cluster_id, department_id, clusters(cluster_head_id)").eq("user_id", user.id).maybeSingle();
    const chId = (tp as any)?.clusters?.cluster_head_id as string | undefined;
    if (chId && chId !== user.id) {
      await notify([chId], {
        type: "TEACHER_UNAVAILABLE",
        title: `${user.fullName} marked unavailability ${when}`,
        body: `${affectedSections.size} section(s) affected. Reason is visible to you on the Cluster Teachers page.`,
        link: "/cluster-head/teachers",
      });
    }
    await audit(user.id, "UNAVAILABILITY_MARKED", "teacher_unavailability", user.id, { type: v.type, start: start.toISOString(), end: end.toISOString(), sections: affectedSections.size });
    revalidatePath("/teacher", "layout");
    revalidatePath("/teachers", "layout");
    return ok(undefined, `Marked unavailable ${when}. ${affectedSections.size} section(s) notified.`);
  });
}

export async function cancelUnavailability(id: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireRole(teacherRoles());
    if (!z.uuid().safeParse(id).success) return fail("Invalid entry.");
    const now = await getNow();
    const admin = createAdminClient();
    const { data: row } = await admin.from("teacher_unavailability").select("id, teacher_id, end_at, cancelled_at").eq("id", id).maybeSingle();
    if (!row || row.teacher_id !== user.id) return fail("You can cancel only your own unavailability.");
    if (row.cancelled_at) return fail("Already cancelled.");
    if (new Date(row.end_at) <= now) return fail("Past unavailability cannot be cancelled.");
    const { error } = await admin.from("teacher_unavailability").update({ cancelled_at: now.toISOString() }).eq("id", id);
    if (error) return fail(error.message);
    await audit(user.id, "UNAVAILABILITY_CANCELLED", "teacher_unavailability", id);
    revalidatePath("/teacher", "layout");
    return ok(undefined, "Unavailability cancelled. Your status is back to normal.");
  });
}

export async function addScheduleOverride(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireRole(teacherRoles());
    const p = parse(overrideSchema, input);
    if ("error" in p) return fail(p.error);
    const v = p.data;
    if (v.kind !== "CANCELLED" && !v.subjectName) return fail("Enter the subject for the extra class.");
    const admin = createAdminClient();
    const { error } = await admin.from("schedule_overrides").upsert(
      {
        teacher_id: user.id,
        date: v.date,
        period: v.period,
        kind: v.kind,
        subject_name: v.subjectName || null,
        section_id: v.sectionId || null,
        room: v.room || null,
        details: v.details || null,
      },
      { onConflict: "teacher_id,date,period" },
    );
    if (error) return fail(error.message);
    if (v.sectionId) {
      const { data: students } = await admin.from("student_profiles").select("user_id").eq("section_id", v.sectionId);
      await notify((students ?? []).map((s) => s.user_id), {
        type: "TIMETABLE_PUBLISHED",
        title: v.kind === "CANCELLED" ? `Class cancelled: P${v.period} on ${fmtDate(istDateTime(v.date, "12:00"))}` : `Extra class: ${v.subjectName}, P${v.period} on ${fmtDate(istDateTime(v.date, "12:00"))}`,
        body: `By ${user.fullName}${v.room ? ` · Room ${v.room}` : ""}`,
        link: `/teachers/${user.id}`,
      });
    }
    revalidatePath("/teacher", "layout");
    return ok(undefined, v.kind === "CANCELLED" ? "Class marked as cancelled." : "Extra class added.");
  });
}

export async function deleteScheduleOverride(id: string): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireRole(teacherRoles());
    if (!z.uuid().safeParse(id).success) return fail("Invalid entry.");
    const admin = createAdminClient();
    const { error, count } = await admin.from("schedule_overrides").delete({ count: "exact" }).eq("id", id).eq("teacher_id", user.id);
    if (error) return fail(error.message);
    if (!count) return fail("Not found.");
    revalidatePath("/teacher", "layout");
    return ok(undefined, "Class change removed.");
  });
}
