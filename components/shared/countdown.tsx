"use client";

import { useEffect, useState } from "react";

/**
 * "starts in 25 min" that keeps ticking. Uses the server's (possibly
 * simulated) clock as the starting point, then advances in real time.
 */
export function Countdown({ targetIso, nowIso, prefix = "Starts in" }: { targetIso: string; nowIso: string; prefix?: string }) {
  const [mountedAt] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  void tick;
  const now = new Date(nowIso).getTime() + (Date.now() - mountedAt);
  const ms = new Date(targetIso).getTime() - now;
  if (ms <= 0) return <span>Starting now</span>;
  const mins = Math.round(ms / 60_000);
  const text = mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${Math.round(mins / 1440)} days`;
  return (
    <span>
      {prefix} <strong className="tabular-nums">{text}</strong>
    </span>
  );
}
