import { describe, expect, it } from "vitest";
import { abbreviations, enrichRoutineEntry, matchActivity, matchLegend, normalizeCode, parseLegend, parseRoutineHeader, type LegendRow } from "@/lib/services/routineParser";
import { parseTimetableWords, type OcrWord, type ParsedEntry } from "@/lib/services/ocrParser";
import type { TableLines } from "@/lib/services/ocrPreprocess";
import type { PeriodSlot } from "@/lib/services/periods";

// BMSIT&M periods: I 8:30 … VII 3:15, break after II, lunch after IV
const BMSIT: PeriodSlot[] = [
  { sortOrder: 1, periodNo: 1, label: "I", start: "08:30", end: "09:25", isBreak: false },
  { sortOrder: 2, periodNo: 2, label: "II", start: "09:25", end: "10:20", isBreak: false },
  { sortOrder: 3, periodNo: null, label: "Break", start: "10:20", end: "10:40", isBreak: true },
  { sortOrder: 4, periodNo: 3, label: "III", start: "10:40", end: "11:35", isBreak: false },
  { sortOrder: 5, periodNo: 4, label: "IV", start: "11:35", end: "12:30", isBreak: false },
  { sortOrder: 6, periodNo: null, label: "Lunch", start: "12:30", end: "13:25", isBreak: true },
  { sortOrder: 7, periodNo: 5, label: "V", start: "13:25", end: "14:20", isBreak: false },
  { sortOrder: 8, periodNo: 6, label: "VI", start: "14:20", end: "15:15", isBreak: false },
  { sortOrder: 9, periodNo: 7, label: "VII", start: "15:15", end: "16:10", isBreak: false },
];

const LEGEND: LegendRow[] = [
  { name: "Software Engineering and Project Management", code: "BCS501", faculty: "Mrs. Geetha P L", practical: null, confidence: 90 },
  { name: "Computer Networks", code: "BCS502", faculty: "Dr. Swetha M S", practical: "Dr. Swetha M S/Prof Malini M", confidence: 90 },
  { name: "Theory of Computation", code: "BCS503", faculty: "Dr. Surekha K B", practical: null, confidence: 90 },
  { name: "Web Technology Lab", code: "BCSL504", faculty: "Ms. Sanjana V Hunashikatti", practical: "Ms. Sanjana V", confidence: 90 },
  { name: "Professional Elective Course I", code: "BCS505X", faculty: "Mrs. Kusuma H P", practical: null, confidence: 90 },
  { name: "Mini Project", code: "BCS506", faculty: "Prof Spandana L", practical: null, confidence: 90 },
  { name: "Research Methodology and IPR", code: "BRMK507", faculty: "Dr. Mohan B A", practical: null, confidence: 90 },
  { name: "Environmental Studies", code: "BESK508", faculty: null, practical: null, confidence: 90 },
  { name: "NCMC-CULTURAL", code: "BNSK509", faculty: "Dr. Soumyashree MS", practical: null, confidence: 90 },
];

describe("course codes", () => {
  it("fixes digit look-alikes in the number part only", () => {
    expect(normalizeCode("BCSS01")).toBe("BCS501");
    expect(normalizeCode("BCSLS04")).toBe("BCSL504");
    expect(normalizeCode("BCSS0SX")).toBe("BCS505X");
    expect(normalizeCode("BRMKS07")).toBe("BRMK507");
    expect(normalizeCode("BESKS0%")).toBe("BESK508");
    expect(normalizeCode("BNSK509/BPEK509/B")).toBe("BNSK509");
    expect(normalizeCode("Mrs Geetha")).toBeNull();
  });
});

