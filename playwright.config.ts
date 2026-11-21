import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the demo flows (spec §8 phase 9 + §9 acceptance list).
 * They run against a real Supabase project: global-setup re-seeds the data.
 *   npm run test:e2e
 */
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  // Generous limits: the suite runs against a real remote database and a
  // production build, often on a laptop that is also running a dev server.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Builds into .next-e2e (see next.config.ts) so a running `npm run dev` is not disturbed.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next build && npx next start -p ${port}`,
        // Tests need the demo logins + simulated clock. They also re-seed the database,
        // which the seed script refuses to do once real accounts exist: use a separate
        // Supabase project for testing.
        env: { NEXT_DIST_DIR: ".next-e2e", NEXT_PUBLIC_DEMO_MODE: "true" },
        port,
        reuseExistingServer: false,
        timeout: 900_000, // includes a full production build, which is slow on a busy laptop
      },
});
