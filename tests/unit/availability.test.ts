import { describe, expect, it } from "vitest";
import {
  computeTeacherStatus,
  findNextClass,
  classesOn,
  type AvailabilityInput,
  type TimetableEntry,
} from "@/lib/services/availability";
import { DEFAULT_PERIOD_SLOTS } from "@/lib/services/periods";
import { istDateTime, type CalendarSettings } from "@/lib/services/time";

// Week of Mon 23 Nov 2026. Sat 28 Nov is the 4th Saturday (off); Sat 21 Nov is the 3rd (working).
const MON = "2026-11-23";
const TUE = "2026-11-24";
const at = (date: string, time: string) => istDateTime(date, time);

const settings: CalendarSettings = {
  workingDays: [1, 2, 3, 4, 5, 6],
  saturdayRule: "SECOND_FOURTH_OFF",
  collegeStart: "09:00",
  collegeEnd: "16:30",
};

const entry = (over: Partial<TimetableEntry>): TimetableEntry => ({
  id: Math.random().toString(36).slice(2),
  dayOfWeek: 1,
  startPeriod: 1,
  subjectCode: "21CS53",
  subjectName: "DBMS",
  sectionId: "sec-5a",
  semester: 5,
  section: "5A",
  room: "204",
  type: "THEORY",
  ...over,
  endPeriod: over.endPeriod ?? over.startPeriod ?? 1,
});

const mondayEntries: TimetableEntry[] = [
  entry({ startPeriod: 1, endPeriod: 1, subjectCode: "21CS53", subjectName: "DBMS" }),
  entry({ startPeriod: 3, endPeriod: 4, subjectCode: "21CSL55", subjectName: "DBMS Lab", type: "LAB", room: "Lab 2" }),
  entry({ startPeriod: 6, endPeriod: 6, subjectCode: "21CS52", subjectName: "Computer Networks", section: "5B" }),
];

function input(over: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    at: at(MON, "10:00"),
    settings,
    periods: DEFAULT_PERIOD_SLOTS,
    holidays: [],
    leaves: [],
    overrides: [],
    entries: mondayEntries,
    acceptingMeetings: true,
    ...over,
  };
}

