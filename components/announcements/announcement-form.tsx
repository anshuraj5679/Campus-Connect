"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { LoaderCircle, Megaphone, Pin, PinOff, Trash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/shared/field";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { createAnnouncement, deleteAnnouncement, toggleAnnouncementPin } from "@/lib/actions/announcements";
import { uploadDirect } from "@/lib/upload-client";

const AUD = [
  { value: "BOTH", label: "Students & teachers" },
  { value: "STUDENTS", label: "Students" },
  { value: "TEACHERS", label: "Teachers" },
] as const;

export function AnnouncementForm({ scopeLabel, sectionOptions }: { scopeLabel: string; sectionOptions: string[] }) {
  const [pending, startTransition] = useTransition();
  const [audience, setAudience] = useState<(typeof AUD)[number]["value"]>("BOTH");
  const [semesters, setSemesters] = useState<number[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const title = String(fd.get("title") ?? "").trim();
        const body = String(fd.get("body") ?? "").trim();
        const errs: Record<string, string> = {};
        if (title.length < 3) errs.title = "Title is too short";
        if (body.length < 3) errs.body = "Write the notice";
        setErrors(errs);
        if (Object.keys(errs).length) return;
        fd.set("audience", audience);
        fd.set("semesters", JSON.stringify(audience === "TEACHERS" ? [] : semesters));
        fd.set("sections", JSON.stringify(audience === "TEACHERS" ? [] : sections));
        fd.set("pinned", String(pinned));
        const file = fd.get("attachment");
        fd.delete("attachment"); // never send the file through the server (Vercel 4.5 MB limit)
        startTransition(async () => {
          if (file instanceof File && file.size > 0) {
            const up = await uploadDirect("announcement", [file]);
            if ("error" in up) {
              toast.error(up.error);
              return;
            }
            fd.set("attachmentPath", up.paths[0]);
            fd.set("attachmentName", file.name);
          }
          const r = await createAnnouncement(fd);
          if (r.ok) {
            toast.success(r.message ?? "Published");
            formRef.current?.reset();
            setSemesters([]);
            setSections([]);
            setPinned(false);
          } else toast.error(r.error);
        });
      }}
    >
      <p className="rounded-lg bg-accent px-3 py-2 text-sm">Publishing to: <strong>{scopeLabel}</strong></p>
      <Field id="title" label="Title" error={errors.title} required>
        <Input id="title" name="title" maxLength={150} placeholder="e.g. Mini-project review schedule" />
      </Field>
      <Field id="body" label="Notice" error={errors.body} required>
        <Textarea id="body" name="body" rows={5} maxLength={5000} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Audience</legend>
        <div className="grid grid-cols-3 gap-2">
          {AUD.map((a) => (
            <button key={a.value} type="button" aria-pressed={audience === a.value} onClick={() => setAudience(a.value)}
              className={cn("h-10 rounded-lg border-2 px-2 text-sm font-semibold", audience === a.value ? "border-primary bg-accent text-primary" : "bg-card")}>
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>
      {audience !== "TEACHERS" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Semesters <span className="font-normal text-muted-foreground">(optional)</span></legend>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <button key={s} type="button" aria-pressed={semesters.includes(s)} onClick={() => setSemesters(semesters.includes(s) ? semesters.filter((x) => x !== s) : [...semesters, s])}
                  className={cn("size-9 rounded-lg border text-sm font-semibold", semesters.includes(s) ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
                  {s}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Sections <span className="font-normal text-muted-foreground">(optional)</span></legend>
            <div className="flex flex-wrap gap-1.5">
              {sectionOptions.map((s) => (
                <button key={s} type="button" aria-pressed={sections.includes(s)} onClick={() => setSections(sections.includes(s) ? sections.filter((x) => x !== s) : [...sections, s])}
                  className={cn("h-9 rounded-lg border px-2.5 text-sm font-semibold", sections.includes(s) ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
                  {s}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="expiresAt">Expires on <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="expiresAt" name="expiresAt" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attachment">Attachment <span className="font-normal text-muted-foreground">(optional, ≤10 MB)</span></Label>
          <Input id="attachment" name="attachment" type="file" className="pt-1.5" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <Label htmlFor="pinned" className="flex items-center gap-2"><Pin aria-hidden className="size-4 text-maroon" /> Pin to the top</Label>
        <Switch id="pinned" checked={pinned} onCheckedChange={setPinned} />
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Megaphone aria-hidden />} Publish notice
      </Button>
    </form>
  );
}

export function AnnouncementActions({ id, pinned }: { id: string; pinned: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={pinned ? "Unpin" : "Pin"}
        onClick={() => startTransition(async () => {
          const r = await toggleAnnouncementPin(id);
          if (r.ok) toast.success(r.message ?? "Done");
          else toast.error(r.error);
        })}
      >
        {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
      </Button>
      <ConfirmButton title="Delete this announcement?" description="It will disappear for everyone." confirmLabel="Delete" onConfirm={() => deleteAnnouncement(id)} variant="ghost" size="icon-sm" aria-label="Delete">
        <Trash aria-hidden />
      </ConfirmButton>
    </div>
  );
}
