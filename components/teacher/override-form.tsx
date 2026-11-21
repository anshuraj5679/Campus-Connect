"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash as Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { addScheduleOverride, deleteScheduleOverride, cancelUnavailability } from "@/lib/actions/availability";
import { ConfirmButton } from "@/components/shared/confirm-button";

export function OverrideForm({ today, periods, sections }: { today: string; periods: { no: number; label: string }[]; sections: { id: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"CANCELLED" | "EXTRA">("CANCELLED");
  const [form, setForm] = useState({ date: today, period: periods[0]?.no ?? 1, subjectName: "", sectionId: "", room: "" });

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await addScheduleOverride({ ...form, kind });
          if (r.ok) toast.success(r.message ?? "Saved");
          else toast.error(r.error);
        });
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Change</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={kind === "CANCELLED" ? "default" : "outline"} onClick={() => setKind("CANCELLED")}>Cancel a class</Button>
          <Button type="button" variant={kind === "EXTRA" ? "default" : "outline"} onClick={() => setKind("EXTRA")}>Extra class</Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ov-date">Date</Label>
        <Input id="ov-date" type="date" min={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ov-period">Period</Label>
        <NativeSelect id="ov-period" value={form.period} onChange={(e) => setForm({ ...form, period: Number(e.target.value) })}>
          {periods.map((p) => <option key={p.no} value={p.no}>{p.label}</option>)}
        </NativeSelect>
      </div>
      {kind === "EXTRA" && (
        <>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ov-subject">Subject</Label>
            <Input id="ov-subject" value={form.subjectName} onChange={(e) => setForm({ ...form, subjectName: e.target.value })} placeholder="Remedial class – DBMS" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ov-section">Section</Label>
            <NativeSelect id="ov-section" value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
              <option value="">None</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ov-room">Room</Label>
            <Input id="ov-room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="204" />
          </div>
        </>
      )}
      <Button type="submit" disabled={pending} className="sm:col-span-2">Save class change</Button>
    </form>
  );
}

export function DeleteOverrideButton({ id }: { id: string }) {
  return (
    <ConfirmButton
      title="Remove this class change?"
      description="The original timetable will apply again."
      confirmLabel="Remove"
      onConfirm={() => deleteScheduleOverride(id)}
      variant="ghost"
      size="icon-sm"
      aria-label="Remove class change"
    >
      <Trash2 aria-hidden />
    </ConfirmButton>
  );
}

export function CancelLeaveButton({ id }: { id: string }) {
  return (
    <ConfirmButton
      title="Cancel this unavailability?"
      description="Your status goes back to normal immediately."
      confirmLabel="Cancel unavailability"
      onConfirm={() => cancelUnavailability(id)}
      variant="outline"
      size="sm"
    >
      Cancel
    </ConfirmButton>
  );
}
