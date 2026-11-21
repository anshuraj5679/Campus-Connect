"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const TABLES = ["teacher_unavailability", "availability_preferences", "timetable_versions", "schedule_overrides"] as const;

/**
 * Keeps availability screens live: re-renders the server component when any
 * availability input changes (Supabase Realtime) and every 60 s (time passes).
 * Shows "Updated just now / 2 min ago".
 */
export function LiveRefresh({ tables = TABLES as unknown as string[], intervalMs = 60_000 }: { tables?: string[]; intervalMs?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [, force] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        router.refresh();
        setUpdatedAt(Date.now());
      }, 400);
    };
    let channel = supabase.channel(`live:${tables.join(",")}`);
    for (const table of tables) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe();
    const poll = setInterval(refresh, intervalMs);
    const tick = setInterval(() => force((n) => n + 1), 20_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [router, tables, intervalMs]);

  const mins = Math.floor((Date.now() - updatedAt) / 60_000);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-available opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-status-available" />
      </span>
      Live · Updated {mins < 1 ? "just now" : `${mins} min ago`}
      <button type="button" onClick={() => { router.refresh(); setUpdatedAt(Date.now()); }} aria-label="Refresh now" className="rounded p-0.5 hover:text-foreground">
        <RefreshCw aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}
