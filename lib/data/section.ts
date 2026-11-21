import "server-only";
import { createClient } from "@/lib/supabase/server";
import { mapEntry } from "./availability";
import type { TimetableEntry } from "@/lib/services/availability";

export type SectionEntry = TimetableEntry & { teacherId: string; teacherName: string };

/** All published classes of a section (every teacher), with teacher names. */
export async function getSectionSchedule(sectionId: string): Promise<SectionEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("timetable_entries")
    .select("*, timetable_versions!inner(status), profiles!timetable_entries_teacher_id_fkey(full_name)")
    .eq("section_id", sectionId)
    .eq("timetable_versions.status", "PUBLISHED");
  return (data ?? []).map((r: any) => ({ ...mapEntry(r), teacherId: r.teacher_id, teacherName: r.profiles?.full_name ?? "Teacher" }));
}
