import { expect, test, type Page } from "@playwright/test";
import { asNewUser, demoLogin, emailLogin, expectToast, open, ready } from "./helpers";

async function raiseComplaint(page: Page, opts: { category: RegExp; teacher?: string; subject: string; routeText: RegExp }) {
  await open(page, "/student/complaints/new");
  await page.getByRole("button", { name: opts.category }).click();
  if (opts.teacher) await page.locator("#teacher").selectOption({ label: opts.teacher });
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.locator("#subject").fill(opts.subject);
  await page.locator("#description").fill("Detailed description of the issue for the end-to-end test run, with enough characters.");
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "This will go to" })).toContainText(opts.routeText);
  await page.getByRole("button", { name: /Submit complaint/ }).click();
  await expect(page.getByRole("heading", { name: "Complaint submitted" })).toBeVisible();
  await expect(page.getByText(/^Sent to /)).toContainText(opts.routeText);
  const code = (await page.locator("text=/CMP-\\d{4}-\\d{4}/").first().textContent())!.match(/CMP-\d{4}-\d{4}/)![0];
  return code;
}

async function handlerAction(page: Page, label: string, remark?: string) {
  await page.getByRole("region", { name: "Actions" }).getByRole("button", { name: label }).click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) {
    if (remark) await dialog.locator("#remark").fill(remark);
    await dialog.getByRole("button", { name: label }).click();
  }
  await expectToast(page, /Status changed|Done/);
}

test.describe.serial("Complaints", () => {
  test("student complaint auto-routes to the Cluster Head, who resolves it", async ({ browser }) => {
    const student = await asNewUser(browser);
    await demoLogin(student.page, "Student");
    const code = await raiseComplaint(student.page, {
      category: /Academic \/ Cluster/,
      subject: "E2E: lab manual not shared",
      routeText: /Dr\. Rajesh Sharma, Cluster Head – Cluster 2/,
    });
    expect(code).toMatch(/^CMP-\d{4}-\d{4}$/);

    const ch = await asNewUser(browser);
    await demoLogin(ch.page, "Cluster Head");
    await open(ch.page, `/complaints/${code}`);
    await expect(ch.page.getByText("E2E: lab manual not shared").first()).toBeVisible();
    await handlerAction(ch.page, "Resolve", "Lab manual uploaded to the cluster drive.");
    await expect(ch.page.getByText("Resolved").first()).toBeVisible();

    await open(student.page, `/complaints/${code}`);
    await expect(student.page.getByText(/Resolved: Lab manual uploaded/)).toBeVisible();
    await student.context.close();
    await ch.context.close();
  });

  test("full lifecycle: response requested → teacher replies → resolved → reopened → escalated → HOD resolves → closed", async ({ browser }) => {
    const student = await asNewUser(browser);
    await demoLogin(student.page, "Student");
    const code = await raiseComplaint(student.page, {
      category: /Against a teacher/,
      teacher: "CSE · Mr. Arjun Menon",
      subject: "E2E: assignments returned without feedback",
      routeText: /Dr\. Rajesh Sharma, Cluster Head/,
    });

    const ch = await asNewUser(browser);
    await demoLogin(ch.page, "Cluster Head");
    await open(ch.page, `/complaints/${code}`);
    await handlerAction(ch.page, "Request teacher response", "Please share your side.");

    const teacher = await asNewUser(browser);
    await emailLogin(teacher.page, "arjun.menon@bmsit.test");
    await open(teacher.page, `/complaints/${code}`);
    await expect(teacher.page.getByText("Your response has been requested")).toBeVisible();
    await expect(teacher.page.getByText("Aarav Kumar")).toHaveCount(0); // student identity withheld
    await teacher.page.locator("#msg").fill("Feedback sheets will be attached from next week.");
    await teacher.page.getByRole("button", { name: "Send" }).click();
    await expectToast(teacher.page, /Message sent/);
    await teacher.context.close();

    await ch.page.reload();
    await ready(ch.page);
    await expect(ch.page.getByText("Feedback sheets will be attached").first()).toBeVisible();
    await handlerAction(ch.page, "Resolve", "Teacher will attach feedback sheets from now on.");

    await open(student.page, `/complaints/${code}`);
    await handlerAction(student.page, "Reopen", "Still no feedback on the latest assignment.");

    await ch.page.reload();
    await ready(ch.page);
    await handlerAction(ch.page, "Escalate", "Repeated issue, needs HOD attention.");

    const hod = await asNewUser(browser);
    await demoLogin(hod.page, "Head of Department");
    await open(hod.page, "/hod/complaints?status=ESCALATED");
    await expect(hod.page.getByRole("link", { name: code })).toBeVisible();
    await open(hod.page, `/complaints/${code}`);
    await handlerAction(hod.page, "Resolve", "HOD reviewed with the faculty; feedback is now mandatory.");

    await student.page.reload();
    await ready(student.page);
    await handlerAction(student.page, "Accept & close");
    await expect(student.page.getByText("Closed").first()).toBeVisible();

    // Every step is on the timeline
    for (const step of ["Submitted the complaint", "Requested a response from the teacher", "Teacher responded", "Reopened by the student", "Escalated", "Closed"]) {
      await expect(student.page.getByText(step).first()).toBeVisible();
    }
    await Promise.all([student.context.close(), ch.context.close(), hod.context.close()]);
  });

  test("an overdue SLA auto-escalates to the HOD", async ({ browser }) => {
    const admin = await asNewUser(browser);
    await demoLogin(admin.page, "Administrator");
    await admin.page.getByRole("button", { name: /Run SLA/ }).first().click();
    await expectToast(admin.page, /Escalated [1-9]/);
    await admin.context.close();

    const hod = await asNewUser(browser);
    await demoLogin(hod.page, "Head of Department");
    await open(hod.page, "/complaints/CMP-2026-0008");
    await expect(hod.page.getByText("Auto-escalated (SLA breached)")).toBeVisible();
    await hod.context.close();
  });

  test("confidential complaints are hidden from the Cluster Head and masked below HOD", async ({ browser }) => {
    const ch = await asNewUser(browser);
    await demoLogin(ch.page, "Cluster Head");
    const res = await ch.page.goto("/complaints/CMP-2026-0007");
    expect(res?.status()).toBe(403);
    await ch.context.close();

    const hod = await asNewUser(browser);
    await demoLogin(hod.page, "Head of Department");
    await open(hod.page, "/complaints/CMP-2026-0007");
    await expect(hod.page.getByText("Confidential").first()).toBeVisible();
    await expect(hod.page.getByText("Confidential Student")).toHaveCount(0); // HOD sees the real identity
    await hod.context.close();
  });

  test("student A cannot open student B's complaint (403)", async ({ browser }) => {
    const other = await asNewUser(browser);
    await emailLogin(other.page, "ananya.hegde46@bmsit.test");
    const res = await other.page.goto("/complaints/CMP-2026-0001");
    expect(res?.status()).toBe(403);
    await expect(other.page.getByText("Error 403")).toBeVisible();
    await other.context.close();
  });
});
