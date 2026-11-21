import { expect, type Browser, type Locator, type Page } from "@playwright/test";

export const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo@12345";

/**
 * Wait until React has hydrated the page. Clicks on server-rendered buttons
 * before hydration are silently lost, which made tests flaky on busy machines.
 * React attaches `__reactProps$…` to every hydrated DOM element.
 */
export async function ready(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForFunction(
    () => {
      const el = document.querySelector("main button, main a[href], form button, header button");
      return !el || Object.keys(el).some((k) => k.startsWith("__reactProps"));
    },
    null,
    { timeout: 60_000 },
  );
}

/** Wait until a specific element is hydrated (has React props attached). */
export async function hydrated(locator: Locator) {
  await locator.waitFor();
  await expect
    .poll(() => locator.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { timeout: 60_000 })
    .toBe(true);
}

/** Navigate and wait for an interactive page (never `networkidle`: live pages keep a connection open). */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await ready(page);
}

/** One-click demo login (Student / Teacher / Cluster Head / Head of Department / Administrator). */
export async function demoLogin(page: Page, role: "Student" | "Teacher" | "Cluster Head" | "Head of Department" | "Administrator") {
  await open(page, "/login");
  const button = page.getByRole("button", { name: new RegExp(`^${role}`) });
  await hydrated(button);
  await button.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  await ready(page);
}

/** Email + password login (for seeded accounts that have no demo button). */
export async function emailLogin(page: Page, email: string) {
  await open(page, "/login");
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await hydrated(submit);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  await ready(page);
}

export async function asNewUser(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 45_000 });
}
