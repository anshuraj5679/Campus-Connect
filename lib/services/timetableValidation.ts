/**
 * Validation run before a timetable is published (spec §3.1).
 *  - error   : blocks publishing (teacher double-booked, invalid period, unreviewed OCR cell…)
 *  - warning : shown, does not block (room or section clash with another teacher)
 */
import type { ClassType } from "./availability";
import { spanLabel } from "./periods";

export type DraftEntry = {
  id: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  subjectCode: string | null;
  subjectName: string;
  sectionId: string | null;
  section: string | null;
  semester: number | null;
  room: string | null;
  type: ClassType;
  lowConfidence?: boolean;
  /** Section routines name the teacher instead of a section. */
  teacherId?: string | null;
  teacherName?: string | null;
};

/** Published entries of OTHER teachers, used for room / section clash checks. */
export type OtherEntry = DraftEntry & { teacherName: string };

export type Issue = {
  severity: "error" | "warning";
  code: "TEACHER_OVERLAP" | "INVALID_PERIOD" | "MISSING_SECTION" | "NEEDS_REVIEW" | "ROOM_CLASH" | "SECTION_CLASH" | "EMPTY";
  message: string;
  entryIds: string[];
};

export const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function overlaps(a: DraftEntry, b: DraftEntry) {
  return a.dayOfWeek === b.dayOfWeek && a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod;
}

const where = (e: DraftEntry) => `${DAY_NAMES[e.dayOfWeek]} ${spanLabel(e.startPeriod, e.endPeriod)}`;
const needsSection = (t: ClassType) => t === "THEORY" || t === "LAB" || t === "TUTORIAL";
const normRoom = (r: string | null) => (r ?? "").replace(/\s+/g, "").toUpperCase();

export function validateTimetable(
  entries: DraftEntry[],
  ctx: { validPeriods: number[]; otherEntries: OtherEntry[]; /** false for section routines */ requireSection?: boolean },
): Issue[] {
  const requireSection = ctx.requireSection ?? true;
  const issues: Issue[] = [];
  const valid = new Set(ctx.validPeriods);

  if (entries.length === 0) {
    issues.push({ severity: "error", code: "EMPTY", message: "The timetable has no classes yet.", entryIds: [] });
  }

  for (const e of entries) {
    if (!valid.has(e.startPeriod) || !valid.has(e.endPeriod) || e.endPeriod < e.startPeriod || e.dayOfWeek < 1 || e.dayOfWeek > 6) {
      issues.push({ severity: "error", code: "INVALID_PERIOD", message: `${e.subjectName}: invalid day or period (${where(e)}).`, entryIds: [e.id] });
    }
    if (requireSection && needsSection(e.type) && !e.sectionId) {
      issues.push({ severity: "error", code: "MISSING_SECTION", message: `${e.subjectName} (${where(e)}) needs a section.`, entryIds: [e.id] });
    }
  }

  const unreviewed = entries.filter((e) => e.lowConfidence);
  if (unreviewed.length) {
    issues.push({
      severity: "error",
      code: "NEEDS_REVIEW",
      message: `${unreviewed.length} scanned cell${unreviewed.length > 1 ? "s" : ""} still need review (highlighted in yellow).`,
      entryIds: unreviewed.map((e) => e.id),
    });
  }

  // Teacher overlap inside this timetable
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (overlaps(entries[i], entries[j])) {
        issues.push({
          severity: "error",
          code: "TEACHER_OVERLAP",
          message: `${entries[i].subjectName} and ${entries[j].subjectName} overlap on ${where(entries[i])}.`,
          entryIds: [entries[i].id, entries[j].id],
        });
      }
    }
  }

  // Room and section clashes with other teachers' published timetables
  for (const e of entries) {
    for (const o of ctx.otherEntries) {
      if (!overlaps(e, o)) continue;
      if (e.room && normRoom(e.room) === normRoom(o.room)) {
        issues.push({
          severity: "warning",
          code: "ROOM_CLASH",
          message: `Room ${e.room} is also booked by ${o.teacherName} on ${where(o)}.`,
          entryIds: [e.id],
        });
      }
      if (e.sectionId && e.sectionId === o.sectionId) {
        issues.push({
          severity: "warning",
          code: "SECTION_CLASH",
          message: `${e.section ?? "This section"} already has ${o.subjectName} with ${o.teacherName} on ${where(o)}.`,
          entryIds: [e.id],
        });
      }
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: Issue[]) {
  return issues.some((i) => i.severity === "error");
}

export function summarize(entries: DraftEntry[]) {
  const labs = entries.filter((e) => e.type === "LAB").length;
  const periods = entries.reduce((n, e) => n + (e.endPeriod - e.startPeriod + 1), 0);
  return { classes: entries.length, labs, theory: entries.length - labs, periods };
}
