"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Building, CircleCheckBig, Copy, FileText, GraduationCap, Info, Landmark, LoaderCircle, Paperclip, Send, ShieldExclamationPoint, UserRound, Wrench, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/shared/field";
import { createComplaint, previewRouting } from "@/lib/actions/complaints";
import { CATEGORY_LABEL, type ComplaintCategory } from "@/lib/services/complaintRouting";
import { EVIDENCE_MIME, MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES } from "@/lib/services/complaintWorkflow";
import { bytesLabel } from "@/lib/format";

const CATEGORIES: { value: ComplaintCategory; icon: LucideIcon; help: string }[] = [
  { value: "TEACHER", icon: UserRound, help: "Conduct, punctuality or teaching of a specific faculty member" },
  { value: "ACADEMIC", icon: GraduationCap, help: "Marks, attendance, classes or projects in your cluster" },
  { value: "DEPARTMENT", icon: Landmark, help: "Department-level policies, library, labs schedule" },
  { value: "FACILITY", icon: Wrench, help: "Classroom, lab, projector, furniture, Wi-Fi, washrooms" },
  { value: "COLLEGE", icon: Building, help: "Transport, canteen, fees, college-wide matters" },
  { value: "CONFIDENTIAL", icon: ShieldExclamationPoint, help: "Harassment or sensitive issues, handled by the HOD only" },
];

const STEPS = ["Category", "Details & evidence", "Review & submit"];

