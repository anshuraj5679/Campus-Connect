/**
 * Availability engine (spec §3.3).
 *
 * computeTeacherStatus() is a pure function: give it the teacher's data and an
 * instant, get back a status. Priority order (first match wins):
 *   1. Active leave / unavailability → ON_LEAVE   (reason is never part of the output)
 *   2. College holiday               → HOLIDAY
 *   3. Non-working day / off hours   → OFF_HOURS
 *   4. Schedule override for now     → CANCELLED = free, EXTRA/RESCHEDULED = in class
 *   5. Current published entry       → IN_CLASS
 *   6. Free + meetings ON            → AVAILABLE
 *   7. Free + meetings OFF           → BUSY
 *   8. No published timetable        → NOT_PUBLISHED
 * The meeting toggle is consulted only at steps 6–7, so it can never
 * override statuses 1–5.
 */
import { formatInTimeZone } from "date-fns-tz";
import type { AvailabilityStatus } from "@/lib/constants/status";
import {
  addDaysToDate,
  holidayOn,
  isWorkingDay,
  istDateTime,
  istParts,
  timeToMinutes,
  TZ,
  type CalendarSettings,
  type Holiday,
} from "./time";
import { periodsAroundBreak, slotAt, slotForPeriod, type PeriodSlot } from "./periods";

export type ClassType = "THEORY" | "LAB" | "TUTORIAL" | "MENTORING" | "MEETING" | "ACTIVITY";

export type TimetableEntry = {
  id: string;
  dayOfWeek: number; // 1 = Mon … 6 = Sat
  startPeriod: number;
  endPeriod: number;
  subjectCode: string | null;
  subjectName: string;
  sectionId: string | null;
  semester: number | null;
  section: string | null;
  room: string | null;
  type: ClassType;
};

export type Unavailability = {
  id: string;
  startAt: Date;
  endAt: Date;
  cancelledAt: Date | null;
};

export type ScheduleOverride = {
  date: string; // yyyy-MM-dd (IST)
  period: number;
  kind: "CANCELLED" | "EXTRA" | "RESCHEDULED";
  subjectName?: string | null;
  section?: string | null;
  room?: string | null;
};

export type AvailabilityInput = {
  at: Date;
  settings: CalendarSettings;
  periods: PeriodSlot[];
  holidays: Holiday[];
  leaves: Unavailability[];
  overrides: ScheduleOverride[];
  /** Entries of the teacher's PUBLISHED version; null = no published timetable. */
  entries: TimetableEntry[] | null;
  acceptingMeetings: boolean;
};

export type ClassOccurrence = {
  subjectName: string;
  subjectCode: string | null;
  section: string | null;
  room: string | null;
  type: ClassType;
  startPeriod: number;
  endPeriod: number;
  startsAt: Date;
  endsAt: Date;
  isExtra: boolean;
};

export type TeacherStatus = {
  status: AvailabilityStatus;
  /** Short label for the chip, e.g. "In Class" */
  label: string;
  /** One-line context, e.g. "DS · 5A · Room 204 until 12:00 PM" */
  detail: string;
  current?: ClassOccurrence;
  next?: ClassOccurrence;
  until?: Date;
};

const fmtTime = (d: Date) => formatInTimeZone(d, TZ, "h:mm a");

// ---------------------------------------------------------------------------

