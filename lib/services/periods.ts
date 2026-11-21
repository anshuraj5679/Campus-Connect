/**
 * Period-slot helpers. A timetable entry refers to *teaching* periods by
 * number (P1…P7); breaks sit between them and have no number.
 */
import { timeToMinutes } from "./time";

export type PeriodSlot = {
  id?: string;
  label: string;
  periodNo: number | null; // null for breaks
  start: string; // "HH:mm"
  end: string;
  isBreak: boolean;
  sortOrder: number;
};

export function sortSlots(slots: PeriodSlot[]): PeriodSlot[] {
  return [...slots].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function teachingPeriods(slots: PeriodSlot[]): PeriodSlot[] {
  return sortSlots(slots).filter((s) => !s.isBreak && s.periodNo !== null);
}

export function slotForPeriod(slots: PeriodSlot[], periodNo: number): PeriodSlot | undefined {
  return slots.find((s) => s.periodNo === periodNo);
}

/** The slot (teaching or break) containing a minute-of-day, if any. */
export function slotAt(slots: PeriodSlot[], minutes: number): PeriodSlot | undefined {
  return sortSlots(slots).find(
    (s) => timeToMinutes(s.start) <= minutes && minutes < timeToMinutes(s.end),
  );
}

/** Teaching periods immediately before and after a break slot. */
export function periodsAroundBreak(slots: PeriodSlot[], breakSlot: PeriodSlot) {
  const sorted = sortSlots(slots);
  const idx = sorted.findIndex((s) => s.sortOrder === breakSlot.sortOrder);
  const before = [...sorted.slice(0, idx)].reverse().find((s) => !s.isBreak);
  const after = sorted.slice(idx + 1).find((s) => !s.isBreak);
  return { before: before?.periodNo ?? null, after: after?.periodNo ?? null };
}

export function periodLabel(periodNo: number): string {
  return `P${periodNo}`;
}

export function spanLabel(start: number, end: number): string {
  return start === end ? `P${start}` : `P${start}–P${end}`;
}

/** Default BMSIT&M-style day: 7 teaching periods, a short break and lunch. */
export const DEFAULT_PERIOD_SLOTS: PeriodSlot[] = [
  { label: "P1", periodNo: 1, start: "09:00", end: "09:55", isBreak: false, sortOrder: 1 },
  { label: "P2", periodNo: 2, start: "09:55", end: "10:50", isBreak: false, sortOrder: 2 },
  { label: "Short Break", periodNo: null, start: "10:50", end: "11:05", isBreak: true, sortOrder: 3 },
  { label: "P3", periodNo: 3, start: "11:05", end: "12:00", isBreak: false, sortOrder: 4 },
  { label: "P4", periodNo: 4, start: "12:00", end: "12:55", isBreak: false, sortOrder: 5 },
  { label: "Lunch", periodNo: null, start: "12:55", end: "13:45", isBreak: true, sortOrder: 6 },
  { label: "P5", periodNo: 5, start: "13:45", end: "14:40", isBreak: false, sortOrder: 7 },
  { label: "P6", periodNo: 6, start: "14:40", end: "15:35", isBreak: false, sortOrder: 8 },
  { label: "P7", periodNo: 7, start: "15:35", end: "16:30", isBreak: false, sortOrder: 9 },
];
