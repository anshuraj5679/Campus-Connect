import { cn } from "@/lib/utils";
import type { PeriodSlot } from "@/lib/services/periods";
import type { ClassType } from "@/lib/services/availability";
import { fmtTime } from "@/lib/format";
import { istDateTime } from "@/lib/services/time";

export const TYPE_STYLE: Record<ClassType, { cell: string; label: string }> = {
  THEORY: { cell: "bg-indigo-50 border-indigo-500 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-100", label: "Theory" },
  LAB: { cell: "bg-teal-50 border-teal-600 text-teal-950 dark:bg-teal-950/40 dark:text-teal-100", label: "Lab" },
  TUTORIAL: { cell: "bg-fuchsia-50 border-fuchsia-500 text-fuchsia-950 dark:bg-fuchsia-950/40 dark:text-fuchsia-100", label: "Tutorial" },
  MENTORING: { cell: "bg-slate-100 border-slate-500 text-slate-900 dark:bg-slate-800 dark:text-slate-100", label: "Mentoring" },
  MEETING: { cell: "bg-rose-50 border-rose-500 text-rose-950 dark:bg-rose-950/40 dark:text-rose-100", label: "Meeting" },
  // Library, Placement, Sports, IIC / Department Activity, Cultural…
  ACTIVITY: { cell: "bg-amber-50 border-amber-500 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100", label: "Activity" },
};

export type GridEntry = {
  id: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  subjectCode: string | null;
  subjectName: string;
  section: string | null;
  room: string | null;
  type: ClassType;
  /** e.g. teacher name in a section timetable */
  extra?: string | null;
};

const DAYS = [
  { n: 1, short: "Mon", long: "Monday" },
  { n: 2, short: "Tue", long: "Tuesday" },
  { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" },
  { n: 5, short: "Fri", long: "Friday" },
  { n: 6, short: "Sat", long: "Saturday" },
];

/**
 * Weekly timetable: rows = period slots (breaks shaded), columns = days.
 * Multi-period entries (labs) span rows. The current slot is highlighted
 * with a "Now" marker; cells inside teacher unavailability are hatched.
 */
export function TimetableGrid({
  periods,
  entries,
  now,
  unavailable,
  days = 6,
  compact = false,
}: {
  periods: PeriodSlot[];
  entries: GridEntry[];
  now?: { isoDay: number; minutes: number };
  unavailable?: Set<string>;
  days?: number;
  compact?: boolean;
}) {
  const rows = [...periods].sort((a, b) => a.sortOrder - b.sortOrder);
  const rowOf = new Map(rows.map((r, i) => [r.periodNo ?? `b${r.sortOrder}`, i]));
  const dayList = DAYS.slice(0, days);

  // Which (day,row) cells are covered by a spanning entry
  const covered = new Set<string>();
  const starts = new Map<string, { entry: GridEntry; span: number }>();
  for (const e of entries) {
    const a = rowOf.get(e.startPeriod);
    const b = rowOf.get(e.endPeriod);
    if (a === undefined || b === undefined) continue;
    starts.set(`${e.dayOfWeek}-${a}`, { entry: e, span: b - a + 1 });
    for (let r = a + 1; r <= b; r++) covered.add(`${e.dayOfWeek}-${r}`);
  }

  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const nowRow = now ? rows.findIndex((r) => toMin(r.start) <= now.minutes && now.minutes < toMin(r.end)) : -1;
  const anyDate = "2026-01-05";

  return (
    // Focusable, labelled scroll region so keyboard users can scroll it on small screens.
    <div className="overflow-x-auto rounded-lg border" role="region" aria-label="Weekly timetable (scrollable)" tabIndex={0}>
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">Weekly timetable</caption>
        <thead>
          <tr className="bg-muted/60">
            <th scope="col" className="w-28 border-b px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Period</th>
            {dayList.map((d) => (
              <th
                key={d.n}
                scope="col"
                className={cn("border-b border-l px-2 py-2.5 text-left font-semibold", now?.isoDay === d.n && "bg-primary text-primary-foreground")}
              >
                <abbr title={d.long} className="no-underline">{d.short}</abbr>
                {now?.isoDay === d.n && <span className="ml-1.5 text-xs font-medium opacity-80">Today</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((slot, ri) => {
            const isNowRow = ri === nowRow;
            return (
              <tr key={slot.sortOrder} className={cn(slot.isBreak && "bg-muted/50")}>
                <th scope="row" className={cn("border-b px-3 text-left align-top font-normal", slot.isBreak ? "py-1.5" : "py-2.5", isNowRow && "bg-status-in-class-bg")}>
                  <span className="flex items-center gap-1.5">
                    <span className={cn("font-semibold", slot.isBreak && "text-xs text-muted-foreground")}>{slot.label}</span>
                    {isNowRow && now && <span className="rounded bg-status-in-class px-1.5 text-[11px] font-bold text-white">NOW</span>}
                  </span>
                  {!compact && (
                    <span className="block text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {fmtTime(istDateTime(anyDate, slot.start))} – {fmtTime(istDateTime(anyDate, slot.end))}
                    </span>
                  )}
                </th>
                {dayList.map((d) => {
                  const key = `${d.n}-${ri}`;
                  if (covered.has(key)) return null;
                  const start = starts.get(key);
                  const isNowCell = isNowRow && now?.isoDay === d.n;
                  if (slot.isBreak && !start) {
                    return <td key={d.n} className="border-b border-l text-center text-xs text-muted-foreground" aria-label={slot.label} />;
                  }
                  if (!start) {
                    return (
                      <td key={d.n} className={cn("border-b border-l p-1.5 align-top", isNowCell && "bg-status-in-class-bg/60 ring-2 ring-status-in-class ring-inset")}>
                        <span className="sr-only">Free</span>
                      </td>
                    );
                  }
                  const e = start.entry;
                  const blocked = unavailable?.has(`${d.n}-${e.startPeriod}`);
                  return (
                    <td key={d.n} rowSpan={start.span} className={cn("h-px border-b border-l p-1.5 align-top", isNowCell && "ring-2 ring-status-in-class ring-inset")}>
                      <div
                        className={cn(
                          "relative h-full min-h-14 rounded-md border-l-4 px-2 py-1.5",
                          TYPE_STYLE[e.type].cell,
                          blocked && "opacity-70 [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgb(220_38_38/0.12)_6px,rgb(220_38_38/0.12)_12px)]",
                        )}
                      >
                        <p className="text-sm leading-snug font-semibold">{e.subjectCode ?? e.subjectName}</p>
                        {e.subjectCode && !compact && <p className="line-clamp-1 text-xs opacity-80">{e.subjectName}</p>}
                        <p className="mt-0.5 text-xs font-medium opacity-90">
                          {[e.section, e.room].filter(Boolean).join(" · ")}
                          {e.type !== "THEORY" && !(e.type === "LAB" && /lab/i.test(e.room ?? "")) && <span className="ml-1 rounded bg-black/5 px-1 dark:bg-white/10">{TYPE_STYLE[e.type].label}</span>}
                        </p>
                        {e.extra && <p className="line-clamp-1 text-xs opacity-80">{e.extra}</p>}
                        {blocked && <p className="mt-1 text-xs font-bold text-status-leave-fg">Teacher unavailable</p>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TypeLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {(Object.keys(TYPE_STYLE) as ClassType[]).map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded-sm border-l-4", TYPE_STYLE[t].cell)} aria-hidden />
          {TYPE_STYLE[t].label}
        </span>
      ))}
    </div>
  );
}
