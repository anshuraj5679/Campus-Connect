// QA audit: mobile overflow at 360px + axe accessibility (WCAG 2 A/AA) for every role's pages.
//   node scripts/qa-audit.mjs [baseUrl] [screenshotDir]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const shots = process.argv[3];
const ROUTES = {
  Student: ["/student", "/teachers", "/student/complaints", "/student/complaints/new", "/notices", "/notifications", "/account", "/complaints/CMP-2026-0004"],
  Teacher: ["/teacher", "/teacher/timetable", "/teacher/unavailability", "/teacher/complaints"],
  "Cluster Head": ["/cluster-head", "/cluster-head/complaints", "/cluster-head/teachers", "/cluster-head/announcements"],
  "Head of Department": ["/hod", "/hod/complaints", "/hod/clusters", "/hod/reports"],
  Administrator: ["/admin", "/admin/structure", "/admin/users", "/admin/import", "/admin/periods", "/admin/holidays", "/admin/settings", "/admin/audit"],
};
const PUBLIC = ["/login", "/signup"];

const browser = await chromium.launch();
const DARK = process.env.DARK === "1"; // DARK=1 audits the dark theme
const forceTheme = (ctx) => DARK && ctx.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch {} });
const violations = new Map(); // id → { impact, help, pages:Set, sample }
const overflow = [];

async function audit(page, label) {
  const ow = await page.evaluate(() => {
    const w = window.innerWidth;
    const sw = document.documentElement.scrollWidth;
    if (sw <= w + 1) return null;
    const culprits = [...document.querySelectorAll("body *")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.right > w + 1 && r.width > 0 && !el.closest("[class*='overflow-x-auto'],[class*='overflow-auto']"); })
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
    return { sw, w, culprits };
  });
  if (ow) overflow.push(`${label}: scrollWidth ${ow.sw} > ${ow.w}  ${ow.culprits.join(" | ")}`);
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("nextjs-portal").analyze();
  for (const v of res.violations) {
    if (!["serious", "critical"].includes(v.impact ?? "")) continue;
    if (process.env.VERBOSE) for (const n of v.nodes) console.log(`   · ${label} ${v.id}: ${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n")[1]?.trim()}`);
    const e = violations.get(v.id) ?? { impact: v.impact, help: v.help, pages: new Set(), sample: v.nodes[0]?.target?.join(" ") + " :: " + (v.nodes[0]?.failureSummary ?? "").split("\n").slice(0, 2).join(" ") };
    e.pages.add(label);
    violations.set(v.id, e);
  }
}

// Public pages
{
  const pubCtx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await forceTheme(pubCtx);
  const page = await pubCtx.newPage();
  for (const r of PUBLIC) {
    await page.goto(base + r, { waitUntil: "networkidle" });
    await audit(page, r);
  }
}

for (const [role, routes] of Object.entries(ROUTES)) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  await forceTheme(ctx);
  const page = await ctx.newPage();
  await page.goto(base + "/login");
  // The dev-only Next.js badge can overlap the last demo button on a phone screen.
  await page.getByRole("button", { name: new RegExp(`^${role}`) }).click({ force: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: "networkidle" });
    await audit(page, `${role} ${r}`);
    if (shots && ["/student", "/teacher", "/complaints/CMP-2026-0004", "/teachers"].includes(r)) {
      await page.screenshot({ path: `${shots}/m-${role.replace(/\s/g, "")}${r.replaceAll("/", "_")}.png`, fullPage: true });
    }
  }
  await ctx.close();
}
await browser.close();

console.log(overflow.length ? `HORIZONTAL OVERFLOW (${overflow.length}):\n - ${overflow.join("\n - ")}` : "No horizontal overflow at 360px");
console.log(violations.size ? `\nAXE serious/critical (${violations.size}):` : "\nNo serious/critical axe violations");
for (const [id, v] of violations) console.log(` - [${v.impact}] ${id}: ${v.help}\n     pages: ${[...v.pages].slice(0, 4).join(", ")}${v.pages.size > 4 ? ` (+${v.pages.size - 4})` : ""}\n     e.g. ${v.sample}`);
