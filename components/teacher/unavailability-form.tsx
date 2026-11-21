"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { LoaderCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, fieldAria } from "@/components/shared/field";
import { unavailabilitySchema, type UnavailabilityInput } from "@/lib/validators/timetable";
import { markUnavailability } from "@/lib/actions/availability";

const TYPES = [
  { value: "FULL_DAY", label: "Full day" },
  { value: "HALF_DAY", label: "Half day" },
  { value: "DATE_RANGE", label: "Date range" },
  { value: "CUSTOM_PERIODS", label: "Specific periods" },
] as const;

export function UnavailabilityForm({ today, periods }: { today: string; periods: { no: number; label: string; time: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<UnavailabilityInput>({
    resolver: zodResolver(unavailabilitySchema),
    defaultValues: { type: "FULL_DAY", date: today, endDate: "", half: "FN", periods: [], reason: "" },
  });
  const type = watch("type");
  const chosen = watch("periods") ?? [];

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      setServerError(null);
      const r = await markUnavailability(values);
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        reset({ type: "FULL_DAY", date: today, endDate: "", half: "FN", periods: [], reason: "" });
      } else setServerError(r.error);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={type === t.value}
              onClick={() => setValue("type", t.value)}
              className={cn("h-11 rounded-lg border-2 text-sm font-semibold transition-colors", type === t.value ? "border-primary bg-accent text-primary" : "bg-card hover:border-primary/40")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="date" label={type === "DATE_RANGE" ? "From" : "Date"} error={errors.date?.message} required>
          <Input type="date" min={today} {...fieldAria("date", errors.date?.message)} {...register("date")} />
        </Field>
        {type === "DATE_RANGE" && (
          <Field id="endDate" label="To" error={errors.endDate?.message} required>
            <Input type="date" min={today} {...fieldAria("endDate", errors.endDate?.message)} {...register("endDate")} />
          </Field>
        )}
        {type === "HALF_DAY" && (
          <Field id="half" label="Session" error={errors.half?.message} required>
            <div className="grid grid-cols-2 gap-2">
              {(["FN", "AN"] as const).map((h) => (
                <button key={h} type="button" aria-pressed={watch("half") === h} onClick={() => setValue("half", h)}
                  className={cn("h-10 rounded-lg border-2 text-sm font-semibold", watch("half") === h ? "border-primary bg-accent text-primary" : "bg-card")}>
                  {h === "FN" ? "Forenoon (FN)" : "Afternoon (AN)"}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>

      {type === "CUSTOM_PERIODS" && (
        <Field id="periods" label="Periods" error={errors.periods?.message} required>
          <div className="flex flex-wrap gap-2" id="periods">
            {periods.map((p) => {
              const on = chosen.includes(p.no);
              return (
                <button key={p.no} type="button" aria-pressed={on}
                  onClick={() => setValue("periods", on ? chosen.filter((x) => x !== p.no) : [...chosen, p.no], { shouldValidate: true })}
                  className={cn("rounded-lg border-2 px-3 py-1.5 text-left text-sm", on ? "border-primary bg-accent" : "bg-card hover:border-primary/40")}>
                  <span className="block font-semibold">{p.label}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">{p.time}</span>
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <Field id="reason" label={<span className="inline-flex items-center gap-1.5">Reason (optional) <Lock aria-hidden className="size-3.5" /></span>} hint="Private: visible only to you, your Cluster Head and HOD. Students never see it." error={errors.reason?.message}>
        <Textarea rows={2} maxLength={500} {...fieldAria("reason", errors.reason?.message)} {...register("reason")} placeholder="e.g. Attending VTU workshop" />
      </Field>

      {serverError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{serverError}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <LoaderCircle aria-hidden className="animate-spin" />} Mark unavailable
        </Button>
        <p className="text-sm text-muted-foreground">Takes effect immediately. Affected students and your Cluster Head are notified.</p>
      </div>
    </form>
  );
}
