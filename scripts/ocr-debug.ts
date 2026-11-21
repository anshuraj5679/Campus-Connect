/**
 * OCR debug harness (Node): renders the sample timetable, runs Tesseract on it and
 * prints what the parser sees. Used to tune lib/services/ocrParser.ts.
 *   npx tsx scripts/ocr-debug.ts [scale]
 */
import { chromium } from "@playwright/test";
import { createWorker } from "tesseract.js";
import { parseTimetableWords, type OcrWord } from "../lib/services/ocrParser";
import { DEFAULT_PERIOD_SLOTS } from "../lib/services/periods";

const TT: Record<string, Record<number, string>> = {
  MON: { 1: "21CS53 DBMS 5A 204", 3: "21CS53 DBMS 5B 205", 6: "21CS53 DBMS 5A 204" },
  TUE: { 2: "21CS53 DBMS 5B 205", 5: "21CSL55 DBMS LAB 5A CSE-LAB2", 6: "21CSL55 DBMS LAB 5A CSE-LAB2", 7: "21CSL55 DBMS LAB 5A CSE-LAB2" },
  WED: { 1: "21CS53 DBMS 5A 204", 4: "21CS53 DBMS 5B 205" },
  THU: { 2: "21CS53 DBMS 5A 204", 3: "21CS53 DBMS 5B 205" },
  FRI: { 1: "21CS53 DBMS 5B 205", 4: "21CS53 DBMS 5A 204" },
  SAT: { 2: "21CS53 DBMS 5A 204" },
};
const HEAD = ["9:00", "9:55", "BREAK", "11:05", "12:00", "LUNCH", "1:45", "2:40", "3:35"];
const COLS = [1, 2, null, 3, 4, null, 5, 6, 7];

async function main() {
  const scale = Number(process.argv[2] ?? 1);
  const html = `<!doctype html><html><head><style>
    body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#000;background:#fff}
    h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;font-weight:normal;margin:0 0 14px}
    table{border-collapse:collapse} td,th{border:1.5px solid #000;padding:8px 6px;text-align:center;font-size:15px}
    th{background:#eee;width:112px} td.day{font-weight:bold;width:64px} td.brk{background:#f3f3f3;width:40px}
    td{height:56px;width:112px}
  </style></head><body>
  <h1>BMS INSTITUTE OF TECHNOLOGY AND MANAGEMENT</h1>
  <h2>Department of CSE · Faculty Timetable · Prof. Kavitha Rao · Odd Sem 2026-27</h2>
  <table><tr><th>DAY</th>${HEAD.map((h) => `<th>${h}</th>`).join("")}</tr>
  ${Object.entries(TT).map(([day, cells]) => `<tr><td class="day">${day}</td>${COLS.map((p) => (p === null ? `<td class="brk"></td>` : `<td>${(cells[p] ?? "").replace(/ (\S+) (\dA|\dB) /, "<br>$1 $2<br>")}</td>`)).join("")}</tr>`).join("\n")}
  </table></body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1250, height: 640 }, deviceScaleFactor: scale });
  await page.setContent(html);
  const png = await page.screenshot({ fullPage: true });
  await browser.close();

  const worker = await createWorker("eng", 1);
  const psm = process.argv[3];
  if (psm) await worker.setParameters({ tessedit_pageseg_mode: psm as never });
  const { data } = await worker.recognize(png, {}, { blocks: true });
  await worker.terminate();
  const words: OcrWord[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox });

  console.log(`scale ${scale}: ${words.length} words`);
  console.log(words.map((w) => `${w.text}@(${Math.round((w.bbox.x0 + w.bbox.x1) / 2)},${Math.round((w.bbox.y0 + w.bbox.y1) / 2)})c${Math.round(w.confidence)}`).join("  "));
  const r = parseTimetableWords(words, DEFAULT_PERIOD_SLOTS);
  console.log(`\ndays ${r.daysFound}, columns ${r.columnsFound}, headers ${r.usedHeaders}, warnings: ${r.warnings.join(" / ") || "none"}`);
  for (const e of r.entries) console.log(`  day ${e.dayOfWeek} P${e.startPeriod}-${e.endPeriod}  code=${e.subjectCode} sec=${e.section} room=${e.room} type=${e.type} low=${e.lowConfidence} conf=${e.confidence} raw="${e.rawText}"`);
}
main();