describe("subject abbreviations", () => {
  it("builds the abbreviations printed in the grid", () => {
    expect(abbreviations("Software Engineering and Project Management")).toContain("SEPM");
    expect(abbreviations("Theory of Computation")).toContain("TOC");
    expect(abbreviations("Research Methodology and IPR")).toContain("RMIPR");
    expect(abbreviations("Computer Networks")).toContain("CN");
  });

  it("maps grid cells to legend subjects, flagging OCR corrections", () => {
    const m = (t: string) => matchLegend(t, LEGEND);
    expect(m("SEPM")).toMatchObject({ item: { code: "BCS501" }, fuzzy: false });
    expect(m("TOC")?.item.code).toBe("BCS503");
    expect(m("RMIPR")?.item.code).toBe("BRMK507");
    expect(m("PE")).toMatchObject({ item: { code: "BCS505X" }, fuzzy: false }); // start of "Professional Elective Course"
    expect(m("Mini Project")?.item.code).toBe("BCS506");
    expect(m("CULTURAL")?.item.code).toBe("BNSK509");
    expect(m("SEMM")).toMatchObject({ item: { code: "BCS501" }, fuzzy: true });
    expect(m("ON")).toMatchObject({ item: { code: "BCS502" }, fuzzy: true });
    expect(m("Muni Progect")).toMatchObject({ item: { code: "BCS506" }, fuzzy: true });
    expect(m("Library")).toBeNull();
    expect(m("Placement")).toBeNull();
  });

  it("recognises activities, tolerating OCR slips", () => {
    expect(matchActivity("Library")).toMatchObject({ item: { name: "Library", type: "ACTIVITY" }, fuzzy: false });
    expect(matchActivity("Procioring")).toMatchObject({ item: { name: "Proctoring", type: "MENTORING" }, fuzzy: true });
    expect(matchActivity("TIC Activity")?.item.name).toBe("IIC Activity");
    expect(matchActivity("Department Activity")?.item.name).toBe("Department Activity");
    expect(matchActivity("SEPM")).toBeNull();
  });
});

describe("routine header", () => {
  it("reads class room and section", () => {
    expect(parseRoutineHeader("Semester/ Section: 5th J   DIVISION-4   Class Room: EAB -206")).toEqual({ classRoom: "EAB-206", section: "5J" });
    expect(parseRoutineHeader("nothing useful")).toEqual({ classRoom: null, section: null });
  });
});

const entry = (rawText: string, over: Partial<ParsedEntry> = {}): ParsedEntry => ({
  id: "x",
  dayOfWeek: 1,
  startPeriod: 1,
  endPeriod: 1,
  subjectCode: null,
  subjectName: rawText,
  section: null,
  semester: null,
  room: null,
  type: "THEORY",
  confidence: 92,
  lowConfidence: false,
  rawText,
  ...over,
});

describe("enrichRoutineEntry", () => {
  const ctx = { legend: LEGEND, teachers: [{ id: "t1", name: "Mrs. Geetha P L" }], classRoom: "EAB-206" };

  it("fills subject, code, faculty (linked to the account) and class room from the legend", () => {
    const e = enrichRoutineEntry(entry("SEPM"), ctx);
    expect(e).toMatchObject({ subjectName: "Software Engineering and Project Management", subjectCode: "BCS501", teacherId: "t1", room: "EAB-206", type: "THEORY", lowConfidence: false });
  });

  it("keeps an unregistered faculty name as printed", () => {
    expect(enrichRoutineEntry(entry("TOC"), ctx)).toMatchObject({ teacherName: "Dr. Surekha K B", teacherId: null });
  });

  it("types activities and leaves them without room or teacher", () => {
    expect(enrichRoutineEntry(entry("Placement"), ctx)).toMatchObject({ type: "ACTIVITY", subjectName: "Placement", room: null, teacherName: null });
    expect(enrichRoutineEntry(entry("Proctoring", { endPeriod: 2 }), ctx)).toMatchObject({ type: "MENTORING" });
  });

  it("marks multi-batch lab cells as labs to be checked", () => {
    const e = enrichRoutineEntry(entry("WEB LAB-J1-ATLAB/SVH, BG CN LAB-J2-307/SMS,MM", { startPeriod: 5, endPeriod: 6 }), ctx);
    expect(e).toMatchObject({ type: "LAB", lowConfidence: true });
  });

  it("flags OCR-corrected abbreviations", () => {
    expect(enrichRoutineEntry(entry("ON"), ctx)).toMatchObject({ subjectCode: "BCS502", lowConfidence: true });
  });
});

// ---- grid + legend on synthetic OCR words with fake table lines -----------------

