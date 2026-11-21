"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateMeetingPreference } from "@/lib/actions/availability";

/** "Accepting meetings" switch + a short meeting note. */
export function MeetingToggle({ initial, note, lockedReason }: { initial: boolean; note: string | null; lockedReason?: string | null }) {
  const [on, setOn] = useState(initial);
  const [text, setText] = useState(note ?? "");
  const [pending, startTransition] = useTransition();

  const save = (accepting: boolean, n = text) =>
    startTransition(async () => {
      const r = await updateMeetingPreference({ acceptingMeetings: accepting, note: n });
      if (r.ok) toast.success(r.message ?? "Saved");
      else {
        toast.error(r.error);
        setOn(!accepting);
      }
    });

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="accepting" className="text-base font-semibold">Accepting meetings</Label>
          <p className="text-sm text-muted-foreground">{on ? "Students see you as Available in free periods." : "Students see you as Busy in free periods."}</p>
        </div>
        <Switch
          id="accepting"
          checked={on}
          disabled={pending}
          onCheckedChange={(v) => {
            setOn(v);
            save(v);
          }}
          className="scale-125"
        />
      </div>
      {lockedReason && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {lockedReason}
        </p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(on, text);
        }}
      >
        <label htmlFor="meeting-note" className="sr-only">Meeting note</label>
        <Input id="meeting-note" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder="e.g. Meet at Cabin 312, 3rd floor" />
        <Button type="submit" variant="outline" disabled={pending}>Save</Button>
      </form>
    </div>
  );
}
