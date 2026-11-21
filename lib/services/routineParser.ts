/**
 * Section routine reading for the department timetable format (BMSIT&M):
 *
 *   grid cells hold short abbreviations ("SEPM", "TOC", "CN", "PE") or activities
 *   ("Library", "Placement", "IIC Activity"), and a legend table under the grid
 *   maps each subject to its full name, code and faculty:
 *
 *     SUBJECT                                       | CODE   | FACULTY        | FACULTY FOR PRACTICAL
 *     Software Engineering and Project Management   | BCS501 | Mrs.Geetha P L |
 *
 * Everything here is pure and works on OCR words, so it is unit-tested with
 * synthetic input and with words read from a real photo.
 */
import type { OcrWord, ParsedEntry } from "./ocrParser";
import { matchTeacherName, stripTeacherTokens } from "./ocrParser";
import type { TableLines } from "./ocrPreprocess";
import type { ClassType } from "./availability";

export type LegendRow = { name: string; code: string | null; faculty: string | null; practical: string | null; confidence: number };

export type RoutineHeader = { classRoom: string | null; section: string | null };

export type EnrichedEntry = ParsedEntry & {
  teacherName: string | null;
  teacherId: string | null;
  /** Which legend row (subject) this class came from, so a fix to that subject updates every class. */
  legendIndex?: number;
  /** Lab cells take the practical faculty */
  practical?: boolean;
};

const cx = (w: OcrWord) => (w.bbox.x0 + w.bbox.x1) / 2;
const cy = (w: OcrWord) => (w.bbox.y0 + w.bbox.y1) / 2;
const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Same word allowing OCR slips: 1 edit per 4 letters (min 1 for words of 4+ letters). */
function similarWord(a: string, b: string) {
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  if (len < 4) return false;
  return levenshtein(a, b) <= Math.max(1, Math.floor(len / 4));
}

// ---------------------------------------------------------------- codes

const DIGIT_FOR: Record<string, string> = { S: "5", O: "0", D: "0", Q: "0", I: "1", L: "1", Z: "2", B: "8", G: "6", "%": "8", "&": "8" };

/**
 * Clean a course code read by OCR: "BCSS01" → "BCS501", "BCSLS04" → "BCSL504",
 * "BCSS0SX" → "BCS505X", "BRMKS07" → "BRMK507". Letters that look like digits
 * are converted in the 3-digit part only. Null when it can't be made sense of.
 */
export function normalizeCode(raw: string): string | null {
  const first = raw.toUpperCase().split("/")[0].replace(/[^A-Z0-9%&]/g, "");
  const m = first.match(/^([A-Z]{2,5}?)([0-9SODQILZBG%&]{3})([A-Z]?)$/);
  if (!m || !/\d/.test(m[2])) return null;
  return m[1] + m[2].replace(/[^0-9]/g, (c) => DIGIT_FOR[c] ?? c) + m[3];
}

// ---------------------------------------------------------------- legend

type Line = { y: number; words: OcrWord[] };

function textLines(words: OcrWord[]): Line[] {
  const sorted = [...words].sort((a, b) => cy(a) - cy(b));
  const h = sorted.length ? sorted.reduce((n, w) => n + (w.bbox.y1 - w.bbox.y0), 0) / sorted.length : 20;
  const lines: Line[] = [];
  for (const w of sorted) {
    const line = lines.find((l) => Math.abs(l.y - cy(w)) < h * 0.55);
    if (line) {
      line.words.push(w);
      line.y = line.words.reduce((n, x) => n + cy(x), 0) / line.words.length;
    } else lines.push({ y: cy(w), words: [w] });
  }
  return lines.sort((a, b) => a.y - b.y);
}

const isHeaderWord = (w: string, target: string) => similarWord(letters(w), target);

/**
 * Read the SUBJECT / CODE / FACULTY table below the grid. Columns come from the
 * table's vertical lines (falling back to the header words' positions); a line
 * with an empty SUBJECT cell continues the row above (wrapped faculty names).
 */
