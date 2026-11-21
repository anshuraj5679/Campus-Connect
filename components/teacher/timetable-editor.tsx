"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleExclamationPoint as AlertTriangle, CircleCheckBig as CheckCircle2, Copy, LoaderCircle, Plus, Save, Send, Trash as Trash2, Undo2, CircleX as XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TYPE_STYLE } from "@/components/shared/timetable-grid";
import type { PeriodSlot } from "@/lib/services/periods";
import { DAY_NAMES, summarize, validateTimetable, type DraftEntry, type Issue, type OtherEntry } from "@/lib/services/timetableValidation";
import { CLASS_TYPES } from "@/lib/validators/timetable";
import { discardTimetableDraft, publishTimetable, saveTimetableDraft } from "@/lib/actions/timetable";
import { discardRoutineDraft, publishRoutine, saveRoutineDraft } from "@/lib/actions/routines";

type Section = { id: string; name: string; semester: number; homeRoom: string | null; departmentCode: string };
/** Routine mode: a Cluster Head edits one section's routine; cells name the teacher instead of a section. */
export type RoutineContext = { sectionId: string; sectionName: string; homeRoom: string | null; teachers: { id: string; name: string }[] };
const DAYS = [1, 2, 3, 4, 5, 6];
const newId = () => `new-${Math.random().toString(36).slice(2, 10)}`;

type Editing = { entry: DraftEntry; isNew: boolean; duplicateTo: number[] };