export function ComplaintWizard({ teachers }: { teachers: { id: string; name: string; department: string }[] }) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [route, setRoute] = useState<string | null>(null);
  const [routeTo, setRouteTo] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [doneCode, setDoneCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isConfidential = category === "CONFIDENTIAL" || confidential;
  const previews = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);

  useEffect(() => {
    if (!category || (category === "TEACHER" && !teacherId)) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    setRouteLoading(true);
    previewRouting({ category, teacherId: teacherId || undefined, isConfidential }).then((r) => {
      if (cancelled) return;
      setRouteLoading(false);
      setRoute(r.ok ? r.data!.text : r.error);
      setRouteTo(r.ok ? (r.data!.to ?? null) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [category, teacherId, isConfidential]);

  function validate(s: number) {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!category) e.category = "Choose a category";
      if (category === "TEACHER" && !teacherId) e.teacherId = "Choose the teacher this complaint is about";
    }
    if (s === 1) {
      if (subject.trim().length < 5) e.subject = "Subject must be at least 5 characters";
      if (description.trim().length < 20) e.description = "Please describe the issue in at least 20 characters";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_EVIDENCE_FILES) { toast.error(`At most ${MAX_EVIDENCE_FILES} files.`); break; }
      if (!(EVIDENCE_MIME as readonly string[]).includes(f.type)) { toast.error(`${f.name}: only JPG, PNG or PDF.`); continue; }
      if (f.size > MAX_EVIDENCE_BYTES) { toast.error(`${f.name} is larger than 5 MB.`); continue; }
      next.push(f);
    }
    setFiles(next);
  }

  function submit() {
    const fd = new FormData();
    fd.append("category", category!);
    fd.append("teacherId", teacherId);
    fd.append("subject", subject.trim());
    fd.append("description", description.trim());
    fd.append("isConfidential", String(isConfidential));
    files.forEach((f) => fd.append("files", f));
    startTransition(async () => {
      const r = await createComplaint(fd);
      if (r.ok) setDoneCode(r.data!.code);
      else toast.error(r.error);
    });
  }

  if (doneCode) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-card">
        <CircleCheckBig aria-hidden className="mx-auto size-14 text-status-available" />
        <h2 className="mt-4 text-2xl font-bold">Complaint submitted</h2>
        <p className="mt-1 text-muted-foreground">Keep this ID to track your complaint.</p>
        <div className="mx-auto mt-5 flex max-w-xs items-center justify-between gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-accent px-4 py-3">
          <span className="text-xl font-bold tracking-wide text-primary tabular-nums">{doneCode}</span>
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(doneCode); toast.success("Copied"); }}>
            <Copy aria-hidden /> Copy
          </Button>
        </div>
        {routeTo && <p className="mt-4 text-sm text-muted-foreground">Sent to <span className="font-medium text-foreground">{routeTo}</span>.</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild><Link href={`/complaints/${doneCode}`}>View complaint</Link></Button>
          <Button variant="outline" asChild><Link href="/student/complaints">My complaints</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={cn("rounded-lg border-2 px-3 py-2 text-sm", i === step ? "border-primary bg-accent font-semibold text-primary" : i < step ? "border-status-available/40 bg-status-available-bg text-status-available-fg" : "bg-card text-muted-foreground")}>
            <span className="block text-xs">Step {i + 1}</span>
            <span className="hidden sm:block">{s}</span>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border bg-card p-5 shadow-card sm:p-7">
        {step === 0 && (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-3 text-lg font-semibold">What is your complaint about?</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {CATEGORIES.map((c) => {
                  const active = category === c.value;
                  return (
                    <button key={c.value} type="button" aria-pressed={active} onClick={() => { setCategory(c.value); setErrors({}); }}
                      className={cn("flex gap-3 rounded-xl border-2 p-4 text-left transition-colors", active ? "border-primary bg-accent" : "hover:border-primary/40", c.value === "CONFIDENTIAL" && !active && "border-maroon/20")}>
                      <c.icon aria-hidden className={cn("mt-0.5 size-6 shrink-0", c.value === "CONFIDENTIAL" ? "text-maroon" : "text-primary")} />
                      <span>
                        <span className="block font-semibold">{CATEGORY_LABEL[c.value]}</span>
                        <span className="block text-sm text-muted-foreground">{c.help}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.category && <p role="alert" className="mt-2 text-sm text-destructive">{errors.category}</p>}
            </fieldset>

            {(category === "TEACHER" || category === "CONFIDENTIAL") && (
              <Field id="teacher" label={category === "TEACHER" ? "Teacher" : "Teacher involved (optional)"} error={errors.teacherId} required={category === "TEACHER"}>
                <NativeSelect id="teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-invalid={!!errors.teacherId}>
                  <option value="">{category === "TEACHER" ? "Select teacher" : "Not about a specific teacher"}</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.department} · {t.name}</option>)}
                </NativeSelect>
              </Field>
            )}

            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="confidential" className="text-base font-semibold">Keep my identity confidential</Label>
                <Switch id="confidential" checked={isConfidential} disabled={category === "CONFIDENTIAL"} onCheckedChange={setConfidential} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your complaint goes <strong>directly to the HOD</strong>. Your name, USN and section are shown as <em>“Confidential Student”</em> to everyone except the HOD and the Administrator. The teacher concerned can never see it. It is still linked to your account internally, so please use it responsibly.
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field id="subject" label="Subject" error={errors.subject} required>
              <Input id="subject" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Projector in Room 204 not working" aria-invalid={!!errors.subject} />
            </Field>
            <Field id="description" label="Describe the issue" error={errors.description} required hint={`${description.trim().length}/5000 · include dates, room numbers and what you expect`}>
              <Textarea id="description" rows={7} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!errors.description} />
            </Field>
            <div className="space-y-2">
              <Label htmlFor="evidence" className="text-sm font-medium">Evidence (optional)</Label>
              <label htmlFor="evidence" className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-5 text-center hover:border-primary/40 hover:bg-accent/40">
                <Paperclip aria-hidden className="size-6 text-muted-foreground" />
                <span className="mt-1 text-sm font-medium">Add photos or PDFs</span>
                <span className="text-xs text-muted-foreground">Up to {MAX_EVIDENCE_FILES} files · 5 MB each · JPG, PNG, PDF</span>
              </label>
              <input id="evidence" type="file" multiple accept="image/jpeg,image/png,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              {files.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-lg border p-2">
                      {previews[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previews[i]!} alt="" className="size-12 rounded object-cover" />
                      ) : (
                        <span className="flex size-12 items-center justify-center rounded bg-muted"><FileText aria-hidden className="size-6 text-muted-foreground" /></span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{bytesLabel(f.size)}</span>
                      </span>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X aria-hidden /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 2 && category && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Review your complaint</h2>
            <dl className="divide-y rounded-xl border text-sm">
              <div className="grid grid-cols-3 gap-2 px-4 py-3"><dt className="text-muted-foreground">Category</dt><dd className="col-span-2 font-medium">{CATEGORY_LABEL[category]}</dd></div>
              {teacherId && <div className="grid grid-cols-3 gap-2 px-4 py-3"><dt className="text-muted-foreground">Teacher</dt><dd className="col-span-2 font-medium">{teachers.find((t) => t.id === teacherId)?.name}</dd></div>}
              <div className="grid grid-cols-3 gap-2 px-4 py-3"><dt className="text-muted-foreground">Subject</dt><dd className="col-span-2 font-medium">{subject}</dd></div>
              <div className="grid grid-cols-3 gap-2 px-4 py-3"><dt className="text-muted-foreground">Description</dt><dd className="col-span-2 whitespace-pre-wrap">{description}</dd></div>
              <div className="grid grid-cols-3 gap-2 px-4 py-3"><dt className="text-muted-foreground">Evidence</dt><dd className="col-span-2">{files.length ? `${files.length} file(s)` : "None"}</dd></div>
              <div className="grid grid-cols-3 gap-2 px-4 py-3"><dt className="text-muted-foreground">Identity</dt><dd className="col-span-2">{isConfidential ? <span className="font-semibold text-maroon">Confidential: shown as “Confidential Student”</span> : "Visible to the handler"}</dd></div>
            </dl>
          </div>
        )}

        {route !== null && (
          <div role="status" className="mt-5 flex gap-3 rounded-xl border border-primary/20 bg-accent p-4 text-sm">
            <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
            <p>
              <span className="font-semibold">This will go to: </span>
              {routeLoading ? "checking…" : route}
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2 border-t pt-5">
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0 || pending}>
            <ArrowLeft aria-hidden /> Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => validate(step) && setStep(step + 1)}>
              Next <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button onClick={submit} disabled={pending} size="lg">
              {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />} Submit complaint
            </Button>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">You can raise up to 3 complaints a day. False or abusive complaints may lead to disciplinary action.</p>
    </div>
  );
}
