// Real-file OCR check: render a printed-style timetable to PNG and PDF, upload each
// through /teacher/timetable/upload as a teacher, and report what the review grid shows.
//   node scripts/ocr-check.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "test-results/ocr";
mkdirSync(out, { recursive: true });

// What is printed on the sheet (ground truth): day → period → "CODE NAME SECTION ROOM"
const TT = {
  MON: { 1: "21CS53 DBMS 5A 204", 3: "21CS53 DBMS 5B 205", 6: "21CS53 DBMS 5A 204" },
  TUE: { 2: "21CS53 DBMS 5B 205", 5: "21CSL55 DBMS LAB 5A CSE-LAB2", 6: "21CSL55 DBMS LAB 5A CSE-LAB2", 7: "21CSL55 DBMS LAB 5A CSE-LAB2" },
  WED: { 1: "21CS53 DBMS 5A 204", 4: "21CS53 DBMS 5B 205" },
  THU: { 2: "21CS53 DBMS 5A 204", 3: "21CS53 DBMS 5B 205" },
  FRI: { 1: "21CS53 DBMS 5B 205", 4: "21CS53 DBMS 5A 204" },
  SAT: { 2: "21CS53 DBMS 5A 204" },
};
const HEAD = ["9:00", "9:55", "BREAK", "11:05", "12:00", "LUNCH", "1:45", "2:40", "3:35"];
const COLS = [1, 2, null, 3, 4, null, 5, 6, 7];
const expected = Object.values(TT).reduce((n, d) => n + Object.keys(d).length, 0) - 2; // lab P5–P7 merges into one entry

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
// 1. Render the sheet
const sheet = await browser.newPage({ viewport: { width: 1250, height: 640 } });
await sheet.setContent(html);
const png = join(out, "timetable.png");
const pdf = join(out, "timetable.pdf");
await sheet.screenshot({ path: png, fullPage: true });
await sheet.pdf({ path: pdf, landscape: true, printBackground: true, format: "A4" });
await sheet.close();

// 2. Upload each as the teacher and inspect the review screen
for (const file of [png, pdf]) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByRole("button", { name: /^Teacher/ }).click({ force: true });
  await page.waitForURL(/\/teacher/, { timeout: 60000 });
  await page.goto(base + "/teacher/timetable/upload", { waitUntil: "networkidle" });
  const started = Date.now();
  await page.locator("#tt-file").setInputFiles(file);
  const review = page.getByText("Original", { exact: true });
  await review.waitFor({ timeout: 240000 }).catch(() => {});
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (!(await review.isVisible())) {
    console.log(`${file}: review screen did not appear (${secs}s). Errors: ${errors.join(" | ") || "none"}`);
    await page.screenshot({ path: join(out, `fail-${file.endsWith(".pdf") ? "pdf" : "png"}.png`) });
    await ctx.close();
    continue;
  }
  await page.waitForTimeout(800);
  const cells = await page.locator('[data-cell] span.text-sm.font-semibold').allTextContents();
  const flagged = await page.getByText("CHECK", { exact: true }).count();
  const codes = cells.filter((t) => /^\d{2}[A-Z]{2,4}\d{2,3}/.test(t)).length;
  const conflicts = await page.getByText(/errors ·/).first().textContent().catch(() => "");
  console.log(`${file.split(/[\\/]/).pop()}: read ${cells.length} entries (expected ${expected}), ${codes} with a subject code, ${flagged} flagged for review · ${conflicts} · ${secs}s`);
  console.log(`   entries: ${cells.join(", ")}`);
  await page.screenshot({ path: join(out, `review-${file.endsWith(".pdf") ? "pdf" : "png"}.png`) });
  if (errors.length) console.log(`   page errors: ${errors.join(" | ")}`);
  await ctx.close();
}
await browser.close();