describe("computeTeacherStatus — priority order", () => {
  it("1. active leave wins over everything and never exposes a reason", () => {
    const s = computeTeacherStatus(
      input({
        at: at(MON, "09:30"), // would be In Class
        leaves: [{ id: "l1", startAt: at(MON, "09:00"), endAt: at(TUE, "09:00"), cancelledAt: null }],
      }),
    );
    expect(s.status).toBe("ON_LEAVE");
    expect(s.detail).toBe("Back on Tue, 24 Nov");
    expect(JSON.stringify(s)).not.toMatch(/reason/i);
  });

  it("1b. a half-day leave that ends mid-day shows the return time, then normal status resumes", () => {
    const leaves = [{ id: "fn", startAt: at(MON, "09:00"), endAt: at(MON, "12:55"), cancelledAt: null }];
    const during = computeTeacherStatus(input({ at: at(MON, "11:30"), leaves }));
    expect(during.status).toBe("ON_LEAVE");
    expect(during.detail).toBe("Back at 12:55 PM");

    const after = computeTeacherStatus(input({ at: at(MON, "14:00"), leaves }));
    expect(after.status).toBe("AVAILABLE");
  });

  it("1c. cancelled leave is ignored", () => {
    const s = computeTeacherStatus(
      input({ at: at(MON, "09:30"), leaves: [{ id: "x", startAt: at(MON, "09:00"), endAt: at(MON, "17:00"), cancelledAt: at(MON, "08:00") }] }),
    );
    expect(s.status).toBe("IN_CLASS");
  });

  it("1d. back-to-back leaves are merged for the 'Back on' date", () => {
    const s = computeTeacherStatus(
      input({
        at: at(MON, "10:00"),
        leaves: [
          { id: "a", startAt: at(MON, "00:00"), endAt: at(TUE, "00:00"), cancelledAt: null },
          { id: "b", startAt: at(TUE, "00:00"), endAt: at("2026-11-25", "00:00"), cancelledAt: null },
        ],
      }),
    );
    expect(s.detail).toBe("Back on Wed, 25 Nov");
  });

  it("2. holiday", () => {
    const s = computeTeacherStatus(input({ at: at(MON, "10:00"), holidays: [{ date: MON, name: "Kanakadasa Jayanti" }] }));
    expect(s).toMatchObject({ status: "HOLIDAY", detail: "Kanakadasa Jayanti" });
  });

  it("3. outside college hours", () => {
    expect(computeTeacherStatus(input({ at: at(MON, "08:30") })).status).toBe("OFF_HOURS");
    expect(computeTeacherStatus(input({ at: at(MON, "16:30") })).status).toBe("OFF_HOURS");
  });

  it("3b. Sunday and 2nd/4th Saturday are non-working days", () => {
    expect(computeTeacherStatus(input({ at: at("2026-11-22", "10:00") })).status).toBe("OFF_HOURS"); // Sunday
    expect(computeTeacherStatus(input({ at: at("2026-11-28", "10:00") })).status).toBe("OFF_HOURS"); // 4th Sat
    expect(computeTeacherStatus(input({ at: at("2026-11-21", "10:00"), entries: [] })).status).toBe("AVAILABLE"); // 3rd Sat
  });

  it("4a. a cancelled class makes the teacher free", () => {
    const s = computeTeacherStatus(
      input({ at: at(MON, "09:30"), overrides: [{ date: MON, period: 1, kind: "CANCELLED" }] }),
    );
    expect(s.status).toBe("AVAILABLE");
  });

  it("4b. an extra class puts the teacher in class", () => {
    const s = computeTeacherStatus(
      input({ at: at(MON, "10:00"), overrides: [{ date: MON, period: 2, kind: "EXTRA", subjectName: "OS Remedial", section: "5A", room: "210" }] }),
    );
    expect(s.status).toBe("IN_CLASS");
    expect(s.detail).toContain("OS Remedial");
  });

  it("5. in class shows subject, section, room and end time", () => {
    const s = computeTeacherStatus(input({ at: at(MON, "09:30") }));
    expect(s.status).toBe("IN_CLASS");
    expect(s.detail).toBe("21CS53 · 5A · Room 204 until 9:55 AM");
  });

  it("5b. a lab spanning P3–P4 is in class until the end of P4", () => {
    const s = computeTeacherStatus(input({ at: at(MON, "12:10") }));
    expect(s.status).toBe("IN_CLASS");
    expect(s.until?.getTime()).toBe(at(MON, "12:55").getTime());
  });

  it("5c. a lab spanning a break keeps the teacher in class during the break", () => {
    const s = computeTeacherStatus(
      input({ at: at(MON, "10:55"), entries: [entry({ startPeriod: 2, endPeriod: 3, type: "LAB", subjectName: "OS Lab" })] }),
    );
    expect(s.status).toBe("IN_CLASS");
  });

  it("5d. a break between two separate classes is free time", () => {
    const s = computeTeacherStatus(input({ at: at(MON, "13:00") })); // lunch
    expect(s.status).toBe("AVAILABLE");
    expect(s.detail).toBe("Free until 2:40 PM");
  });

  it("6. free period with meetings on → Available until next class", () => {
    const s = computeTeacherStatus(input({ at: at(MON, "10:00") }));
    expect(s).toMatchObject({ status: "AVAILABLE", detail: "Free until 11:05 AM" });
  });

  it("6b. no more classes today", () => {
    const s = computeTeacherStatus(input({ at: at(MON, "15:40") }));
    expect(s.detail).toBe("Free for the rest of the day");
  });

  it("7. free period with meetings off → Busy", () => {
    const s = computeTeacherStatus(input({ at: at(MON, "10:00"), acceptingMeetings: false }));
    expect(s.status).toBe("BUSY");
  });

  it("7b. the meeting toggle cannot override In Class, Leave, Holiday or Off hours", () => {
    expect(computeTeacherStatus(input({ at: at(MON, "09:30"), acceptingMeetings: false })).status).toBe("IN_CLASS");
    expect(computeTeacherStatus(input({ at: at(MON, "08:00"), acceptingMeetings: true })).status).toBe("OFF_HOURS");
    expect(
      computeTeacherStatus(input({ at: at(MON, "10:00"), acceptingMeetings: true, holidays: [{ date: MON, name: "X" }] })).status,
    ).toBe("HOLIDAY");
  });

  it("8. no published timetable", () => {
    expect(computeTeacherStatus(input({ entries: null })).status).toBe("NOT_PUBLISHED");
    // …but leave still takes priority
    expect(
      computeTeacherStatus(
        input({ entries: null, leaves: [{ id: "l", startAt: at(MON, "09:00"), endAt: at(MON, "17:00"), cancelledAt: null }] }),
      ).status,
    ).toBe("ON_LEAVE");
  });
});

describe("classesOn / findNextClass", () => {
  it("splits a lab around a cancelled period", () => {
    const list = classesOn(MON, {
      periods: DEFAULT_PERIOD_SLOTS,
      entries: [entry({ startPeriod: 5, endPeriod: 7, type: "LAB" })],
      overrides: [{ date: MON, period: 6, kind: "CANCELLED" }],
    });
    expect(list.map((c) => [c.startPeriod, c.endPeriod])).toEqual([[5, 5], [7, 7]]);
  });

  it("finds the next class on a later day, skipping a holiday", () => {
    const next = findNextClass(
      input({
        at: at(MON, "16:00"),
        holidays: [{ date: TUE, name: "Holiday" }],
        entries: [entry({ dayOfWeek: 1, startPeriod: 1 }), entry({ dayOfWeek: 3, startPeriod: 2, subjectName: "OS" })],
      }),
    );
    expect(next?.subjectName).toBe("OS");
    expect(next?.startsAt.getTime()).toBe(at("2026-11-25", "09:55").getTime());
  });

  it("skips classes that fall inside leave", () => {
    const next = findNextClass(
      input({
        at: at(MON, "08:00"),
        leaves: [{ id: "l", startAt: at(MON, "09:00"), endAt: at(MON, "10:00"), cancelledAt: null }],
      }),
    );
    expect(next?.subjectName).toBe("DBMS Lab");
  });
});
