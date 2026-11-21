"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Plus, Save, Trash, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { saveCollegeSettings, savePeriodSlots } from "@/lib/actions/admin";

const DAYS = [
  { n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" }, { n: 4, label: "Thu" }, { n: 5, label: "Fri" }, { n: 6, label: "Sat" }, { n: 7, label: "Sun" },
];

export function SettingsForm({ initial }: { initial: { workingDays: number[]; saturdayRule: string; collegeStart: string; collegeEnd: string; academicYear: string; semesterType: string; slaWorkingDays: number } }) {
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await saveCollegeSettings(v);
          if (r.ok) { toast.success(r.message ?? "Saved"); router.refresh(); } else toast.error(r.error);
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Working days</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d) => (
            <label key={d.n} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={v.workingDays.includes(d.n)} onCheckedChange={(c) => setV({ ...v, workingDays: c ? [...v.workingDays, d.n].sort() : v.workingDays.filter((x) => x !== d.n) })} />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sat">Saturday rule</Label>
          <NativeSelect id="sat" value={v.saturdayRule} onChange={(e) => setV({ ...v, saturdayRule: e.target.value })}>
            <option value="ALL_WORKING">All Saturdays working</option>
            <option value="SECOND_FOURTH_OFF">2nd &amp; 4th Saturday off</option>
            <option value="ALL_OFF">All Saturdays off</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sla">Complaint SLA (working days)</Label>
          <Input id="sla" type="number" min={1} max={30} value={v.slaWorkingDays} onChange={(e) => setV({ ...v, slaWorkingDays: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="start">College opens</Label>
          <Input id="start" type="time" value={v.collegeStart} onChange={(e) => setV({ ...v, collegeStart: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end">College closes</Label>
          <Input id="end" type="time" value={v.collegeEnd} onChange={(e) => setV({ ...v, collegeEnd: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ay">Academic year</Label>
          <Input id="ay" value={v.academicYear} onChange={(e) => setV({ ...v, academicYear: e.target.value })} placeholder="2026-27" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sem">Semester</Label>
          <NativeSelect id="sem" value={v.semesterType} onChange={(e) => setV({ ...v, semesterType: e.target.value })}>
            <option value="ODD">Odd semester</option>
            <option value="EVEN">Even semester</option>
          </NativeSelect>
        </div>
      </div>
      <Button type="submit" size="lg" disabled={pending}>{pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Save aria-hidden />} Save settings</Button>
    </form>
  );
}

type Slot = { label: string; start: string; end: string; isBreak: boolean };

export function PeriodSlotsEditor({ initial }: { initial: Slot[] }) {
  const [slots, setSlots] = useState<Slot[]>(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const set = (i: number, patch: Partial<Slot>) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const next = [...slots];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSlots(next);
  };
  let n = 0;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground uppercase">
            <tr><th className="px-3 py-2.5">Period</th><th className="px-3 py-2.5">Label</th><th className="px-3 py-2.5">Start</th><th className="px-3 py-2.5">End</th><th className="px-3 py-2.5">Break</th><th className="px-3 py-2.5 text-right">Order</th></tr>
          </thead>
          <tbody className="divide-y">
            {slots.map((s, i) => {
              const no = s.isBreak ? null : ++n;
              return (
                <tr key={i} className={cn(s.isBreak && "bg-muted/40")}>
                  <td className="px-3 py-2 font-semibold tabular-nums">{no ? `P${no}` : "—"}</td>
                  <td className="px-3 py-2"><Input aria-label="Label" value={s.label} onChange={(e) => set(i, { label: e.target.value })} className="h-9" /></td>
                  <td className="px-3 py-2"><Input aria-label="Start" type="time" value={s.start} onChange={(e) => set(i, { start: e.target.value })} className="h-9 w-32" /></td>
                  <td className="px-3 py-2"><Input aria-label="End" type="time" value={s.end} onChange={(e) => set(i, { end: e.target.value })} className="h-9 w-32" /></td>
                  <td className="px-3 py-2"><Checkbox aria-label="Is break" checked={s.isBreak} onCheckedChange={(c) => set(i, { isBreak: !!c })} /></td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp aria-hidden /></Button>
                      <Button variant="ghost" size="icon-sm" disabled={i === slots.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown aria-hidden /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setSlots(slots.filter((_, j) => j !== i))} aria-label="Remove"><Trash aria-hidden /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setSlots([...slots, { label: `P${n + 1}`, start: slots.at(-1)?.end ?? "09:00", end: slots.at(-1)?.end ?? "09:55", isBreak: false }])}><Plus aria-hidden /> Add period</Button>
        <Button variant="outline" onClick={() => setSlots([...slots, { label: "Break", start: slots.at(-1)?.end ?? "11:00", end: slots.at(-1)?.end ?? "11:15", isBreak: true }])}><Plus aria-hidden /> Add break</Button>
        <Button
          className="ml-auto"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await savePeriodSlots(slots);
              if (r.ok) { toast.success(r.message ?? "Saved"); router.refresh(); } else toast.error(r.error);
            })
          }
        >
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Save aria-hidden />} Save period slots
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Timetables refer to periods by number (P1, P2…). If you add or remove teaching periods, ask teachers to review their timetables.</p>
    </div>
  );
}
