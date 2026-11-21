/**
 * Time helpers. Every calendar decision in CampusConnect is made in
 * Asia/Kolkata, regardless of the server's or browser's time zone.
 */
import { addDays, format as formatDate, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const TZ = "Asia/Kolkata";

export type SaturdayRule = "ALL_WORKING" | "SECOND_FOURTH_OFF" | "ALL_OFF";

export type CalendarSettings = {
  /** ISO weekdays that are working days: 1 = Monday … 7 = Sunday */
  workingDays: number[];
  saturdayRule: SaturdayRule;
  /** "HH:mm" */
  collegeStart: string;
  collegeEnd: string;
};

export type Holiday = { date: string; name: string };

/** IST calendar view of an instant. */
export function istParts(at: Date) {
  return {
    date: formatInTimeZone(at, TZ, "yyyy-MM-dd"),
    isoDay: Number(formatInTimeZone(at, TZ, "i")), // 1 = Mon … 7 = Sun
    minutes: Number(formatInTimeZone(at, TZ, "H")) * 60 + Number(formatInTimeZone(at, TZ, "m")),
  };
}

/** "09:55" or "09:55:00" → 595 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The instant for an IST wall-clock date + time. */
export function istDateTime(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time.slice(0, 5)}:00`, TZ);
}

export function addDaysToDate(date: string, days: number): string {
  return formatDate(addDays(parseISO(date), days), "yyyy-MM-dd");
}

export function isoDayOfDate(date: string): number {
  const d = parseISO(date).getDay(); // 0 = Sun
  return d === 0 ? 7 : d;
}

/** 1st, 2nd, 3rd… occurrence of this weekday in its month. */
export function weekOfMonth(date: string): number {
  return Math.ceil(Number(date.slice(8, 10)) / 7);
}

/** Working day = configured weekday, Saturday rule satisfied, not a holiday. */
export function isWorkingDay(date: string, settings: CalendarSettings, holidays: Holiday[]): boolean {
  const isoDay = isoDayOfDate(date);
  if (!settings.workingDays.includes(isoDay)) return false;
  if (isoDay === 6) {
    if (settings.saturdayRule === "ALL_OFF") return false;
    if (settings.saturdayRule === "SECOND_FOURTH_OFF") {
      const n = weekOfMonth(date);
      if (n === 2 || n === 4) return false;
    }
  }
  return !holidays.some((h) => h.date === date);
}

export function holidayOn(date: string, holidays: Holiday[]): Holiday | undefined {
  return holidays.find((h) => h.date === date);
}

/**
 * Adds N working days (skipping Sundays, off-Saturdays and holidays), keeping
 * the IST time of day. Used for complaint SLA deadlines.
 */
export function addWorkingDays(
  from: Date,
  workingDays: number,
  settings: CalendarSettings,
  holidays: Holiday[],
): Date {
  const { date } = istParts(from);
  const time = formatInTimeZone(from, TZ, "HH:mm");
  let cursor = date;
  let added = 0;
  // Safety bound: never loop more than a year.
  for (let i = 0; i < 366 && added < workingDays; i++) {
    cursor = addDaysToDate(cursor, 1);
    if (isWorkingDay(cursor, settings, holidays)) added++;
  }
  return istDateTime(cursor, time);
}

/** Whole days between two instants (can be negative). */
export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}
