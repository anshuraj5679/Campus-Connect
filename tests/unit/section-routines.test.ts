import { describe, expect, it } from "vitest";
import { validateTimetable, type DraftEntry } from "@/lib/services/timetableValidation";
import { fillPositions, matchTeacherName, parseTimetableWords, stripTeacherTokens, type OcrWord } from "@/lib/services/ocrParser";
import { DEFAULT_PERIOD_SLOTS } from "@/lib/services/periods";

// Synthetic OCR output of a section routine: 4-line cells (code, subject, teacher, room).
const word = (text: string, x: number, y: number): OcrWord => ({ text, confidence: 95, bbox: { x0: x - 20, y0: y - 6, x1: x + 20, y1: y + 6 } });
const COL_X: Record<number, number> = { 1: 200, 2: 300, 3: 500, 4: 600, 5: 800, 6: 900, 7: 1000 };
const ROW_Y = (day: number) => 100 + day * 70;
const cellWords = (day: number, period: number, lines: string[]) => lines.map((t, i) => word(t, COL_X[period], ROW_Y(day) - 21 + i * 14));
function routineWords({ skipHeader, skipDay, dayText }: { skipHeader?: string; skipDay?: number; dayText?: Record<number, string> } = {}) {
  const head = [["9:00", 200], ["9:55", 300], ["BREAK", 400], ["11:05", 500], ["12:00", 600], ["LUNCH", 700], ["1:45", 800], ["2:40", 900], ["3:35", 1000]] as const;
  const days = ["", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return [
    ...head.filter(([t]) => t !== skipHeader).map(([t, x]) => word(t, x, 60)),
    ...[1, 2, 3, 4, 5, 6].filter((d) => d !== skipDay).map((d) => word(dayText?.[d] ?? days[d], 50, ROW_Y(d))),
    ...cellWords(1, 1, ["21CS53", "DBMS", "KR", "204"]),
    ...cellWords(1, 2, ["21CS51", "CN", "MI", "204"]),
    ...cellWords(4, 3, ["21CS52", "ATC", "RS", "204"]),
    ...cellWords(5, 4, ["21CS52", "ATC", "RS", "204"]),
    ...cellWords(6, 2, ["21CS51", "CN", "MI", "204"]),
  ];
}
const cells = (r: ReturnType<typeof parseTimetableWords>) => r.entries.map((e) => `${e.dayOfWeek}:${e.startPeriod}:${e.subjectCode}`).sort();
const EXPECTED = ["1:1:21CS53", "1:2:21CS51", "4:3:21CS52", "5:4:21CS52", "6:2:21CS51"];

describe("routine OCR layout recovery", () => {
  it("reads every cell of a clean scan", () => {
    expect(cells(parseTimetableWords(routineWords(), DEFAULT_PERIOD_SLOTS, { requireSection: false }))).toEqual(EXPECTED);
  });

  it("places a column whose header OCR missed by position instead of merging it into the next period", () => {
    const r = parseTimetableWords(routineWords({ skipHeader: "9:00" }), DEFAULT_PERIOD_SLOTS, { requireSection: false });
    expect(cells(r)).toEqual(EXPECTED);
    expect(r.warnings.join(" ")).toMatch(/header/);
  });

  it("places a day row whose label OCR missed instead of splitting its classes between neighbours", () => {
    const r = parseTimetableWords(routineWords({ skipDay: 5 }), DEFAULT_PERIOD_SLOTS, { requireSection: false });
    expect(cells(r)).toEqual(EXPECTED);
    expect(r.warnings.join(" ")).toMatch(/day label/);
  });

  it("accepts common misreads of day labels but not names that start like a day", () => {
    const r = parseTimetableWords(routineWords({ dayText: { 5: "FRl", 1: "M0N" } }), DEFAULT_PERIOD_SLOTS, { requireSection: false });
    expect(cells(r)).toEqual(EXPECTED);
    expect(r.daysFound).toBe(6);
    const satish = parseTimetableWords([...routineWords(), word("Satish", 600, ROW_Y(2))], DEFAULT_PERIOD_SLOTS, { requireSection: false });
    expect(satish.entries.find((e) => e.dayOfWeek === 2)?.rawText).toBe("Satish");
  });

  it("fillPositions interpolates gaps and extrapolates only a limited distance", () => {
    const m = fillPositions(new Map([[1, 100], [2, 200], [4, 400]]), [0, 1, 2, 3, 4, 5, 9], 1);
    expect(m.get(3)).toBe(300);
    expect(m.get(0)).toBe(0);
    expect(m.get(5)).toBe(500);
    expect(m.has(9)).toBe(false);
  });
});

const teachers = [
  { id: "t1", name: "Prof. Kavitha Rao" },
  { id: "t2", name: "Dr. Rajesh Sharma" },
  { id: "t3", name: "Prof. Kiran Reddy" }, // same initials as Kavitha Rao (KR)
  { id: "t4", name: "Dr. Meena Iyer" },
];

const e = (over: Partial<DraftEntry>): DraftEntry => ({
  id: Math.random().toString(36).slice(2),
  dayOfWeek: 1,
  startPeriod: 1,
  endPeriod: over.endPeriod ?? over.startPeriod ?? 1,
  subjectCode: "21CS53",
  subjectName: "DBMS",
  sectionId: null,
  section: null,
  semester: null,
  room: "204",
  type: "THEORY",
  ...over,
});

describe("section routine teacher matching", () => {
  it("matches a full name written in the cell, ignoring honorifics and case", () => {
    expect(matchTeacherName("21CS53 DBMS Rajesh Sharma 204", teachers)?.id).toBe("t2");
    expect(matchTeacherName("21CS51 meena iyer", teachers)?.id).toBe("t4");
  });

  it("tolerates OCR look-alikes in names (l/1 for I, 0 for O)", () => {
    expect(matchTeacherName("21CS51 CN Meena lyer 204", teachers)?.id).toBe("t4");
    expect(stripTeacherTokens("CN Meena lyer", "Dr. Meena Iyer")).toBe("CN");
  });

  it("matches unique initials as a separate token", () => {
    expect(matchTeacherName("21CS52 CN (MI) 305", teachers)?.id).toBe("t4");
    expect(matchTeacherName("21CS52 CN RS", teachers)?.id).toBe("t2");
  });

  it("returns null when initials are ambiguous or nothing matches", () => {
    expect(matchTeacherName("21CS53 DBMS KR", teachers)).toBeNull(); // Kavitha Rao or Kiran Reddy
    expect(matchTeacherName("21CS53 DBMS 204", teachers)).toBeNull();
    // Initials must be a whole token, not part of a word
    expect(matchTeacherName("MICROPROCESSORS", teachers)).toBeNull();
  });

  it("strips the teacher's name / initials from the subject text", () => {
    expect(stripTeacherTokens("DBMS Dr. Rajesh Sharma", "Dr. Rajesh Sharma")).toBe("DBMS");
    expect(stripTeacherTokens("Computer Networks MI", "Dr. Meena Iyer")).toBe("Computer Networks");
  });
});

describe("section routine validation", () => {
  it("does not require a section on each class (the routine belongs to the section)", () => {
    const issues = validateTimetable([e({ type: "THEORY" }), e({ startPeriod: 2, type: "LAB", endPeriod: 3 })], { validPeriods: [1, 2, 3, 4], otherEntries: [], requireSection: false });
    expect(issues.find((i) => i.code === "MISSING_SECTION")).toBeUndefined();
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("still blocks two classes in the same period", () => {
    const issues = validateTimetable([e({ startPeriod: 2, endPeriod: 3, type: "LAB" }), e({ startPeriod: 3 })], { validPeriods: [1, 2, 3, 4], otherEntries: [], requireSection: false });
    expect(issues.some((i) => i.code === "TEACHER_OVERLAP" && i.severity === "error")).toBe(true);
  });

  it("keeps requiring sections for teacher timetables by default", () => {
    const issues = validateTimetable([e({ type: "THEORY" })], { validPeriods: [1], otherEntries: [] });
    expect(issues.some((i) => i.code === "MISSING_SECTION")).toBe(true);
  });
});