export function parseLegend(words: OcrWord[], table: TableLines | undefined, fromY: number): LegendRow[] {
  const below = words.filter((w) => cy(w) > fromY && w.text.trim());
  const lines = textLines(below);
  const headerIdx = lines.findIndex((l) => {
    const t = l.words.map((w) => w.text);
    const hits = ["SUBJECT", "CODE", "FACULTY"].filter((target) => t.some((x) => isHeaderWord(x, target)));
    return hits.length >= 2;
  });
  if (headerIdx < 0) return [];
  const header = lines[headerIdx];
  const lineH = header.words.reduce((n, w) => n + (w.bbox.y1 - w.bbox.y0), 0) / header.words.length;

  // Body lines: until a large vertical gap (signatures / footer below the legend)
  const body: Line[] = [];
  let lastY = header.y;
  for (const l of lines.slice(headerIdx + 1)) {
    if (l.y - lastY > lineH * 3.2) break;
    body.push(l);
    lastY = l.y;
  }
  if (!body.length) return [];

  // Column intervals
  const findX = (target: string) => header.words.find((w) => isHeaderWord(w.text, target));
  const subjectW = findX("SUBJECT");
  const codeW = findX("CODE");
  const facultyW = header.words.find((w) => isHeaderWord(w.text, "FACULTY") && cx(w) > (codeW ? cx(codeW) : 0));
  const practicalW = header.words.find((w) => isHeaderWord(w.text, "PRACTICAL"));
  let bounds: number[] = table ? table.lineXs(header.y, Math.min(lastY, header.y + lineH * 6)) : [];
  if (bounds.length < 3) {
    // No lines: split halfway between header words
    const xs = [subjectW, codeW, facultyW, practicalW].filter((w): w is OcrWord => !!w).map(cx);
    if (xs.length < 2) return [];
    bounds = [-Infinity, ...xs.slice(1).map((x, i) => (xs[i] + x) / 2), Infinity];
  }
  const intervals = bounds.slice(0, -1).map((x, i) => [x, bounds[i + 1]] as const);
  const intervalOf = (x: number | undefined, fallback: number) =>
    x === undefined ? (fallback < intervals.length ? fallback : -1) : intervals.findIndex(([a, b]) => x >= a && x < b);
  const col = {
    name: intervalOf(subjectW && cx(subjectW), 0),
    code: intervalOf(codeW && cx(codeW), 1),
    faculty: intervalOf(facultyW && cx(facultyW), 2),
    practical: intervalOf(practicalW && cx(practicalW), 3),
  };

  // The legend ends where its table does: a line with no column line beside it
  // (signatures, footer) is outside.
  const nameRight = col.name >= 0 ? intervals[col.name][1] : Infinity;
  if (table && Number.isFinite(nameRight)) {
    const cut = body.findIndex((l) => !table.separated(nameRight, l.y - lineH * 0.5, l.y + lineH * 0.5));
    if (cut >= 0) body.splice(cut);
  }

  const rows: { name: string[]; code: string[]; faculty: string[]; practical: string[]; conf: number[] }[] = [];
  for (const l of body) {
    const cells = { name: [] as OcrWord[], code: [] as OcrWord[], faculty: [] as OcrWord[], practical: [] as OcrWord[] };
    for (const w of [...l.words].sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
      const i = intervals.findIndex(([a, b]) => cx(w) >= a && cx(w) < b);
      if (i === col.name) cells.name.push(w);
      else if (i === col.code) cells.code.push(w);
      else if (i === col.faculty) cells.faculty.push(w);
      else if (i === col.practical) cells.practical.push(w);
    }
    const txt = (ws: OcrWord[]) => ws.map((w) => w.text).join(" ").trim();
    const nameText = txt(cells.name).replace(/^[^A-Za-z]+|[^A-Za-z)]+$/g, "");
    if (nameText.length >= 2) rows.push({ name: [nameText], code: [txt(cells.code)], faculty: [txt(cells.faculty)], practical: [txt(cells.practical)], conf: cells.name.map((w) => w.confidence) });
    else if (rows.length) {
      const r = rows[rows.length - 1];
      r.code.push(txt(cells.code));
      r.faculty.push(txt(cells.faculty));
      r.practical.push(txt(cells.practical));
    }
  }
  const tidyPerson = (s: string) =>
    s
      .replace(/\b(Dr|Mrs|Mr|Ms|Prof)\.?(?=[A-Z])/g, "$1. ")
      .replace(/\s+/g, " ")
      .replace(/^[^A-Za-z]+|[^A-Za-z.)]+$/g, "")
      .trim() || null;
  return rows
    .map((r) => ({
      name: r.name.join(" ").replace(/\s+/g, " "),
      code: normalizeCode(r.code.filter(Boolean).join("")),
      faculty: tidyPerson(r.faculty.filter(Boolean).join(" ")),
      practical: tidyPerson(r.practical.filter(Boolean).join(" ")),
      confidence: r.conf.length ? Math.round(r.conf.reduce((a, b) => a + b, 0) / r.conf.length) : 0,
    }))
    .filter((r) => letters(r.name).length >= 3 && r.confidence >= 40);
}

// ---------------------------------------------------------------- header

