import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  computeTeacherStatus,
  findNextClass,
  type ScheduleOverride,
  type TeacherStatus,
  type TimetableEntry,
  type Unavailability,
  type ClassOccurrence,
} from "@/lib/services/availability";
import { addDaysToDate, istParts } from "@/lib/services/time";
import { getCalendar } from "./calendar";

export function mapEntry(r: any): TimetableEntry {
  return {
    id: r.id,
    dayOfWeek: r.day_of_week,
    startPeriod: r.start_period,
    endPeriod: r.end_period,
    subjectCode: r.subject_code,
    subjectName: r.subject_name,
    sectionId: r.section_id,
    semester: r.semester,
    section: r.section,
    room: r.room,
    type: r.type,
  };
}

export type TeacherAvailability = {
  status: TeacherStatus;
  next: ClassOccurrence | null;
  entries: TimetableEntry[] | null;
  leaves: (Unavailability & { type: string; half: string | null })[];
  overrides: ScheduleOverride[];
  acceptingMeetings: boolean;
  meetingNote: string | null;
};

/**
 * Loads everything the availability engine needs for a set of teachers in
 * five queries, then computes each teacher's status at `at`.
 */
export async function getAvailability(teacherIds: string[], at: Date): Promise<Map<string, TeacherAvailability>> {
  const result = new Map<string, TeacherAvailability>();
  if (teacherIds.length === 0) return result;

  const supabase = await createClient();
  const calendar = await getCalendar();
  const today = istParts(at).date;
  const horizon = addDaysToDate(today, 15);

  const [versionsRes, leavesRes, overridesRes, prefsRes] = await Promise.all([
    supabase.from("timetable_versions").select("id, teacher_id").eq("status", "PUBLISHED").in("teacher_id", teacherIds),
    supabase
      .from("teacher_unavailability")
      .select("id, teacher_id, type, half, start_at, end_at, cancelled_at")
      .in("teacher_id", teacherIds)
      .is("cancelled_at", null)
      .gt("end_at", new Date(at.getTime() - 86_400_000).toISOString())
      .lt("start_at", `${horizon}T00:00:00+05:30`),
    supabase
      .from("schedule_overrides")
      .select("teacher_id, date, period, kind, subject_name, room, sections(name)")
      .in("teacher_id", teacherIds)
      .gte("date", today)
      .lte("date", horizon),
    supabase.from("availability_preferences").select("teacher_id, accepting_meetings, note").in("teacher_id", teacherIds),
  ]);

  const versionByTeacher = new Map((versionsRes.data ?? []).map((v) => [v.teacher_id, v.id]));
  const versionIds = [...versionByTeacher.values()];
  const entriesRes = versionIds.length
    ? await supabase.from("timetable_entries").select("*").in("version_id", versionIds)
    : { data: [] as any[] };

  const entriesByVersion = new Map<string, TimetableEntry[]>();
  for (const r of entriesRes.data ?? []) {
    const list = entriesByVersion.get(r.version_id) ?? [];
    list.push(mapEntry(r));
    entriesByVersion.set(r.version_id, list);
  }

  for (const id of teacherIds) {
    const versionId = versionByTeacher.get(id);
    const entries = versionId ? (entriesByVersion.get(versionId) ?? []) : null;
    const leaves = (leavesRes.data ?? [])
      .filter((l) => l.teacher_id === id)
      .map((l) => ({
        id: l.id,
        type: l.type,
        half: l.half,
        startAt: new Date(l.start_at),
        endAt: new Date(l.end_at),
        cancelledAt: l.cancelled_at ? new Date(l.cancelled_at) : null,
      }));
    const overrides: ScheduleOverride[] = (overridesRes.data ?? [])
      .filter((o) => o.teacher_id === id)
      .map((o: any) => ({ date: o.date, period: o.period, kind: o.kind, subjectName: o.subject_name, room: o.room, section: o.sections?.name ?? null }));
    const pref = (prefsRes.data ?? []).find((p) => p.teacher_id === id);
    const acceptingMeetings = pref?.accepting_meetings ?? true;

    const input = {
      at,
      settings: calendar.settings,
      periods: calendar.periods,
      holidays: calendar.holidays,
      leaves,
      overrides,
      entries,
      acceptingMeetings,
    };
    result.set(id, {
      status: computeTeacherStatus(input),
      next: entries ? findNextClass(input) : null,
      entries,
      leaves,
      overrides,
      acceptingMeetings,
      meetingNote: pref?.note ?? null,
    });
  }
  return result;
}
