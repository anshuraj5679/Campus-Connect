"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock4, RotateCcw, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runJobsNow, setSimulatedTime } from "@/lib/actions/demo";
import { cn } from "@/lib/utils";

/** "2026-11-23T09:30" (IST wall clock) → ISO instant */
function istLocalToIso(local: string) {
  return new Date(`${local}:00+05:30`).toISOString();
}
function isoToIstLocal(iso: string) {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3_600_000);
  return d.toISOString().slice(0, 16);
}

/**
 * Demo-only clock control: lets evaluators jump to a specific IST time to see
 * In Class → Available → On Leave transitions, and run the SLA job on demand.
 */
export function SimulateTime({ nowIso, simulated, presets }: { nowIso: string; simulated: boolean; presets: { label: string; iso: string }[] }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(isoToIstLocal(nowIso));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const apply = (iso: string | null) =>
    startTransition(async () => {
      const r = await setSimulatedTime(iso);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(iso ? "Clock set. All screens now use this time." : "Back to real time.");
        setOpen(false);
        router.refresh();
      }
    });

  const label = new Date(nowIso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground dark:text-foreground",
            simulated && "bg-amber-400 text-amber-950 hover:bg-amber-300 hover:text-amber-950",
          )}
          aria-label={simulated ? `Simulated time: ${label}. Change` : "Simulate time"}
        >
          <Clock4 aria-hidden />
          <span className="hidden xl:inline">{simulated ? label : "Simulate time"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div>
          <p className="font-semibold">Simulate time (demo)</p>
          <p className="text-xs text-muted-foreground">Pins the clock for your browser only. All statuses, today&apos;s classes and SLA timers use it.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sim-time">Date &amp; time (IST)</Label>
          <Input id="sim-time" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <Button key={p.label} variant="outline" size="xs" disabled={pending} onClick={() => apply(p.iso)}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={pending || !value} onClick={() => apply(istLocalToIso(value))}>
            Set time
          </Button>
          <Button variant="outline" disabled={pending || !simulated} onClick={() => apply(null)}>
            <RotateCcw aria-hidden /> Real time
          </Button>
        </div>
        <div className="border-t pt-3">
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await runJobsNow();
                if (r.ok) toast.success("Scheduled jobs ran", { description: r.message });
                else toast.error(r.error);
                router.refresh();
              })
            }
          >
            <Play aria-hidden /> Run SLA &amp; auto-close job now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
