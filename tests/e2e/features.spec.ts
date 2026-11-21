import { expect, test, type Page } from "@playwright/test";
import { asNewUser, demoLogin, emailLogin, expectToast, hydrated, open } from "./helpers";

const uid = () => Math.random().toString(36).slice(2, 7);
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function optionValue(page: Page, selectId: string, text: string) {
  return (await page.locator(`#${selectId} option`, { hasText: text }).first().getAttribute("value"))!;
}

test.describe.serial("Sign-up", () => {
  test("a student signs up with USN + section and lands on the student home", async ({ page }) => {
    const id = uid();
    await open(page, "/signup");
    await page.locator("#fullName").fill(`E2E Student ${id}`);
    await page.locator("#email").fill(`e2e.student.${id}@bmsit.test`);
    await page.locator("#usn").fill(`1BY24CS${String(Math.floor(500 + Math.random() * 499))}`);
    await page.locator("#departmentId").selectOption(await optionValue(page, "departmentId", "CSE ·"));
    await page.locator("#sectionId").selectOption(await optionValue(page, "sectionId", "Section 5A"));
    await page.locator("#password").fill("Campus@2026");
    await page.locator("#confirmPassword").fill("Campus@2026");
    await page.getByRole("button", { name: /Create Student account/ }).click();
    await page.waitForURL(/\/student$/, { timeout: 30_000 });
    await expect(page.getByText(/CSE Section 5A · Cluster 2/)).toBeVisible();
  });

  test("a Cluster Head signs up for a vacant cluster; filled seats cannot be chosen", async ({ browser }) => {
    const { page, context } = await asNewUser(browser);
    const id = uid();
    await open(page, "/signup");
    await page.getByRole("button", { name: /Cluster Head/ }).click();
    await page.locator("#departmentId").selectOption(await optionValue(page, "departmentId", "AIML ·"));
    // Cluster 1 already has a head → disabled; Cluster 2 is vacant
    await expect(page.locator("#clusterId option", { hasText: /Cluster 1 \(Cluster Head:/ })).toBeDisabled();
    await page.locator("#clusterId").selectOption(await optionValue(page, "clusterId", "Cluster 2 (vacant)"));
    await page.locator("#fullName").fill(`Dr. E2E Head ${id}`);
    await page.locator("#email").fill(`e2e.ch.${id}@bmsit.test`);
    await page.locator("#employeeId").fill(`E2E-${id}`);
    await page.locator("#password").fill("Campus@2026");
    await page.locator("#confirmPassword").fill("Campus@2026");
    await page.getByRole("button", { name: /Create Cluster Head account/ }).click();
    await page.waitForURL(/\/cluster-head$/, { timeout: 30_000 });
    await expect(page.getByText(/Cluster Head · AIML Cluster 2/)).toBeVisible();
    await context.close();

    // The seat is now taken for everyone else, and every HOD seat is already filled
    const other = await asNewUser(browser);
    await open(other.page, "/signup");
    await other.page.getByRole("button", { name: /Cluster Head/ }).click();
    await other.page.locator("#departmentId").selectOption(await optionValue(other.page, "departmentId", "AIML ·"));
    await expect(other.page.locator("#clusterId option", { hasText: /Cluster 2 \(Cluster Head: Dr\. E2E Head/ })).toBeDisabled();
    await other.page.getByRole("button", { name: /^HOD/ }).click();
    await expect(other.page.locator("#departmentId option", { hasText: /CSE · .*\(HOD: Dr\. Meena Iyer\)/ })).toBeDisabled();
    await other.context.close();
  });
});

test("teacher adds a class and publishes → student sees 'In Class' in that room at that time", async ({ browser, baseURL }) => {
  // Next Monday that is not the seeded holiday; Prof. Kavitha Rao is free on Monday P2 in the seed.
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const days = ((8 - ist.getUTCDay()) % 7) || 7;
  const monday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + (days === 7 ? 14 : days))).toISOString().slice(0, 10);

  const teacher = await asNewUser(browser);
  await demoLogin(teacher.page, "Teacher");
  await open(teacher.page, "/teacher/timetable");
  const freeCell = teacher.page.getByRole("button", { name: "Mon period 2, free. Press Enter to add a class." });
  await hydrated(freeCell);
  await freeCell.click();
  const dialog = teacher.page.getByRole("dialog");
  await dialog.locator("#e-code").fill("21CS99");
  await dialog.locator("#e-name").fill("E2E Seminar");
  await dialog.locator("#e-section").selectOption({ label: "CSE 5A" });
  await dialog.locator("#e-room").fill("999");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await teacher.page.getByRole("button", { name: "Publish" }).click();
  await teacher.page.getByRole("dialog").getByRole("button", { name: "Publish now" }).click();
  await expectToast(teacher.page, /Timetable published/);
  await teacher.context.close();

  const student = await asNewUser(browser);
  await student.context.addCookies([{ name: "cc_sim_time", value: new Date(`${monday}T10:15:00+05:30`).toISOString(), url: baseURL! }]);
  await demoLogin(student.page, "Student");
  await open(student.page, "/teachers?q=Kavitha");
  await student.page.getByRole("link", { name: /Prof\. Kavitha Rao/ }).click();
  await expect(student.page.getByText("21CS99 · 5A · Room 999 until 10:50 AM")).toBeVisible();
  await open(student.page, "/notifications");
  await expect(student.page.getByText(/Prof\. Kavitha Rao published an updated timetable/).first()).toBeVisible();
  await student.context.close();
});