export function TimetableEditor({
  periods,
  sections,
  initialEntries,
  otherEntries,
  hasDraft,
  source = "MANUAL",
  filePath = null,
  onDirtyChange,
  routine,
}: {
  periods: PeriodSlot[];
  sections: Section[];
  initialEntries: DraftEntry[];
  otherEntries: OtherEntry[];
  hasDraft: boolean;
  source?: "MANUAL" | "UPLOAD";
  filePath?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  routine?: RoutineContext;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<DraftEntry[]>(initialEntries);
  const [dirty, setDirty] = useState(source === "UPLOAD" && !hasDraft);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ day: number; from: number; to: number } | null>(null);
  const [focus, setFocus] = useState<{ day: number; period: number }>({ day: 1, period: 1 });
  const [publishOpen, setPublishOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => [...periods].sort((a, b) => a.sortOrder - b.sortOrder), [periods]);
  const teachingNos = useMemo(() => rows.filter((r) => !r.isBreak).map((r) => r.periodNo!), [rows]);
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const issues = useMemo(() => validateTimetable(entries, { validPeriods: teachingNos, otherEntries: routine ? [] : otherEntries, requireSection: !routine }), [entries, teachingNos, otherEntries, routine]);
  const teacherByName = useMemo(() => new Map((routine?.teachers ?? []).map((t) => [t.name.toLowerCase(), t])), [routine]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const issueIds = useMemo(() => {
    const m = new Map<string, Issue["severity"]>();
    for (const i of issues) for (const id of i.entryIds) if (m.get(id) !== "error") m.set(id, i.severity);
    return m;
  }, [issues]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (next: DraftEntry[]) => {
    setEntries(next);
    setDirty(true);
  };

  const entryAt = useCallback(
    (day: number, period: number) => entries.find((e) => e.dayOfWeek === day && e.startPeriod <= period && period <= e.endPeriod),
    [entries],
  );

  // ---------- dialog ----------
  const openNew = useCallback(
    (day: number, from: number, to: number) => {
      setDialogError(null);
      setEditing({
        isNew: true,
        duplicateTo: [],
        entry: { id: newId(), dayOfWeek: day, startPeriod: Math.min(from, to), endPeriod: Math.max(from, to), subjectCode: "", subjectName: "", sectionId: routine?.sectionId ?? null, section: routine?.sectionName ?? null, semester: null, room: routine?.homeRoom ?? "", teacherId: null, teacherName: "", type: Math.abs(to - from) >= 1 ? "LAB" : "THEORY" },
      });
    },
    [routine],
  );
  function openEdit(e: DraftEntry) {
    setDialogError(null);
    setEditing({ isNew: false, duplicateTo: [], entry: { ...e } });
  }
  function saveDialog() {
    if (!editing) return;
    const e = editing.entry;
    if (!e.subjectName.trim()) return setDialogError("Enter the subject name.");
    if (e.endPeriod < e.startPeriod) return setDialogError("End period must be the same as or after the start period.");
    const sec = e.sectionId ? sectionById.get(e.sectionId) : null;
    const teacherName = e.teacherName?.trim() || null;
    const cleaned: DraftEntry = routine
      ? { ...e, subjectName: e.subjectName.trim(), subjectCode: e.subjectCode?.trim().toUpperCase() || null, room: e.room?.trim() || null, teacherName, teacherId: teacherName ? (teacherByName.get(teacherName.toLowerCase())?.id ?? null) : null, lowConfidence: false }
      : { ...e, subjectName: e.subjectName.trim(), subjectCode: e.subjectCode?.trim().toUpperCase() || null, room: e.room?.trim() || null, section: sec?.name ?? null, semester: sec?.semester ?? null, lowConfidence: false };
    const copies = editing.duplicateTo.filter((d) => d !== e.dayOfWeek).map((d) => ({ ...cleaned, id: newId(), dayOfWeek: d }));
    const others = entries.filter((x) => x.id !== e.id);
    for (const c of [cleaned, ...copies]) {
      const clash = others.find((o) => o.dayOfWeek === c.dayOfWeek && o.startPeriod <= c.endPeriod && c.startPeriod <= o.endPeriod);
      if (clash) return setDialogError(`${DAY_NAMES[c.dayOfWeek]} P${c.startPeriod}${c.endPeriod > c.startPeriod ? `–P${c.endPeriod}` : ""} overlaps ${clash.subjectName}. ${routine ? "A section can't have two classes at once." : "You can't be in two classes at once."}`);
    }
    update([...others, cleaned, ...copies]);
    setEditing(null);
  }
  function remove(id: string) {
    const e = entries.find((x) => x.id === id);
    update(entries.filter((x) => x.id !== id));
    setEditing(null);
    if (e) toast(`Removed ${e.subjectName}`, { action: { label: "Undo", onClick: () => setEntries((list) => [...list, e]) } });
  }

  // ---------- drag to span ----------
  useEffect(() => {
    const up = () => {
      if (drag) {
        openNew(drag.day, drag.from, drag.to);
        setDrag(null);
      }
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [drag, openNew]);

  // ---------- keyboard ----------
  function onKeyDown(ev: React.KeyboardEvent) {
    const idx = teachingNos.indexOf(focus.period);
    const next = { ...focus };
    if (ev.key === "ArrowDown") next.period = teachingNos[Math.min(idx + 1, teachingNos.length - 1)];
    else if (ev.key === "ArrowUp") next.period = teachingNos[Math.max(idx - 1, 0)];
    else if (ev.key === "ArrowRight") next.day = Math.min(focus.day + 1, 6);
    else if (ev.key === "ArrowLeft") next.day = Math.max(focus.day - 1, 1);
    else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      const e = entryAt(focus.day, focus.period);
      if (e) openEdit(e);
      else openNew(focus.day, focus.period, focus.period);
      return;
    } else if (ev.key === "Delete" || ev.key === "Backspace") {
      const e = entryAt(focus.day, focus.period);
      if (e) remove(e.id);
      return;
    } else return;
    ev.preventDefault();
    setFocus(next);
    const e = entryAt(next.day, next.period);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${next.day}-${e ? e.startPeriod : next.period}"]`)?.focus();
  }

  // ---------- server ----------
  const payloadEntries = () =>
    entries.map((e) => ({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
      startPeriod: e.startPeriod,
      endPeriod: e.endPeriod,
      subjectCode: e.subjectCode || null,
      subjectName: e.subjectName,
      sectionId: routine ? null : e.sectionId,
      room: e.room || null,
      type: e.type,
      lowConfidence: !!e.lowConfidence,
      ...(routine ? { teacherId: e.teacherId ?? null, teacherName: e.teacherName || null } : {}),
    }));
  const saveDraft = () =>
    routine
      ? saveRoutineDraft({ sectionId: routine.sectionId, filePath, entries: payloadEntries() })
      : saveTimetableDraft({ source, filePath, entries: payloadEntries() });
  const who = routine ? `Section ${routine.sectionName} students` : "Students";

  const save = () =>
    startTransition(async () => {
      const r = await saveDraft();
      if (r.ok) {
        setDirty(false);
        toast.success(`Draft saved. ${who} still see the published ${routine ? "routine" : "timetable"} until you publish.`);
        router.refresh();
      } else toast.error(r.error);
    });

  const publish = () =>
    startTransition(async () => {
      if (dirty || !hasDraft) {
        const s = await saveDraft();
        if (!s.ok) return void toast.error(s.error);
      }
      const r = routine ? await publishRoutine(routine.sectionId) : await publishTimetable();
      if (r.ok) {
        setDirty(false);
        setPublishOpen(false);
        toast.success(routine ? "Routine published" : "Timetable published", { description: r.message });
        router.push(routine ? "/cluster-head/routines" : "/teacher/timetable");
        router.refresh();
      } else toast.error(r.error);
    });

  const discard = () =>
    startTransition(async () => {
      const r = routine ? await discardRoutineDraft(routine.sectionId) : await discardTimetableDraft();
      if (r.ok) {
        toast.success(r.message ?? "Discarded");
        setDirty(false);
        router.refresh();
      } else toast.error(r.error);
    });

  const s = summarize(entries);

  // ---------- render ----------
  const covered = new Set<string>();
  for (const e of entries) for (let p = e.startPeriod + 1; p <= e.endPeriod; p++) covered.add(`${e.dayOfWeek}-${p}`);
  const rowIndexOf = (p: number) => rows.findIndex((r) => r.periodNo === p);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-card">
          <Button onClick={save} disabled={pending || !dirty} variant="outline">
            {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Save aria-hidden />} Save draft
          </Button>
          <Button onClick={() => setPublishOpen(true)} disabled={pending || (!dirty && !hasDraft)}>
            <Send aria-hidden /> Publish
          </Button>
          {hasDraft && (
            <Button variant="ghost" onClick={discard} disabled={pending}>
              <Undo2 aria-hidden /> Discard draft
            </Button>
          )}
          <span className={cn("ml-auto rounded-full px-3 py-1 text-xs font-semibold", dirty ? "bg-status-busy-bg text-status-busy-fg" : hasDraft ? "bg-status-in-class-bg text-status-in-class-fg" : "bg-status-available-bg text-status-available-fg")}>
            {dirty ? "Unsaved changes" : hasDraft ? "Draft saved, not published" : "Up to date"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Click a cell to add a class. <strong>Drag down</strong> to span lab periods. Arrow keys move, <kbd className="rounded border px-1 text-xs">Enter</kbd> edits, <kbd className="rounded border px-1 text-xs">Delete</kbd> removes.
        </p>

        <div ref={gridRef} role="region" aria-label="Timetable editor. Use arrow keys to move between cells." onKeyDown={onKeyDown} className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <table className="w-full min-w-[760px] border-collapse text-sm select-none">
            <thead>
              <tr className="bg-muted/60">
                <th className="w-24 border-b px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Period</th>
                {DAYS.map((d) => (
                  <th key={d} className="border-b border-l px-2 py-2.5 text-left font-semibold">{DAY_NAMES[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((slot) => (
                <tr key={slot.sortOrder} className={cn(slot.isBreak && "bg-muted/50")}>
                  <th scope="row" className={cn("border-b px-3 text-left align-top font-normal", slot.isBreak ? "py-1" : "py-2")}>
                    <span className={cn("block font-semibold", slot.isBreak && "text-xs text-muted-foreground")}>{slot.label}</span>
                    {!slot.isBreak && <span className="block text-xs text-muted-foreground tabular-nums">{slot.start}–{slot.end}</span>}
                  </th>
                  {DAYS.map((d) => {
                    if (slot.isBreak) {
                      const spanning = entries.some((e) => e.dayOfWeek === d && rowIndexOf(e.startPeriod) < rows.indexOf(slot) && rowIndexOf(e.endPeriod) > rows.indexOf(slot));
                      return spanning ? null : <td key={d} className="border-b border-l" />;
                    }
                    const p = slot.periodNo!;
                    if (covered.has(`${d}-${p}`)) return null;
                    const e = entries.find((x) => x.dayOfWeek === d && x.startPeriod === p);
                    const isFocus = focus.day === d && focus.period === p;
                    if (e) {
                      const span = rowIndexOf(e.endPeriod) - rowIndexOf(e.startPeriod) + 1;
                      const sev = issueIds.get(e.id);
                      return (
                        <td key={d} rowSpan={span} className="h-px border-b border-l p-1 align-top">
                          <button
                            type="button"
                            data-cell={`${d}-${p}`}
                            tabIndex={isFocus ? 0 : -1}
                            onFocus={() => setFocus({ day: d, period: p })}
                            onClick={() => openEdit(e)}
                            aria-label={`${DAY_NAMES[d]} ${e.subjectName}${e.section ? `, ${e.section}` : ""}. Press Enter to edit.`}
                            className={cn(
                              "flex h-full min-h-16 w-full flex-col items-start rounded-md border-l-4 px-2 py-1.5 text-left transition-shadow hover:shadow-md",
                              TYPE_STYLE[e.type].cell,
                              e.lowConfidence && "bg-yellow-100 ring-2 ring-yellow-400 dark:bg-yellow-900/40",
                              sev === "error" && "ring-2 ring-destructive",
                              sev === "warning" && !e.lowConfidence && "ring-2 ring-status-busy/70",
                              highlight.has(e.id) && "ring-4 ring-primary",
                            )}
                          >
                            <span className="text-sm font-semibold">{e.subjectCode || e.subjectName}</span>
                            {e.subjectCode && <span className="line-clamp-1 text-xs opacity-80">{e.subjectName}</span>}
                            <span className="text-xs font-medium opacity-90">
                              {routine
                                ? [e.teacherName, e.room].filter(Boolean).join(" · ") || "No teacher"
                                : [e.section, e.room].filter(Boolean).join(" · ") || (e.type === "MEETING" || e.type === "MENTORING" ? TYPE_STYLE[e.type].label : "No section")}
                            </span>
                            {e.lowConfidence && <span className="mt-auto rounded bg-yellow-300 px-1 text-[11px] font-bold text-yellow-950">CHECK</span>}
                          </button>
                        </td>
                      );
                    }
                    const inDrag = drag && drag.day === d && p >= Math.min(drag.from, drag.to) && p <= Math.max(drag.from, drag.to);
                    return (
                      <td key={d} className="border-b border-l p-1">
                        <button
                          type="button"
                          data-cell={`${d}-${p}`}
                          tabIndex={isFocus ? 0 : -1}
                          onFocus={() => setFocus({ day: d, period: p })}
                          onPointerDown={(ev) => {
                            ev.preventDefault();
                            setFocus({ day: d, period: p });
                            setDrag({ day: d, from: p, to: p });
                          }}
                          onPointerEnter={() => drag && drag.day === d && setDrag({ ...drag, to: p })}
                          aria-label={`${DAY_NAMES[d]} period ${p}, free. Press Enter to add a class.`}
                          className={cn(
                            "group flex min-h-16 w-full items-center justify-center rounded-md border border-dashed border-transparent text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40",
                            inDrag && "border-primary bg-accent",
                          )}
                        >
                          <Plus aria-hidden className="size-4 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conflict panel */}
      <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start" aria-label="Validation">
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="font-semibold">Summary</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/60 p-2"><dt className="text-xs text-muted-foreground">Classes</dt><dd className="text-xl font-bold tabular-nums">{s.classes}</dd></div>
            <div className="rounded-lg bg-muted/60 p-2"><dt className="text-xs text-muted-foreground">Labs</dt><dd className="text-xl font-bold tabular-nums">{s.labs}</dd></div>
            <div className="rounded-lg bg-muted/60 p-2"><dt className="text-xs text-muted-foreground">Periods</dt><dd className="text-xl font-bold tabular-nums">{s.periods}</dd></div>
          </dl>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="flex items-center justify-between font-semibold">
            Conflicts
            <span className="text-xs font-medium text-muted-foreground">{errorCount} errors · {warningCount} warnings</span>
          </p>
          {issues.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-status-available-fg"><CheckCircle2 aria-hidden className="size-4 text-status-available" /> No conflicts. Ready to publish.</p>
          ) : (
            <ul className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
              {issues.map((i, n) => (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => setHighlight(new Set(i.entryIds))}
                    className={cn("flex w-full gap-2 rounded-lg border p-2.5 text-left text-sm hover:bg-muted", i.severity === "error" ? "border-destructive/40 bg-destructive/5" : "border-status-busy/40 bg-status-busy-bg")}
                  >
                    {i.severity === "error" ? <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" /> : <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-status-busy" />}
                    <span>{i.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Errors block publishing. Room and section clashes are warnings.</p>
        </div>
      </aside>

      {/* Entry dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing && (
            <form onSubmit={(ev) => { ev.preventDefault(); saveDialog(); }} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{editing.isNew ? "Add class" : "Edit class"} · {DAY_NAMES[editing.entry.dayOfWeek]}</DialogTitle>
                <DialogDescription>{editing.entry.lowConfidence ? "This cell was read from the scan with low confidence. Check every field, then save." : "Saved to the draft. Publish to make it visible to students."}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="e-code">Subject code</Label>
                  <Input id="e-code" value={editing.entry.subjectCode ?? ""} onChange={(ev) => setEditing({ ...editing, entry: { ...editing.entry, subjectCode: ev.target.value } })} placeholder="21CS53" className="uppercase" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-type">Type</Label>
                  <NativeSelect id="e-type" value={editing.entry.type} onChange={(ev) => setEditing({ ...editing, entry: { ...editing.entry, type: ev.target.value as DraftEntry["type"] } })}>
                    {CLASS_TYPES.map((t) => <option key={t} value={t}>{TYPE_STYLE[t].label}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="e-name">Subject name *</Label>
                  <Input id="e-name" autoFocus value={editing.entry.subjectName} onChange={(ev) => setEditing({ ...editing, entry: { ...editing.entry, subjectName: ev.target.value } })} placeholder="Database Management Systems" />
                </div>
                {routine ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="e-teacher">Teacher</Label>
                    <Input
                      id="e-teacher"
                      list="routine-teachers"
                      value={editing.entry.teacherName ?? ""}
                      onChange={(ev) => setEditing({ ...editing, entry: { ...editing.entry, teacherName: ev.target.value } })}
                      placeholder="Prof. Kavitha Rao"
                    />
                    <datalist id="routine-teachers">
                      {routine.teachers.map((t) => <option key={t.id} value={t.name} />)}
                    </datalist>
                    <p className="text-xs text-muted-foreground">
                      {editing.entry.teacherName?.trim()
                        ? teacherByName.has(editing.entry.teacherName.trim().toLowerCase())
                          ? "Linked to the faculty account: students see live status."
                          : "Not a registered faculty name. Shown as written."
                        : "Pick a faculty member or type the name."}
                    </p>
                  </div>
                ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="e-section">Section</Label>
                  <NativeSelect
                    id="e-section"
                    value={editing.entry.sectionId ?? ""}
                    onChange={(ev) => {
                      const sec = sectionById.get(ev.target.value);
                      setEditing({ ...editing, entry: { ...editing.entry, sectionId: ev.target.value || null, room: editing.entry.room || (sec?.homeRoom ?? "") } });
                    }}
                  >
                    <option value="">None (meeting / mentoring)</option>
                    {sections.map((s) => <option key={s.id} value={s.id}>{s.departmentCode} {s.name}</option>)}
                  </NativeSelect>
                </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="e-room">Room</Label>
                  <Input id="e-room" value={editing.entry.room ?? ""} onChange={(ev) => setEditing({ ...editing, entry: { ...editing.entry, room: ev.target.value } })} placeholder="204 / CSE Lab 2" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-start">From period</Label>
                  <NativeSelect id="e-start" value={editing.entry.startPeriod} onChange={(ev) => setEditing({ ...editing, entry: { ...editing.entry, startPeriod: Number(ev.target.value) } })}>
                    {teachingNos.map((p) => <option key={p} value={p}>P{p}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-end">To period</Label>
                  <NativeSelect id="e-end" value={editing.entry.endPeriod} onChange={(ev) => setEditing({ ...editing, entry: { ...editing.entry, endPeriod: Number(ev.target.value) } })}>
                    {teachingNos.map((p) => <option key={p} value={p}>P{p}</option>)}
                  </NativeSelect>
                </div>
              </div>
              <fieldset className="rounded-lg border p-3">
                <legend className="flex items-center gap-1.5 px-1 text-sm font-medium"><Copy aria-hidden className="size-4" /> Also add on</legend>
                <div className="flex flex-wrap gap-3">
                  {DAYS.filter((d) => d !== editing.entry.dayOfWeek).map((d) => (
                    <label key={d} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={editing.duplicateTo.includes(d)} onCheckedChange={(c) => setEditing({ ...editing, duplicateTo: c ? [...editing.duplicateTo, d] : editing.duplicateTo.filter((x) => x !== d) })} />
                      {DAY_NAMES[d]}
                    </label>
                  ))}
                </div>
              </fieldset>
              {dialogError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{dialogError}</p>}
              <DialogFooter className="gap-2 sm:justify-between">
                {!editing.isNew ? (
                  <Button type="button" variant="destructive" onClick={() => remove(editing.entry.id)}><Trash2 aria-hidden /> Delete</Button>
                ) : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button type="submit">{editing.entry.lowConfidence ? "Confirm & save" : "Save"}</Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Publish summary */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{routine ? `Publish Section ${routine.sectionName} routine?` : "Publish timetable?"}</DialogTitle>
            <DialogDescription>
              {routine
                ? `Every Section ${routine.sectionName} student sees these classes on their dashboard right away and gets a notification. The previous routine is archived.`
                : "Students and your Cluster Head will see it immediately. Your previous timetable will be archived."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted p-3"><p className="text-2xl font-bold tabular-nums">{s.classes}</p><p className="text-xs text-muted-foreground">classes</p></div>
            <div className="rounded-lg bg-muted p-3"><p className="text-2xl font-bold tabular-nums">{s.labs}</p><p className="text-xs text-muted-foreground">labs</p></div>
            <div className={cn("rounded-lg p-3", errorCount ? "bg-destructive/10" : "bg-status-available-bg")}><p className="text-2xl font-bold tabular-nums">{errorCount}</p><p className="text-xs text-muted-foreground">conflicts</p></div>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {s.classes} classes, {s.labs} labs, {errorCount} conflicts{warningCount ? `, ${warningCount} warnings` : ""}
          </p>
          {errorCount > 0 && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">Fix the errors in the conflict panel before publishing.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button onClick={publish} disabled={pending || errorCount > 0}>
              {pending && <LoaderCircle aria-hidden className="animate-spin" />} Publish now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
