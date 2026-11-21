/**
 * Best-effort conversion of OCR output (words with bounding boxes) into draft
 * timetable entries. The result ALWAYS goes to the review screen; nothing
 * parsed here can be published until the teacher has checked it.
 *
 * Approach:
 *  1. Find day labels (MON…SAT) on the left → one row per day.
 *  2. Find period headers (P1, I–VII, or start times like 9:00) → column centres.
 *     If headers are missing, split the area right of the day labels evenly.
 *  3. Put every remaining word into the nearest (day, column) cell.
 *  4. Read each cell: subject code, section (5A), room, LAB keyword.
 *  5. Merge identical neighbouring cells into one span (labs).
 *  6. Mark cells with weak OCR confidence or missing fields as low confidence.
 */
import type { ClassType } from "./availability";
import { timeToMinutes } from "./time";
import type { PeriodSlot } from "./periods";
import type { TableLines } from "./ocrPreprocess";

export type OcrWord = {
  text: string;
  confidence: number; // 0–100
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type ParsedEntry = {
  id: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  subjectCode: string | null;
  subjectName: string;
  section: string | null;
  semester: number | null;
  room: string | null;
  type: ClassType;
  confidence: number;
  lowConfidence: boolean;
  rawText: string;
};

export type ParseResult = {
  entries: ParsedEntry[];
  daysFound: number;
  columnsFound: number;
  usedHeaders: boolean;
  warnings: string[];
  /** y just below the last day row (where a subject legend may start) */
  gridBottom?: number;
  /** Cell geometry when the table lines were found (used to re-read cells OCR skipped). */
  grid?: { rows: { day: number; y: number }[]; rowGap: number; columns: { period: number | null; left: number; right: number }[] };
};

const DAY_PATTERNS: [RegExp, number][] = [
  [/^mon/i, 1],
  [/^tue/i, 2],
  [/^wed/i, 3],
  [/^thu/i, 4],
  [/^fri/i, 5],
  [/^sat/i, 6],
];
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
const SUBJECT_CODE = /\b(\d{2}[A-Z]{2,4}\d{2,3}[A-Z]?|[A-Z]{2,4}\d{3,4})\b/;
const SECTION = /\b([1-8])\s?-?\s?([A-H])\b/;
const ROOM = /\b(?:R(?:OOM)?\.?\s?-?\s?)?([A-Z]{0,3}-?\d{3}[A-Z]?)\b/;
const LOW_CONFIDENCE = 75;

const cx = (w: OcrWord) => (w.bbox.x0 + w.bbox.x1) / 2;
const cy = (w: OcrWord) => (w.bbox.y0 + w.bbox.y1) / 2;

/** Whole-word day labels (abbreviated or full), so names like "Satish" are not taken for SAT. */
const DAY_WORD = /^(MON(DAY)?|TUE(S|SDAY)?|WED(NESDAY)?|THU(R|RS|RSDAY)?|FRI(DAY)?|SAT(URDAY)?)$/;

function dayOf(text: string): number | null {
  // OCR often reads I as 1 / l / |, O as 0 and S as 5 in short capitalised labels ("FRl", "M0N", "5AT").
  const t = text.toUpperCase().replace(/[1L|!]/g, "I").replace(/0/g, "O").replace(/5/g, "S").replace(/[^A-Z]/g, "");
  if (t.length < 3 || !DAY_WORD.test(t)) return null;
  for (const [re, d] of DAY_PATTERNS) if (re.test(t)) return d;
  return null;
}

/**
 * Fill positions that OCR missed (a day label or a period header) by linear
 * interpolation over their index (day number / column order). Gaps between two
 * found positions are always filled; at the edges at most `extrapolate` steps.
 */
export function fillPositions(known: Map<number, number>, wanted: number[], extrapolate = 0): Map<number, number> {
  const idx = [...known.keys()].sort((a, b) => a - b);
  const out = new Map(known);
  if (idx.length < 2) return out;
  const first = idx[0];
  const last = idx[idx.length - 1];
  const step = (known.get(last)! - known.get(first)!) / (last - first);
  for (const i of wanted) {
    if (out.has(i)) continue;
    const lo = [...idx].reverse().find((k) => k < i);
    const hi = idx.find((k) => k > i);
    if (lo !== undefined && hi !== undefined) out.set(i, known.get(lo)! + ((known.get(hi)! - known.get(lo)!) * (i - lo)) / (hi - lo));
    else if (lo !== undefined && i - lo <= extrapolate) out.set(i, known.get(lo)! + step * (i - lo));
    else if (hi !== undefined && hi - i <= extrapolate) out.set(i, known.get(hi)! - step * (hi - i));
  }
  return out;
}

const BREAK_WORD = /^(BREAK|LUNCH|RECESS|TEA|SHORT)$/i;

/** Period number a header word refers to, if any. */
function headerPeriod(text: string, teaching: PeriodSlot[]): number | null {
  const t = text.trim().toUpperCase().replace(/[^A-Z0-9:.]/g, "");
  const p = t.match(/^P(\d{1,2})$/);
  if (p) return Number(p[1]);
  if (ROMAN[t] && teaching.some((s) => s.periodNo === ROMAN[t])) return ROMAN[t];
  const time = t.match(/^(\d{1,2})[:.](\d{2})/);
  if (time) {
    let h = Number(time[1]);
    if (h < 8) h += 12; // 1:45 → 13:45
    const minutes = h * 60 + Number(time[2]);
    const slot = teaching.find((s) => Math.abs(timeToMinutes(s.start) - minutes) <= 10);
    return slot?.periodNo ?? null;
  }
  return null;
}

const LAB_ROOM = /\b((?:[A-Z]{2,4}-?)?LAB-?\d{1,2})\b/;

/** Letters OCR commonly reads as each digit (e.g. "C"→"0", "S"/"B"→"8"). */
const DIGIT_LOOKALIKES: Record<string, string> = { "0": "OCDQ", "1": "IL", "2": "Z", "4": "A", "5": "S", "6": "G", "8": "BS" };

function confusable(read: string, real: string) {
  return read === real || (DIGIT_LOOKALIKES[read] ?? "").includes(real) || (DIGIT_LOOKALIKES[real] ?? "").includes(read);
}

/**
 * Snap a misread token (e.g. "210853") to a subject code that exists in the
 * college (e.g. "21CS53"): same length, at most 2 differences, every
 * difference a known OCR look-alike, and exactly one candidate.
 */
export function correctSubjectCode(token: string, knownCodes: string[]): string | null {
  const t = token.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t.length < 5 || t.length > 9 || (t.match(/\d/g) ?? []).length < 3) return null;
  const candidates = [...new Set(knownCodes.map((c) => c.toUpperCase()))].filter((code) => {
    if (code.length !== t.length || code === t) return code === t;
    let diffs = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === code[i]) continue;
      if (!confusable(t[i], code[i])) return false;
      diffs++;
    }
    return diffs <= 2;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

const HONORIFIC = /^(dr|prof|mr|mrs|ms|miss)\.?$/i;

/**
 * Find the faculty member a routine cell refers to: either their full name
 * (all name words present, honorifics ignored) or their initials as a
 * separate token ("KR" for "Prof. Kavitha Rao"). Only an unambiguous match
 * is returned.
 */
export function matchTeacherName<T extends { id: string; name: string }>(text: string, teachers: T[]): T | null {
  // Compare with OCR look-alikes folded together ("lyer" = "Iyer", "R0Y" = "ROY").
  const fold = (s: string) => s.toUpperCase().replace(/[L1|]/g, "I").replace(/0/g, "O");
  const tokens = new Set(fold(text).replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
  const hits = teachers.filter((t) => {
    const words = fold(t.name).replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w && !HONORIFIC.test(w));
    if (words.length === 0) return false;
    const initials = words.map((w) => w[0]).join("");
    // Name words of 3+ letters must all appear; single-letter initials are often run
    // together ("Geetha PL" for "Geetha P L"), so they are not required.
    const required = words.filter((w) => w.length >= 3);
    return (required.length ? required : words).every((w) => tokens.has(w)) || (initials.length >= 2 && tokens.has(initials));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** Remove a matched teacher's name words / initials from text read out of a cell. */
export function stripTeacherTokens(text: string, teacherName: string): string {
  const fold = (s: string) => s.toUpperCase().replace(/[L1|]/g, "I").replace(/0/g, "O");
  const words = fold(teacherName).replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w && !HONORIFIC.test(w));
  const drop = new Set([...words, words.map((w) => w[0]).join("")]);
  return text
    .split(/\s+/)
    .filter((t) => !drop.has(fold(t).replace(/[^A-Z0-9]/g, "")) && !HONORIFIC.test(t))
    .join(" ")
    .trim();
}

export function parseCellText(text: string, knownCodes: string[] = []) {
  const upper = text.toUpperCase();
  let code = upper.match(SUBJECT_CODE)?.[1] ?? null;
  let codeToken = code;
  let corrected = false;
  if (!code || (knownCodes.length && !knownCodes.includes(code))) {
    for (const token of upper.split(/\s+/)) {
      const fixed = correctSubjectCode(token, knownCodes);
      if (fixed) {
        corrected = fixed !== token;
        code = fixed;
        codeToken = token;
        break;
      }
    }
  }

  let section: string | null = null;
  let sectionToken: string | null = null;
  const sec = upper.match(SECTION);
  if (sec) {
    section = `${sec[1]}${sec[2]}`;
    sectionToken = sec[0];
  } else {
    // "5B" is often read as "58"
    const misread = upper.split(/\s+/).find((tok) => /^[1-8]8$/.test(tok));
    if (misread) {
      section = `${misread[0]}B`;
      sectionToken = misread;
    }
  }

  let room: string | null = null;
  const rest = upper.replace(codeToken ?? "@@", " ").replace(sectionToken ?? "@@", " ");
  const lab = rest.match(LAB_ROOM);
  if (lab) room = lab[1];
  else {
    const roomMatch = rest.match(ROOM);
    if (roomMatch && /\d{3}/.test(roomMatch[1])) room = roomMatch[1];
  }

  const type: ClassType = /\bLAB\b/.test(upper) || /\d{2}[A-Z]{2,4}L\d{2}/.test(code ?? "") ? "LAB" : /\bTUT/.test(upper) ? "TUTORIAL" : /\bMENTOR/.test(upper) ? "MENTORING" : "THEORY";
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const name = text
    .replace(new RegExp(esc(codeToken ?? "@@"), "i"), "")
    .replace(new RegExp(`\\b${esc(sectionToken ?? "@@")}\\b`, "i"), "")
    .replace(new RegExp(esc(room ?? "@@"), "i"), "")
    .replace(/\b(room|lab|r\.)\b/gi, (m) => (m.toLowerCase() === "lab" ? "Lab" : ""))
    .replace(/[|_[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { code, section, room, type, name, corrected };
}

export function parseTimetableWords(
  words: OcrWord[],
  slots: PeriodSlot[],
  opts: {
    knownCodes?: string[];
    /** false for section routines (cells name a teacher, not a section) */
    requireSection?: boolean;
    /** Detected table lines: exact column boundaries and merged cells. */
    table?: TableLines;
  } = {},
): ParseResult {
  const requireSection = opts.requireSection ?? true;
  const warnings: string[] = [];
  const teaching = slots.filter((s) => !s.isBreak && s.periodNo !== null).sort((a, b) => a.sortOrder - b.sortOrder);
  const clean = words.filter((w) => w.text.trim().length > 0);

  // 1. Day rows (keep the left-most label per day)
  const dayWords = new Map<number, OcrWord>();
  for (const w of clean) {
    const d = dayOf(w.text);
    if (d && (!dayWords.has(d) || cx(w) < cx(dayWords.get(d)!))) dayWords.set(d, w);
  }
  const found = [...dayWords.entries()].map(([day, w]) => ({ day, y: cy(w), x1: w.bbox.x1 }));
  if (found.length === 0) {
    return { entries: [], daysFound: 0, columnsFound: 0, usedHeaders: false, warnings: ["No day names (Mon–Sat) were found in the image."] };
  }
  const labelRight = Math.max(...found.map((r) => r.x1));
  // A day label OCR missed between two found days (e.g. "FRI" unread) is placed by position,
  // so its classes are not split between the rows above and below.
  const rowY = fillPositions(new Map(found.map((r) => [r.day, r.y])), [1, 2, 3, 4, 5, 6]);
  const rows = [...rowY.entries()].map(([day, y]) => ({ day, y })).sort((a, b) => a.y - b.y);
  const topRowY = rows[0].y;
  const daySpan = rows[rows.length - 1].day - rows[0].day;
  const rowGap = daySpan > 0 ? (rows[rows.length - 1].y - rows[0].y) / daySpan : 40;
  if (rows.length > found.length) warnings.push(`${rows.length - found.length} day label(s) were not read and were placed by position. Check those rows.`);

  // 2. Columns. Best source: the vertical lines of the header row (exact boundaries),
  //    mapped by order when their count matches the period slots. Otherwise the
  //    period headers (P1 / I–VII / start times), with missed ones placed by position.
  type Column = { period: number | null; x: number; left?: number; right?: number }; // period null = break column (its words are ignored)
  const allSlots = [...slots].sort((a, b) => a.sortOrder - b.sortOrder);
  let columns: Column[] = [];
  let usedHeaders = false;
  let fromLines = false;
  if (opts.table) {
    // A strip just above the first day row's top border: inside the header row whatever its height.
    const xs = opts.table.lineXs(topRowY - rowGap * 0.85, topRowY - rowGap * 0.56);
    const intervals: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      if ((xs[i] + xs[i + 1]) / 2 > labelRight && xs[i + 1] - xs[i] > rowGap * 0.3) intervals.push([xs[i], xs[i + 1]]);
    }
    const order = intervals.length === allSlots.length ? allSlots : intervals.length === teaching.length ? teaching : null;
    if (order) {
      columns = order.map((s, i) => ({ period: s.isBreak ? null : s.periodNo, x: (intervals[i][0] + intervals[i][1]) / 2, left: intervals[i][0], right: intervals[i][1] }));
      usedHeaders = fromLines = true;
    }
  }

  if (!fromLines) {
    const headerHits = new Map<number, number[]>();
    const breakXs: number[] = [];
    for (const w of clean) {
      if (cy(w) >= topRowY - rowGap * 0.4 || cx(w) <= labelRight) continue;
      if (BREAK_WORD.test(w.text.replace(/[^a-z]/gi, ""))) {
        if (!breakXs.some((x) => Math.abs(x - cx(w)) < rowGap / 2)) breakXs.push(cx(w));
        continue;
      }
      const p = headerPeriod(w.text, teaching);
      if (p !== null) headerHits.set(p, [...(headerHits.get(p) ?? []), cx(w)]);
    }
    columns = [...headerHits.entries()]
      .map(([period, xs]) => ({ period, x: xs.reduce((a, b) => a + b, 0) / xs.length }))
      .sort((a, b) => a.x - b.x);
    usedHeaders = columns.length >= Math.max(2, Math.ceil(teaching.length / 2));

    if (usedHeaders) {
      // Fill headers OCR missed by position. Break columns count in the order only when
      // every break header was read (layouts without break columns are common too).
      const breaks = allSlots.filter((s) => s.isBreak);
      const useBreaks = breaks.length > 0 && breakXs.length === breaks.length;
      const order = useBreaks ? allSlots : teaching;
      const known = new Map<number, number>();
      for (const c of columns) known.set(order.findIndex((s) => s.periodNo === c.period), c.x);
      if (useBreaks) [...breakXs].sort((a, b) => a - b).forEach((x, i) => known.set(order.indexOf(breaks[i]), x));
      const pos = fillPositions(known, order.map((_, i) => i), 2);
      const missing = teaching.filter((s) => !headerHits.has(s.periodNo!) && pos.has(order.indexOf(s))).length;
      columns = order
        .map((s, i) => ({ period: s.isBreak ? null : s.periodNo, x: pos.get(i) }))
        .filter((c): c is Column => c.x !== undefined)
        .sort((a, b) => a.x - b.x);
      if (missing) warnings.push(`${missing} period header(s) were not read and were placed by position. Check those columns.`);
    } else {
      const body = clean.filter((w) => cx(w) > labelRight && cy(w) > topRowY - rowGap / 2);
      const maxX = body.length ? Math.max(...body.map((w) => w.bbox.x1)) : labelRight + 700;
      const width = (maxX - labelRight) / teaching.length;
      columns = teaching.map((s, i) => ({ period: s.periodNo!, x: labelRight + width * (i + 0.5) }));
      warnings.push("Period headers were not recognised; columns were estimated by position. Check every cell.");
    }
  }

  // 3. Assign words to cells
  const cells = new Map<string, OcrWord[]>();
  const rowBand = rowGap * 0.6;
  const columnOf = (w: OcrWord) =>
    (fromLines ? columns.find((c) => cx(w) >= c.left! && cx(w) < c.right!) : undefined) ??
    columns.reduce((best, c) => (Math.abs(c.x - cx(w)) < Math.abs(best.x - cx(w)) ? c : best));
  for (const w of clean) {
    if (dayOf(w.text) && cx(w) <= labelRight + 5) continue;
    if (cx(w) <= labelRight) continue;
    if (cy(w) < topRowY - rowBand) continue; // header area
    const row = rows.reduce((best, r) => (Math.abs(r.y - cy(w)) < Math.abs(best.y - cy(w)) ? r : best));
    if (Math.abs(row.y - cy(w)) > rowBand) continue;
    if (fromLines && (cx(w) < columns[0].left! || cx(w) > columns[columns.length - 1].right!)) continue; // outside the table
    const col = columnOf(w);
    if (col.period === null) continue; // inside a break column
    const key = `${row.day}:${col.period}`;
    cells.set(key, [...(cells.get(key) ?? []), w]);
  }

  // 3b. Merged cells: neighbouring periods with no vertical line between them in a row
  //     are one cell ("Mini Project" across V–VII, a lab across III–IV).
  const spans = new Map<string, number>(); // "day:start" → end period
  if (opts.table) {
    const ordered = columns.filter((c) => c.x !== undefined).sort((a, b) => a.x - b.x);
    const pairs: { day: number; a: Column; b: Column; merged: boolean }[] = [];
    for (const r of rows) {
      for (let i = 0; i + 1 < ordered.length; i++) {
        const a = ordered[i];
        const b = ordered[i + 1];
        if (a.period === null || b.period === null) continue; // a break column always separates
        const boundary = fromLines ? a.right! : (a.x + b.x) / 2;
        pairs.push({ day: r.day, a, b, merged: !opts.table.separated(boundary, r.y - rowGap * 0.3, r.y + rowGap * 0.3) });
      }
    }
    // Only trust this when the table's lines were actually found (most boundaries have one).
    if (pairs.length && pairs.filter((p) => !p.merged).length / pairs.length >= 0.4) {
      for (const r of rows) {
        let start: Column | null = null;
        let end: Column | null = null;
        const flush = () => {
          if (start && end && end.period! > start.period!) {
            const words: OcrWord[] = [];
            for (let p = start.period!; p <= end.period!; p++) {
              words.push(...(cells.get(`${r.day}:${p}`) ?? []));
              cells.delete(`${r.day}:${p}`);
            }
            if (words.length) {
              cells.set(`${r.day}:${start.period}`, words);
              spans.set(`${r.day}:${start.period}`, end.period!);
            }
          }
        };
        for (const p of pairs.filter((x) => x.day === r.day)) {
          if (p.merged) {
            if (!start || end !== p.a) {
              flush();
              start = p.a;
            }
            end = p.b;
          }
        }
        flush();
      }
    }
  }

  // 4. Read cells
  type Cell = Omit<ParsedEntry, "id"> & { key: string; merged: boolean };
  const parsed: Cell[] = [];
  for (const [key, ws] of cells) {
    const [day, period] = key.split(":").map(Number);
    // Reading order: line by line (words on the same line left to right)
    const lineH = ws.reduce((n, w) => n + (w.bbox.y1 - w.bbox.y0), 0) / ws.length;
    const sorted = [...ws].sort((a, b) => (Math.abs(cy(a) - cy(b)) < lineH * 0.5 ? a.bbox.x0 - b.bbox.x0 : cy(a) - cy(b)));
    const text = sorted.map((w) => w.text).join(" ").trim();
    if (!text || /^(break|lunch|short|recess|-+)$/i.test(text)) continue;
    const confidence = Math.round(ws.reduce((n, w) => n + w.confidence, 0) / ws.length);
    const { code, section, room, type, name, corrected } = parseCellText(text, opts.knownCodes ?? []);
    const end = spans.get(key);
    parsed.push({
      key,
      dayOfWeek: day,
      startPeriod: period,
      endPeriod: end ?? period,
      merged: end !== undefined,
      subjectCode: code,
      subjectName: name || code || text,
      section,
      semester: section ? Number(section[0]) : null,
      room,
      type,
      confidence,
      // A code snapped from a misread token is a guess, so it still needs the teacher's confirmation.
      lowConfidence: confidence < LOW_CONFIDENCE || corrected || (requireSection && !section) || (!code && name.length < 3),
      rawText: text,
    });
  }

  // 5. Merge identical neighbours into spans (sheets that repeat a lab in each period's cell)
  parsed.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startPeriod - b.startPeriod);
  const entries: ParsedEntry[] = [];
  for (const c of parsed) {
    const prev = entries[entries.length - 1];
    const sameClass =
      prev &&
      prev.dayOfWeek === c.dayOfWeek &&
      prev.endPeriod + 1 === c.startPeriod &&
      (prev.subjectCode ?? prev.subjectName) === (c.subjectCode ?? c.subjectName) &&
      prev.section === c.section;
    if (sameClass) {
      prev.endPeriod = c.endPeriod;
      prev.type = prev.type === "THEORY" && c.type === "THEORY" ? "LAB" : prev.type === "THEORY" ? c.type : prev.type;
      prev.confidence = Math.min(prev.confidence, c.confidence);
      prev.lowConfidence = prev.lowConfidence || c.lowConfidence;
      prev.room = prev.room ?? c.room;
      continue;
    }
    const { key, merged: _merged, ...entry } = c;
    void _merged;
    entries.push({ ...entry, id: `ocr-${key}` });
  }

  if (entries.length === 0) warnings.push("No classes could be read. Try a sharper, straight-on photo or enter the timetable manually.");
  const last = rows[rows.length - 1];
  const grid = fromLines ? { rows, rowGap, columns: columns.map((c) => ({ period: c.period, left: c.left!, right: c.right! })) } : undefined;
  return { entries, daysFound: rows.length, columnsFound: columns.length, usedHeaders, warnings, gridBottom: last.y + rowGap * 0.5, grid };
}