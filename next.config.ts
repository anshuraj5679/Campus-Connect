import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets end-to-end test builds use their own folder (.next-e2e) so they never
  // clobber the running dev server's .next directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Timetable scans (≤10 MB) and complaint evidence (5 × 5 MB) are uploaded through server actions.
    serverActions: { bodySizeLimit: "30mb" },
    // Enables forbidden() → app/forbidden.tsx with a real HTTP 403 status.
    authInterrupts: true,
  },
};

export default nextConfig;
