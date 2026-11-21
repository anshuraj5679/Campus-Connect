import type { Metadata } from "next";
import { ForbiddenView } from "@/components/shared/forbidden-view";

export const metadata: Metadata = { title: "Access denied" };

/** Target of the middleware's 403 rewrite and of account-state redirects. */
export default async function ForbiddenPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return <ForbiddenView reason={reason} />;
}