test("HOD publishes a 5th-semester notice → targeted student gets it unread + a notification; a 3rd-sem student does not", async ({ browser }) => {
  const title = `E2E notice ${uid()}`;
  const hod = await asNewUser(browser);
  await demoLogin(hod.page, "Head of Department");
  await open(hod.page, "/hod/announcements");
  await hod.page.locator("#title").fill(title);
  await hod.page.locator("#body").fill("Seminar on Monday for 5th semester students.");
  await hod.page.getByRole("button", { name: "Students", exact: true }).click();
  await hod.page.getByRole("button", { name: "5", exact: true }).click();
  await hod.page.getByRole("button", { name: /Publish notice/ }).click();
  await expectToast(hod.page, /Published to \d+ people/);
  await hod.context.close();

  const student = await asNewUser(browser);
  await demoLogin(student.page, "Student"); // 5A
  await open(student.page, "/notices");
  const card = student.page.locator("article", { hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByLabel("Unread")).toBeVisible();
  await open(student.page, "/notifications");
  await expect(student.page.getByText(`New notice: ${title}`)).toBeVisible();
  await student.context.close();

  const third = await asNewUser(browser);
  await emailLogin(third.page, "spoorthi.gowda11@bmsit.test"); // 3A
  await open(third.page, "/notices");
  await expect(third.page.getByText(title)).toHaveCount(0);
  await third.context.close();
});

test("complaint with evidence is stored privately; the 4th complaint in a day is refused", async ({ browser }) => {
  const { page, context } = await asNewUser(browser);
  await emailLogin(page, "rohit.kulkarni47@bmsit.test");
  for (let i = 1; i <= 4; i++) {
    await open(page, "/student/complaints/new");
    await page.getByRole("button", { name: /Classroom \/ Lab \/ Infrastructure/ }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.locator("#subject").fill(`E2E facility issue ${i}`);
    await page.locator("#description").fill("The fan in the classroom is not working and it is very hot during afternoon classes.");
    if (i === 1) {
      await page.locator("#evidence").setInputFiles({ name: "fan.png", mimeType: "image/png", buffer: PNG_1PX });
      await expect(page.getByText("fan.png")).toBeVisible();
    }
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("button", { name: /Submit complaint/ }).click();
    if (i < 4) {
      await expect(page.getByRole("heading", { name: "Complaint submitted" })).toBeVisible();
      if (i === 1) {
        await page.getByRole("link", { name: "View complaint" }).click();
        await expect(page.getByText("Evidence (1)")).toBeVisible();
        const href = await page.getByRole("link", { name: /fan\.png/ }).getAttribute("href");
        expect(href).toContain("token="); // short-lived signed URL, bucket is private
      }
    } else {
      await expectToast(page, /at most 3 complaints per day/);
    }
  }
  await context.close();
});

test("admin bulk-imports students from CSV with preview and per-row results", async ({ page }) => {
  const id = uid();
  const csv = [
    "full_name,email,usn,department_code,section",
    `E2E Import One,e2e.import1.${id}@bmsit.test,1BY24CS${String(Math.floor(600 + Math.random() * 99))},CSE,5B`,
    `E2E Import Two,e2e.import2.${id}@bmsit.test,1BY25CS${String(Math.floor(700 + Math.random() * 99))},CSE,3A`,
    `Bad Row,not-an-email,XYZ,CSE,5B`,
  ].join("\n");
  await demoLogin(page, "Administrator");
  await open(page, "/admin/import");
  await page.locator("#csv").setInputFiles({ name: "students.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText(/2\s*valid/)).toBeVisible();
  await page.getByRole("button", { name: /Import 2 students/ }).click();
  await expect(page.getByText(/Import finished: 2 created, 0 failed/)).toBeVisible({ timeout: 60_000 });
  await open(page, `/admin/users?q=e2e.import1.${id}`);
  await expect(page.getByText(`e2e.import1.${id}@bmsit.test`)).toBeVisible();
});