/** "Class Room: EAB -206" and "Semester/ Section: 5th J" from the page header. */
export function parseRoutineHeader(text: string): RoutineHeader {
  const room = text.match(/Class\s*Room\s*[:;.-]?\s*([A-Z]{1,5})\s*-?\s*(\d{2,4}[A-Z]?)/i);
  const sec = text.match(/Section\s*[:;.-]?\s*([1-8])\s*(?:st|nd|rd|th)?\W{0,3}\s*([A-Z])\b/i);
  return { classRoom: room ? `${room[1].toUpperCase()}-${room[2].toUpperCase()}` : null, section: sec ? `${sec[1]}${sec[2].toUpperCase()}` : null };
}

// ---------------------------------------------------------------- subjects & activities

const STOP = new Set(["AND", "OF", "THE", "FOR", "IN", "TO", "WITH"]);
const ROMAN_WORD = /^(I|II|III|IV|V|VI|VII|VIII)$/;

/** Abbreviations a subject name is printed as: "Theory of Computation" → TOC / TC. */
export function abbreviations(name: string): string[] {
  const words = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter((w) => w && !ROMAN_WORD.test(w));
  const part = (w: string) => (w.length >= 2 && w === w.toUpperCase() ? w : w[0].toUpperCase());
  const all = words.map(part).join("");
  const noStop = words.filter((w) => !STOP.has(w.toUpperCase())).map(part).join("");
  return [...new Set([all, noStop])].filter((a) => a.length >= 2);
}

const ACTIVITIES: { name: string; type: ClassType }[] = [
  { name: "Library", type: "ACTIVITY" },
  { name: "Placement", type: "ACTIVITY" },
  { name: "Placement Training", type: "ACTIVITY" },
  { name: "Sports", type: "ACTIVITY" },
  { name: "IIC Activity", type: "ACTIVITY" },
  { name: "Department Activity", type: "ACTIVITY" },
  { name: "Club Activity", type: "ACTIVITY" },
  { name: "Cultural", type: "ACTIVITY" },
  { name: "Seminar", type: "ACTIVITY" },
  { name: "Yoga", type: "ACTIVITY" },
  { name: "NSS", type: "ACTIVITY" },
  { name: "Proctoring", type: "MENTORING" },
  { name: "Mentoring", type: "MENTORING" },
  { name: "Counselling", type: "MENTORING" },
  { name: "Tutorial", type: "TUTORIAL" },
];

type Match<T> = { item: T; fuzzy: boolean } | null;

function unique<T>(hits: T[]): T | null | "ambiguous" {
  const u = [...new Set(hits)];
  return u.length === 1 ? u[0] : u.length > 1 ? "ambiguous" : null;
}

/** Match a grid cell ("SEPM", "Mini Project", "SEMM") to a legend row. */
export function matchLegend(cell: string, legend: LegendRow[]): Match<LegendRow> {
  const abbr = letters(cell);
  const cellWords = cell.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
  if (!abbr || !legend.length) return null;
  const nameWords = (r: LegendRow) => r.name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
  const stages: { fuzzy: boolean; test: (r: LegendRow) => boolean }[] = [
    // exact abbreviation (SEPM, TOC, CN, RMIPR)
    { fuzzy: false, test: (r) => abbreviations(r.name).includes(abbr) },
    // the cell is the name, or every word of the cell is a word of the name ("Mini Project", "CULTURAL")
    { fuzzy: false, test: (r) => cellWords.length > 0 && cellWords.every((w) => nameWords(r).includes(w)) },
    // abbreviation of the start of the name (PE → Professional Elective Course I)
    { fuzzy: false, test: (r) => abbr.length >= 2 && abbreviations(r.name).some((a) => a.length > abbr.length && a.startsWith(abbr)) },
    // OCR slip in an abbreviation (SEMM → SEPM, ON → CN)
    { fuzzy: true, test: (r) => abbr.length >= 2 && abbr.length <= 6 && abbreviations(r.name).some((a) => levenshtein(a, abbr) === 1 || (a.length > abbr.length && levenshtein(a.slice(0, abbr.length), abbr) === 1 && abbr.length >= 3)) },
    // OCR slips in words ("Muni Progect"), or the name contained in the cell ("… Studies Project")
    {
      fuzzy: true,
      test: (r) => {
        const nw = nameWords(r);
        if (!cellWords.length || !nw.length) return false;
        const cellInName = cellWords.every((w) => nw.some((n) => similarWord(w, n)));
        const nameInCell = nw.filter((n) => cellWords.some((w) => similarWord(w, n))).length / nw.length >= 0.5 && nw.some((n) => n.length >= 5 && cellWords.some((w) => similarWord(w, n)));
        return cellInName || nameInCell;
      },
    },
  ];
  for (const s of stages) {
    const hit = unique(legend.filter(s.test));
    if (hit === "ambiguous") return null;
    if (hit) return { item: hit, fuzzy: s.fuzzy };
  }
  return null;
}

