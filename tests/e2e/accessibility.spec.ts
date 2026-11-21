import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoLogin, open } from "./helpers";

/** No serious/critical WCAG 2 A/AA violations on the key screens, and no sideways scrolling at 360 px. */
const PAGES: [Parameters<typeof demoLogin>[1], string[]][] = [
  ["Student", ["/student", "/teachers", "/student/complaints/new"]],
  ["Teacher", ["/teacher", "/teacher/timetable"]],
  ["Head of Department", ["/hod", "/hod/complaints"]],
];

for (const [role, routes] of PAGES) {
  test(`accessibility: ${role}`, async ({ page }) => {
    await demoLogin(page, role);
    for (const r of routes) {
      await open(page, r);
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${r}: ${v.id}`);
      expect(bad, bad.join("\n")).toEqual([]);
    }
  });
}

test("mobile 360px: student pages do not scroll sideways", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await demoLogin(page, "Student");
  for (const r of ["/student", "/teachers", "/student/complaints", "/notices", "/complaints/CMP-2026-0004"]) {
    await open(page, r);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${r} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await expect(page.getByRole("navigation", { name: "Student navigation" })).toBeVisible();
  await context.close();
});