const W = (text: string, x: number, y: number): OcrWord => ({ text, confidence: 92, bbox: { x0: x - 25, y0: y - 8, x1: x + 25, y1: y + 8 } });
// Column boundaries: DAY | I | II | BREAK | III | IV | LUNCH | V | VI | VII
const BOUNDS = [0, 200, 400, 600, 700, 900, 1100, 1200, 1400, 1600, 1800];
const centre = (i: number) => (BOUNDS[i] + BOUNDS[i + 1]) / 2; // i = column index (1 = period I)
const ROW = (d: number) => 200 + d * 60;
/** Missing vertical lines (merged cells): "day:boundaryX" */
function fakeTable(merged: Set<string>, legendTop: number, legendBounds: number[]): TableLines {
  return {
    lineXs: (y0) => (y0 > legendTop - 20 ? legendBounds : BOUNDS),
    separated: (x, y0, y1) => {
      if (y0 > legendTop - 20) return (y0 + y1) / 2 < legendTop + 200; // legend lines end at legendTop + 200
      const day = [1, 2, 3, 4, 5, 6].find((d) => Math.abs(ROW(d) - (y0 + y1) / 2) < 20);
      return !merged.has(`${day}:${Math.round(x)}`);
    },
  };
}

describe("BMSIT grid: columns from lines, merged cells, legend", () => {
  const words: OcrWord[] = [
    // header row (times partly misread on purpose: lines decide the columns)
    W("I", centre(1), 150), W("8.30-9.25", centre(1), 165), W("x08", centre(2), 165), W("1203.18", centre(8), 165),
    // day labels
    ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((d, i) => W(d, 100, ROW(i + 1))),
    W("SEPM", centre(1), ROW(1)), W("TOC", centre(2), ROW(1)), W("CN", centre(4), ROW(1)), W("Library", centre(5), ROW(1)),
    W("Mini", centre(8) - 30, ROW(1)), W("Project", centre(8) + 30, ROW(1)), // merged V–VII, text centred in VI
    W("B", centre(3), ROW(2)), W("R", centre(3), ROW(3)), // vertical BREAK letters: ignored
    W("IIC", BOUNDS[2] - 30, ROW(6)), W("Activity", BOUNDS[2] + 30, ROW(6)), // merged I–II, text straddles the boundary
    // legend
    W("SUBJECT", 300, 700), W("CODE", 900, 700), W("FACULTY", 1300, 700),
    W("Theory", 150, 740), W("of", 220, 740), W("Computation", 320, 740), W("BCSS03", 900, 740), W("Dr", 1250, 740), W("Surekha", 1320, 740), W("KB", 1400, 740),
    W("Mini", 150, 775), W("Project", 230, 775), W("BCSS06", 900, 775), W("Prof", 1250, 775), W("Spandana", 1340, 775),
    W("PRINCIPAL", 1300, 980), // signature area below the legend's lines
  ];
  const merged = new Set([`1:${BOUNDS[8]}`, `1:${BOUNDS[9]}`, `6:${BOUNDS[2]}`]);
  const table = fakeTable(merged, 700, [50, 650, 1100, 1700]);
  const parsed = parseTimetableWords(words, BMSIT, { requireSection: false, table });
  const at = (day: number, p: number) => parsed.entries.find((e) => e.dayOfWeek === day && e.startPeriod === p);

  it("maps columns by the header row's lines even when the printed times are misread", () => {
    expect(at(1, 1)?.rawText).toBe("SEPM");
    expect(at(1, 2)?.rawText).toBe("TOC");
    expect(at(1, 3)?.rawText).toBe("CN");
    expect(at(1, 4)?.rawText).toBe("Library");
  });

  it("turns cells without an inner line into one multi-period class", () => {
    expect(at(1, 5)).toMatchObject({ endPeriod: 7, rawText: "Mini Project" });
    expect(at(6, 1)).toMatchObject({ endPeriod: 2, rawText: "IIC Activity" });
  });

  it("ignores text inside break columns", () => {
    expect(parsed.entries.some((e) => /^[BR]$/.test(e.rawText))).toBe(false);
  });

  it("reads the legend and stops where its table ends", () => {
    const legend = parseLegend(words, table, parsed.gridBottom!);
    expect(legend.map((l) => [l.name, l.code, l.faculty])).toEqual([
      ["Theory of Computation", "BCS503", "Dr Surekha KB"],
      ["Mini Project", "BCS506", "Prof Spandana"],
    ]);
  });
});