export function matchActivity(cell: string): Match<(typeof ACTIVITIES)[number]> {
  const t = cell.toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const exact = ACTIVITIES.find((a) => a.name.toUpperCase() === t);
  if (exact) return { item: exact, fuzzy: false };
  const near = ACTIVITIES.filter((a) => {
    const n = a.name.toUpperCase();
    return n.length >= 4 && levenshtein(n, t) <= Math.max(1, Math.floor(n.length * 0.25));
  });
  return near.length === 1 ? { item: near[0], fuzzy: true } : null;
}

const LAB_CELL = /\bLAB\b|LAB[-\s]?[J1-9]/i;

/**
 * Turn a parsed grid cell into a routine class: full subject name, course code
 * and faculty from the legend, activities typed as such, theory classes in the
 * class room. Anything matched with an OCR correction (or not matched at all)
 * stays highlighted for the Cluster Head to check.
 */
export function enrichRoutineEntry(
  e: ParsedEntry,
  ctx: { legend: LegendRow[]; teachers: { id: string; name: string }[]; classRoom: string | null },
): EnrichedEntry {
  const raw = e.rawText.replace(/\s+/g, " ").trim();
  const weak = e.confidence < 60;
  const person = (name: string | null) => {
    const t = name ? matchTeacherName(name, ctx.teachers) : null;
    return { teacherName: t?.name ?? name, teacherId: t?.id ?? null };
  };

  // Sheets without a legend name the teacher inside the cell ("21CS53 DBMS KR 204").
  const fromCell = () => {
    const t = matchTeacherName(raw, ctx.teachers);
    return { name: (t ? stripTeacherTokens(e.subjectName, t.name) : e.subjectName) || e.subjectCode || raw, teacherName: t?.name ?? null, teacherId: t?.id ?? null };
  };

  // Lab (often two batches in one cell: "WEB LAB-J1-ATLAB/SVH, BG  CN LAB-J2-307/SMS,MM")
  if (LAB_CELL.test(raw)) {
    const batches = raw.match(/[A-Z]{2,}\s*LAB/gi)?.length ?? 1;
    const single = batches === 1 ? matchLegend(raw.replace(/\bLAB\b.*$/i, ""), ctx.legend) : null;
    const row = single?.item;
    if (!row && batches === 1) {
      const c = fromCell();
      return { ...e, type: "LAB", subjectName: c.name.slice(0, 120), teacherName: c.teacherName, teacherId: c.teacherId, lowConfidence: e.lowConfidence || weak };
    }
    return {
      ...e,
      type: "LAB",
      subjectCode: row?.code ?? e.subjectCode,
      subjectName: raw.slice(0, 120),
      room: null,
      ...(row ? { legendIndex: ctx.legend.indexOf(row), practical: true } : {}),
      ...person(row ? (row.practical ?? row.faculty) : null),
      // Multi-batch cells pack names, batches, rooms and initials: always worth a look.
      lowConfidence: batches > 1 || weak || !!single?.fuzzy,
    };
  }

  const legend = matchLegend(raw, ctx.legend);
  if (legend) {
    const r = legend.item;
    return {
      ...e,
      type: e.endPeriod > e.startPeriod && /project/i.test(r.name) ? "ACTIVITY" : "THEORY",
      subjectCode: r.code,
      subjectName: r.name.slice(0, 120),
      legendIndex: ctx.legend.indexOf(r),
      room: ctx.classRoom ?? e.room,
      ...person(r.faculty),
      lowConfidence: legend.fuzzy || weak,
    };
  }

  const act = matchActivity(raw);
  if (act) {
    return { ...e, type: act.item.type, subjectCode: null, subjectName: act.item.name, room: null, teacherName: null, teacherId: null, lowConfidence: act.fuzzy && weak };
  }

  // Not in the legend: read the cell itself (code, subject, teacher name/initials, room).
  // With a legend present, an unmatched subject is suspicious, so it stays highlighted.
  const c = fromCell();
  return {
    ...e,
    subjectName: c.name.slice(0, 120) || "Unknown",
    room: e.room ?? ctx.classRoom,
    teacherName: c.teacherName,
    teacherId: c.teacherId,
    lowConfidence: e.lowConfidence || (ctx.legend.length > 0 && !e.subjectCode),
  };
}