/** All classes of a teacher on a date, with overrides applied, in time order. */
export function classesOn(
  date: string,
  input: Pick<AvailabilityInput, "periods" | "entries" | "overrides">,
): ClassOccurrence[] {
  const { periods, entries, overrides } = input;
  const isoDay = istDayOfWeek(date);
  const dayOverrides = overrides.filter((o) => o.date === date);
  const cancelled = new Set(dayOverrides.filter((o) => o.kind === "CANCELLED").map((o) => o.period));

  const result: ClassOccurrence[] = [];

  for (const e of entries ?? []) {
    if (e.dayOfWeek !== isoDay) continue;
    // Drop cancelled periods; a lab with one cancelled period keeps the rest.
    let runStart: number | null = null;
    for (let p = e.startPeriod; p <= e.endPeriod + 1; p++) {
      const active = p <= e.endPeriod && !cancelled.has(p);
      if (active && runStart === null) runStart = p;
      if (!active && runStart !== null) {
        const occ = occurrence(date, e, runStart, p - 1, periods, false);
        if (occ) result.push(occ);
        runStart = null;
      }
    }
  }

  for (const o of dayOverrides) {
    if (o.kind === "CANCELLED") continue;
    const occ = occurrence(
      date,
      {
        subjectName: o.subjectName ?? "Extra class",
        subjectCode: null,
        section: o.section ?? null,
        room: o.room ?? null,
        type: "THEORY",
      },
      o.period,
      o.period,
      periods,
      true,
    );
    if (occ) result.push(occ);
  }

  return result.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function occurrence(
  date: string,
  e: Pick<TimetableEntry, "subjectName" | "subjectCode" | "section" | "room" | "type">,
  start: number,
  end: number,
  periods: PeriodSlot[],
  isExtra: boolean,
): ClassOccurrence | null {
  const first = slotForPeriod(periods, start);
  const last = slotForPeriod(periods, end);
  if (!first || !last) return null;
  return {
    subjectName: e.subjectName,
    subjectCode: e.subjectCode,
    section: e.section,
    room: e.room,
    type: e.type,
    startPeriod: start,
    endPeriod: end,
    startsAt: istDateTime(date, first.start),
    endsAt: istDateTime(date, last.end),
    isExtra,
  };
}

function istDayOfWeek(date: string): number {
  return istParts(istDateTime(date, "12:00")).isoDay;
}

/** Leave active at `at`, extended through any back-to-back leaves. */
export function activeLeaveUntil(leaves: Unavailability[], at: Date): Date | null {
  const live = leaves.filter((l) => !l.cancelledAt);
  const current = live.find((l) => l.startAt <= at && at < l.endAt);
  if (!current) return null;
  let until = current.endAt;
  for (let changed = true; changed; ) {
    changed = false;
    for (const l of live) {
      if (l.startAt <= until && l.endAt > until) {
        until = l.endAt;
        changed = true;
      }
    }
  }
  return until;
}

function describeClass(c: ClassOccurrence): string {
  const parts = [c.subjectCode ?? c.subjectName];
  if (c.section) parts.push(c.section);
  if (c.room) parts.push(/lab|room|cabin/i.test(c.room) ? c.room : `Room ${c.room}`);
  return `${parts.join(" · ")} until ${fmtTime(c.endsAt)}`;
}

/** "Back at 1:45 PM" (same day) or "Back on Mon, 24 Nov". */
export function backOnLabel(until: Date, at: Date): string {
  const sameDay = istParts(until).date === istParts(at).date;
  return sameDay
    ? `Back at ${fmtTime(until)}`
    : `Back on ${formatInTimeZone(until, TZ, "EEE, d MMM")}`;
}

// ---------------------------------------------------------------------------

export function computeTeacherStatus(input: AvailabilityInput): TeacherStatus {
  const { at, settings, periods, holidays, leaves, entries, acceptingMeetings } = input;
  const { date, minutes } = istParts(at);

  // 1. Leave / unavailability (the reason never leaves the database for students)
  const leaveUntil = activeLeaveUntil(leaves, at);
  if (leaveUntil) {
    // A leave ending at midnight means "back on the next working day" (skip Sundays/holidays).
    let back = leaveUntil;
    if (istParts(leaveUntil).minutes === 0) {
      let d = istParts(leaveUntil).date;
      for (let i = 0; i < 31 && !isWorkingDay(d, settings, holidays); i++) d = addDaysToDate(d, 1);
      back = istDateTime(d, settings.collegeStart);
    }
    return { status: "ON_LEAVE", label: "On Leave", detail: backOnLabel(back, at), until: leaveUntil };
  }

  // 2. Holiday
  const holiday = holidayOn(date, holidays);
  if (holiday) {
    return { status: "HOLIDAY", label: "Holiday", detail: holiday.name };
  }

  // 3. Non-working day or outside college hours
  const hours = `College hours ${fmtTime(istDateTime(date, settings.collegeStart))} – ${fmtTime(
    istDateTime(date, settings.collegeEnd),
  )}`;
  if (!isWorkingDay(date, settings, holidays)) {
    return { status: "OFF_HOURS", label: "Off Campus Hours", detail: "Not a working day" };
  }
  if (minutes < timeToMinutes(settings.collegeStart) || minutes >= timeToMinutes(settings.collegeEnd)) {
    return { status: "OFF_HOURS", label: "Off Campus Hours", detail: hours };
  }

  const today = classesOn(date, input);
  const current = today.find((c) => c.startsAt <= at && at < c.endsAt);
  const next = today.find((c) => c.startsAt > at);

  // 4 + 5. In class (overrides are already applied inside classesOn)
  if (current) {
    return { status: "IN_CLASS", label: "In Class", detail: describeClass(current), current, next, until: current.endsAt };
  }
  // A lab spanning a break (e.g. P2–P3 across the short break) keeps the teacher in class.
  const slot = slotAt(periods, minutes);
  if (slot?.isBreak) {
    const { before, after } = periodsAroundBreak(periods, slot);
    const spanning = today.find(
      (c) => before !== null && after !== null && c.startPeriod <= before && c.endPeriod >= after,
    );
    if (spanning) {
      return { status: "IN_CLASS", label: "In Class", detail: describeClass(spanning), current: spanning, next, until: spanning.endsAt };
    }
  }

  // 8. No published timetable (and no extra class right now)
  if (entries === null) {
    return { status: "NOT_PUBLISHED", label: "Timetable Not Published", detail: "Schedule not available yet" };
  }

  // 6 + 7. Free period
  const freeUntil = next ? `Free until ${fmtTime(next.startsAt)}` : "Free for the rest of the day";
  if (acceptingMeetings) {
    return { status: "AVAILABLE", label: "Available", detail: freeUntil, next, until: next?.startsAt };
  }
  return { status: "BUSY", label: "Busy", detail: `Not accepting meetings · ${freeUntil.toLowerCase()}`, next, until: next?.startsAt };
}

/** Monday (yyyy-MM-dd) of the IST week containing `at`. */
export function weekStart(at: Date): string {
  const { date, isoDay } = istParts(at);
  return addDaysToDate(date, -(isoDay - 1));
}

/**
 * Timetable cells ("day-startPeriod") this week that fall inside the
 * teacher's unavailability, so the student view can mark them
 * "Teacher unavailable" (spec §3.4).
 */
export function unavailableCellsForWeek(
  at: Date,
  entries: TimetableEntry[],
  leaves: Unavailability[],
  periods: PeriodSlot[],
): Set<string> {
  const cells = new Set<string>();
  const monday = weekStart(at);
  const live = leaves.filter((l) => !l.cancelledAt);
  if (!live.length) return cells;
  for (const e of entries) {
    const date = addDaysToDate(monday, e.dayOfWeek - 1);
    const first = slotForPeriod(periods, e.startPeriod);
    const last = slotForPeriod(periods, e.endPeriod);
    if (!first || !last) continue;
    const start = istDateTime(date, first.start);
    const end = istDateTime(date, last.end);
    if (live.some((l) => l.startAt < end && l.endAt > start)) cells.add(`${e.dayOfWeek}-${e.startPeriod}`);
  }
  return cells;
}

/**
 * The next class after `at`, looking ahead up to 14 days and skipping
 * holidays, non-working days and leave.
 */
export function findNextClass(input: AvailabilityInput): ClassOccurrence | null {
  const { at, settings, holidays, leaves } = input;
  let date = istParts(at).date;
  for (let i = 0; i < 14; i++) {
    if (isWorkingDay(date, settings, holidays)) {
      for (const c of classesOn(date, input)) {
        if (c.startsAt <= at) continue;
        if (activeLeaveUntil(leaves, c.startsAt)) continue;
        return c;
      }
    }
    date = addDaysToDate(date, 1);
  }
  return null;
}
