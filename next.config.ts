import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets end-to-end test builds use their own folder (.next-e2e) so they never
  // clobber the running dev server's .next directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Files are uploaded straight to Supabase Storage with signed URLs
    // (lib/upload-client.ts), so server actions only carry small JSON payloads.
    // This stays below Vercel's 4.5 MB request-body limit.
    serverActions: { bodySizeLimit: "2mb" },
    // Enables forbidden() → app/forbidden.tsx with a real HTTP 403 status.
    authInterrupts: true,
  },
};

export default nextConfig;
