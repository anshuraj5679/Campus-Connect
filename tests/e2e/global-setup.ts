import { execSync } from "node:child_process";

/** Fresh, known data for every run. Set E2E_SKIP_SEED=1 to reuse the current data. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED === "1") return;
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
}
