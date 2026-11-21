import { describe, expect, it } from "vitest";
import { hasBlockingIssues, summarize, validateTimetable, type DraftEntry, type OtherEntry } from "@/lib/services/timetableValidation";
import { correctSubjectCode, parseCellText, parseTimetableWords, type OcrWord } from "@/lib/services/ocrParser";
import { isAnnouncementTarget, type TargetAnnouncement, type TargetViewer } from "@/lib/services/announcements";
import { DEFAULT_PERIOD_SLOTS } from "@/lib/services/periods";

const e = (over: Partial<DraftEntry>): DraftEntry => ({
  id: Math.random().toString(36).slice(2),
  dayOfWeek: 1,
  startPeriod: 1,
  subjectCode: "21CS53",
  subjectName: "DBMS",
  sectionId: "s5a",
  section: "5A",
  semester: 5,
  room: "204",
  type: "THEORY",
  ...over,
  endPeriod: over.endPeriod ?? over.startPeriod ?? 1,
});
const valid = [1, 2, 3, 4, 5, 6, 7];

describe("validateTimetable", () => {
  it("blocks overlapping entries for the same teacher", () => {
    const issues = validateTimetable([e({ startPeriod: 3, endPeriod: 4, type: "LAB" }), e({ startPeriod: 4 })], { validPeriods: valid, otherEntries: [] });
    expect(issues.some((i) => i.code === "TEACHER_OVERLAP" && i.severity === "error")).toBe(true);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it("warns (does not block) on room and section clashes with other teachers", () => {
    const other: OtherEntry = { ...e({ subjectName: "OS" }), teacherName: "Dr. X" };
    const issues = validateTimetable([e({})], { validPeriods: valid, otherEntries: [other] });
    expect(issues.map((i) => i.code).sort()).toEqual(["ROOM_CLASH", "SECTION_CLASH"]);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("requires sections for classes and blocks unreviewed OCR cells", () => {
    const issues = validateTimetable([e({ sectionId: null }), e({ dayOfWeek: 2, lowConfidence: true })], { validPeriods: valid, otherEntries: [] });
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["MISSING_SECTION", "NEEDS_REVIEW"]));
  });

  it("allows a meeting without a section and summarises", () => {
    const list = [e({ type: "MEETING", sectionId: null, section: null }), e({ dayOfWeek: 2, startPeriod: 5, endPeriod: 7, type: "LAB" })];
    expect(hasBlockingIssues(validateTimetable(list, { validPeriods: valid, otherEntries: [] }))).toBe(false);
    expect(summarize(list)).toEqual({ classes: 2, labs: 1, theory: 1, periods: 4 });
  });
});

describe("OCR parsing", () => {
  it("reads a cell", () => {
    expect(parseCellText("21CS53 DBMS 5A R-204")).toMatchObject({ code: "21CS53", section: "5A", room: "204", type: "THEORY" });
    expect(parseCellText("DBMS LAB 5B 312")).toMatchObject({ section: "5B", type: "LAB" });
  });

  it("maps words into day × period cells and merges a lab span", () => {
    const w = (text: string, x: number, y: number, confidence = 92): OcrWord => ({ text, confidence, bbox: { x0: x - 15, y0: y - 8, x1: x + 15, y1: y + 8 } });
    const words: OcrWord[] = [
      w("9:00", 150, 20), w("9:55", 250, 20), w("11:05", 350, 20), w("12:00", 450, 20),
      w("MON", 40, 100), w("TUE", 40, 160),
      w("21CS53", 150, 95), w("5A", 150, 108),
      w("21CSL55", 350, 95), w("5A", 350, 108), w("LAB", 360, 112),
      w("21CSL55", 450, 95), w("5A", 450, 108), w("LAB", 460, 112),
      w("21CS52", 250, 155, 40), w("5B", 250, 168, 40),
    ];
    const r = parseTimetableWords(words, DEFAULT_PERIOD_SLOTS);
    expect(r.daysFound).toBe(2);
    expect(r.usedHeaders).toBe(true);
    const mon = r.entries.filter((x) => x.dayOfWeek === 1);
    expect(mon.map((x) => [x.subjectCode, x.startPeriod, x.endPeriod])).toEqual([["21CS53", 1, 1], ["21CSL55", 3, 4]]);
    expect(mon[1].type).toBe("LAB");
    const tue = r.entries.find((x) => x.dayOfWeek === 2)!;
    expect(tue).toMatchObject({ subjectCode: "21CS52", startPeriod: 2, lowConfidence: true });
  });

  it("snaps OCR look-alike misreads to a known subject code, but only when unambiguous", () => {
    expect(correctSubjectCode("210853", ["21CS53", "21CS52"])).toBe("21CS53"); // C→0, S→8
    expect(correctSubjectCode("210853", ["21CS53", "21OS53"])).toBeNull(); // two candidates
    expect(correctSubjectCode("210853", ["21CS54"])).toBeNull(); // 3 vs 4 is not a look-alike
    expect(correctSubjectCode("204", ["21CS53"])).toBeNull(); // rooms are never codes
  });

  it("fixes common section and lab-room misreads and flags corrected cells for review", () => {
    expect(parseCellText("210853 DBMS 58 205", ["21CS53"])).toMatchObject({ code: "21CS53", section: "5B", room: "205", name: "DBMS", corrected: true });
    expect(parseCellText("21CSL55 DBMS LAB 5A CSE-LAB2")).toMatchObject({ code: "21CSL55", section: "5A", room: "CSE-LAB2", type: "LAB" });
    const words: OcrWord[] = [
      { text: "9:00", confidence: 95, bbox: { x0: 140, y0: 10, x1: 170, y1: 30 } },
      { text: "9:55", confidence: 95, bbox: { x0: 240, y0: 10, x1: 270, y1: 30 } },
      { text: "MON", confidence: 95, bbox: { x0: 20, y0: 90, x1: 60, y1: 110 } },
      { text: "210853", confidence: 90, bbox: { x0: 135, y0: 85, x1: 175, y1: 100 } },
      { text: "5A", confidence: 90, bbox: { x0: 140, y0: 102, x1: 160, y1: 116 } },
    ];
    const r = parseTimetableWords(words, DEFAULT_PERIOD_SLOTS, { knownCodes: ["21CS53"] });
    expect(r.entries[0]).toMatchObject({ subjectCode: "21CS53", lowConfidence: true });
  });

  it("reports when no day names are found", () => {
    expect(parseTimetableWords([], DEFAULT_PERIOD_SLOTS).warnings[0]).toMatch(/No day names/);
  });
});

describe("announcement targeting", () => {
  const now = new Date("2026-11-23T06:00:00Z");
  const a = (over: Partial<TargetAnnouncement>): TargetAnnouncement => ({
    scope: "DEPARTMENT", departmentId: "cse", clusterId: null, audience: "BOTH", semesters: [], sections: [], expiresAt: null, ...over,
  });
  const student: TargetViewer = { role: "STUDENT", departmentId: "cse", clusterId: "c2", semester: 5, section: "5A" };
  const teacher: TargetViewer = { role: "TEACHER", departmentId: "cse", clusterId: "c2", semester: null, section: null };

  it("filters by scope, audience, semester and section", () => {
    expect(isAnnouncementTarget(a({}), student, now)).toBe(true);
    expect(isAnnouncementTarget(a({ departmentId: "ece" }), student, now)).toBe(false);
    expect(isAnnouncementTarget(a({ audience: "TEACHERS" }), student, now)).toBe(false);
    expect(isAnnouncementTarget(a({ audience: "TEACHERS" }), teacher, now)).toBe(true);
    expect(isAnnouncementTarget(a({ semesters: [3] }), student, now)).toBe(false);
    expect(isAnnouncementTarget(a({ sections: ["5A", "5B"] }), student, now)).toBe(true);
    expect(isAnnouncementTarget(a({ scope: "CLUSTER", clusterId: "c1" }), student, now)).toBe(false);
  });

  it("hides expired announcements", () => {
    expect(isAnnouncementTarget(a({ expiresAt: new Date(now.getTime() - 1) }), student, now)).toBe(false);
  });
});
