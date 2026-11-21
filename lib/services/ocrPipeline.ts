/**
 * The whole "photo/PDF page → draft timetable" pipeline, independent of the
 * browser: the caller supplies greyscale pixels and an OCR function (Tesseract
 * in the browser, Tesseract in Node for tests on real photos).
 *
 *  1. Clean the image: find table lines, erase them (text stays smooth greyscale).
 *  2. OCR the cleaned image; parse the grid using the lines (column boundaries, merged cells).
 *  3. Fall back to other reading modes / the raw image when the grid isn't found.
 *  4. Section routines: read the subject legend and header, then map each cell's
 *     abbreviation to subject, code and faculty.
 */
import { binarize, eraseLines, findLines, flattenBackground, tableLines, type Gray } from "./ocrPreprocess";
import { parseTimetableWords, type OcrWord, type ParseResult, type ParsedEntry } from "./ocrParser";
import { enrichRoutineEntry, parseLegend, parseRoutineHeader, type EnrichedEntry, type LegendRow, type RoutineHeader } from "./routineParser";
import type { PeriodSlot } from "./periods";

export type OcrRect = { left: number; top: number; width: number; height: number };
/**
 * Run OCR on greyscale pixels. "block" reads one rectangle (a single cell) and
 * must return word boxes in full-image coordinates.
 */
export type OcrFn = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: "sparse" | "auto" | "block",
  rect?: OcrRect,
) => Promise<{ words: OcrWord[]; text: string }>;

/**
 * Cells that hold ink but produced no class: Tesseract sometimes skips a short
 * word ("CN") in full-page mode. Each such cell is read again on its own.
 */
function cellsToReread(parsed: ParseResult, clean: Uint8ClampedArray, w: number): OcrRect[] {
  if (!parsed.grid) return [];
  const covered = new Set<string>();
  for (const e of parsed.entries) for (let p = e.startPeriod; p <= e.endPeriod; p++) covered.add(`${e.dayOfWeek}:${p}`);
  const out: OcrRect[] = [];
  const { rows, rowGap, columns } = parsed.grid;
  for (const r of rows) {
    for (const c of columns) {
      if (c.period === null || covered.has(`${r.day}:${c.period}`)) continue;
      const mx = (c.right - c.left) * 0.08;
      const left = Math.round(c.left + mx);
      const right = Math.round(c.right - mx);
      const top = Math.round(r.y - rowGap * 0.4);
      const bottom = Math.round(r.y + rowGap * 0.4);
      let ink = 0;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (clean[y * w + x] < 140) ink++;
      const area = Math.max(1, (right - left) * (bottom - top));
      if (ink > 40 && ink / area > 0.006) out.push({ left, top, width: right - left, height: bottom - top });
    }
  }
  return out.slice(0, 20);
}

export type PipelineResult = {
  entries: (ParsedEntry | EnrichedEntry)[];
  warnings: string[];
  legend: LegendRow[];
  header: RoutineHeader | null;
  daysFound: number;
};

const score = (p: ParseResult) => p.daysFound * 10 + p.entries.length;

export async function readTimetableImage(
  gray: Gray,
  ocr: OcrFn,
  opts: {
    periods: PeriodSlot[];
    knownCodes: string[];
    /** Section routine mode: cells name subjects/teachers, not sections. */
    routine?: { sectionName: string; teachers: { id: string; name: string }[] };
    onStatus?: (text: string) => void;
  },
): Promise<PipelineResult> {
  const { width: w, height: h } = gray;
  opts.onStatus?.("Finding the table…");
  const lines = findLines(binarize(gray), w, h);
  const table = tableLines(lines);
  // Full-page OCR reads the smooth greyscale best; the flattened (high-contrast) copy is
  // better for spotting faint text in shaded cells and re-reading a single cell.
  const clean = eraseLines(gray, lines);
  const flat = eraseLines(flattenBackground(gray), lines);
  const parseOpts = { knownCodes: opts.knownCodes, requireSection: !opts.routine, table };

  opts.onStatus?.("Reading text (OCR)…");
  let read = await ocr(clean, w, h, "sparse");
  let parsed = parseTimetableWords(read.words, opts.periods, parseOpts);
  if (parsed.daysFound < 3 || parsed.entries.length === 0) {
    opts.onStatus?.("Trying another reading mode…");
    const r2 = await ocr(clean, w, h, "auto");
    const p2 = parseTimetableWords(r2.words, opts.periods, parseOpts);
    if (score(p2) > score(parsed)) [read, parsed] = [r2, p2];
  }
  if (parsed.daysFound < 3 || parsed.entries.length === 0) {
    // Last resort: the untouched image, without line information
    const raw = gray.data instanceof Uint8ClampedArray ? gray.data : new Uint8ClampedArray(gray.data);
    const r3 = await ocr(raw, w, h, "sparse");
    const p3 = parseTimetableWords(r3.words, opts.periods, { knownCodes: opts.knownCodes, requireSection: !opts.routine });
    if (score(p3) > score(parsed)) [read, parsed] = [r3, p3];
  }

  // Re-read cells that have ink but no class
  const missed = cellsToReread(parsed, flat, w);
  if (missed.length) {
    opts.onStatus?.(`Re-reading ${missed.length} cell${missed.length > 1 ? "s" : ""}…`);
    const extra: OcrWord[] = [];
    for (const rect of missed) extra.push(...(await ocr(flat, w, h, "block", rect)).words);
    if (extra.length) {
      const again = parseTimetableWords([...read.words, ...extra], opts.periods, parseOpts);
      if (again.entries.length > parsed.entries.length) {
        read = { words: [...read.words, ...extra], text: read.text };
        parsed = again;
      }
    }
  }

  if (!opts.routine) return { entries: parsed.entries, warnings: parsed.warnings, legend: [], header: null, daysFound: parsed.daysFound };

  opts.onStatus?.("Matching subjects and faculty…");
  const legend = parsed.gridBottom !== undefined ? parseLegend(read.words, table, parsed.gridBottom) : [];
  const header = parseRoutineHeader(read.text);
  const warnings = [...parsed.warnings];
  if (header.section && header.section !== opts.routine.sectionName) {
    warnings.unshift(`This sheet says Section ${header.section}, but you are uploading it for Section ${opts.routine.sectionName}. Check that it is the right file.`);
  }
  if (!legend.length) warnings.push("The subject/faculty table under the timetable was not read, so subjects show as printed (abbreviations). Add codes and faculty while reviewing.");
  const entries = parsed.entries.map((e) => enrichRoutineEntry(e, { legend, teachers: opts.routine!.teachers, classRoom: header.classRoom }));
  return { entries, warnings, legend, header, daysFound: parsed.daysFound };
}
