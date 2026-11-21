import { expect, test } from "@playwright/test";
import { asNewUser, demoLogin, expectToast, hydrated, open, ready } from "./helpers";

test.describe.serial("Availability", () => {
  test("student finds a teacher and sees live status, cabin and weekly timetable", async ({ page }) => {
    await demoLogin(page, "Student");
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole("heading", { name: /Aarav/ })).toBeVisible();

    await page.getByRole("link", { name: "Find a teacher" }).first().click();
    await expect(page).toHaveURL(/\/teachers/);
    await page.getByRole("searchbox", { name: /Search by name/ }).fill("Kavitha");
    await page.waitForURL(/q=Kavitha/); // let the debounced search apply before clicking
    const card = page.getByRole("link", { name: /Prof\. Kavitha Rao/ });
    await expect(card).toBeVisible();
    // Every card shows a status chip with a text label
    await expect(card.getByText(/Available|In Class|Busy|On Leave|Holiday|Off Campus Hours/).first()).toBeVisible();
    await card.click();

    await expect(page.getByRole("heading", { name: "Prof. Kavitha Rao" })).toBeVisible();
    await expect(page.getByText("Status right now")).toBeVisible();
    await expect(page.getByText("CSE Block, Room 312, 3rd floor").first()).toBeVisible();
    await expect(page.getByRole("table", { name: /Weekly timetable/ })).toBeVisible();
  });

  test("teacher marks unavailability → student sees On Leave (no reason) → Cluster Head is notified", async ({ browser }) => {
    const teacher = await asNewUser(browser);
    await demoLogin(teacher.page, "Teacher");
    await open(teacher.page, "/teacher/unavailability");
    await teacher.page.getByRole("button", { name: "Full day" }).click();
    await teacher.page.locator("#reason").fill("Private reason ZXQ-42");
    await teacher.page.getByRole("button", { name: "Mark unavailable" }).click();
    await expectToast(teacher.page, /Marked unavailable/);
    await teacher.context.close();

    const student = await asNewUser(browser);
    await demoLogin(student.page, "Student");
    await open(student.page, "/teachers?q=Kavitha");
    await student.page.getByRole("link", { name: /Prof\. Kavitha Rao/ }).click();
    await expect(student.page.getByText("On Leave").first()).toBeVisible();
    await expect(student.page.getByText("ZXQ-42")).toHaveCount(0);
    await student.context.close();

    const ch = await asNewUser(browser);
    await demoLogin(ch.page, "Cluster Head");
    await open(ch.page, "/notifications");
    await expect(ch.page.getByText(/Prof\. Kavitha Rao marked unavailability/).first()).toBeVisible();
    await ch.context.close();
  });

  test("meetings off → Busy in a free period, but the switch never overrides In Class", async ({ browser, baseURL }) => {
    // Seeded timetable: Prof. Kavitha Rao is free on Monday P2 (10:00) and teaches 5A on Monday P6 (2:50 PM).
    // Use the next Monday that is not the seeded holiday (today + 7).
    const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000);
    const today = ist(new Date());
    const daysToMonday = ((8 - today.getUTCDay()) % 7) || 7;
    const offset = daysToMonday === 7 ? 14 : daysToMonday;
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset)).toISOString().slice(0, 10);
    const at = (hhmm: string) => new Date(`${monday}T${hhmm}:00+05:30`).toISOString();
    const clock = (iso: string) => [{ name: "cc_sim_time", value: iso, url: baseURL! }];

    const teacher = await asNewUser(browser);
    await teacher.context.addCookies(clock(at("10:00")));
    await demoLogin(teacher.page, "Teacher");
    await expect(teacher.page.getByText("Free until 2:40 PM")).toBeVisible();
    const toggle = teacher.page.getByRole("switch", { name: "Accepting meetings" });
    await hydrated(toggle); // a click before hydration is silently lost
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expectToast(teacher.page, /Meetings turned off/);

    const student = await asNewUser(browser);
    await demoLogin(student.page, "Student");
    await student.context.addCookies(clock(at("10:00")));
    await open(student.page, "/teachers?q=Kavitha");
    await student.page.getByRole("link", { name: /Prof\. Kavitha Rao/ }).click();
    await expect(student.page.getByText("Busy").first()).toBeVisible();

    await student.context.addCookies(clock(at("14:50")));
    await student.page.reload();
    await ready(student.page);
    await expect(student.page.getByText("In Class").first()).toBeVisible();

    await toggle.click(); // restore for later tests
    await expectToast(teacher.page, /accepting meetings/i);
    await Promise.all([teacher.context.close(), student.context.close()]);
  });
});
