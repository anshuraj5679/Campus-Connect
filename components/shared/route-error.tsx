"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleExclamationPoint } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Error state with Retry, used by every route group's error.tsx. */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border bg-card px-6 py-12 text-center shadow-card">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-status-leave-bg">
        <TriangleExclamationPoint aria-hidden className="size-7 text-status-leave" />
      </span>
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">
        This page couldn&apos;t be loaded. It may be a network problem. Please try again.
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted-foreground tabular-nums">Reference: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button size="lg" onClick={() => reset()}>
          <RotateCcw aria-hidden /> Try again
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="/">Go to my dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
