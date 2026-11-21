"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { GraduationCap, Landmark, LoaderCircle, Network, Presentation, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, fieldAria } from "@/components/shared/field";
import { DESIGNATIONS, normalizeCluster, normalizeSection, staffSignupSchema, studentSignupSchema } from "@/lib/validators/auth";
import { signupAction } from "@/lib/auth/actions";

export type SignupOptions = {
  departments: { id: string; code: string; name: string; hodName: string | null }[];
  clusters: { id: string; name: string; departmentId: string; headName: string | null }[];
  sections: { id: string; name: string; semester: number; departmentId: string; clusterId: string }[];
};

type Role = "STUDENT" | "TEACHER" | "CLUSTER_HEAD" | "HOD";

const ROLES: { value: Role; label: string; help: string; icon: LucideIcon }[] = [
  { value: "STUDENT", label: "Student", help: "Find teachers, raise complaints", icon: GraduationCap },
  { value: "TEACHER", label: "Teacher", help: "Timetable & availability", icon: Presentation },
  { value: "CLUSTER_HEAD", label: "Cluster Head", help: "One per cluster", icon: Network },
  { value: "HOD", label: "HOD", help: "One per department", icon: Landmark },
];

// One flat form type; the matching schema is chosen by role.
type FormValues = Record<string, any>;
type AnySchema = z.ZodType<FormValues, FormValues>;

export function SignupForm({ options }: { options: SignupOptions }) {
  const [role, setRole] = useState<Role>("STUDENT");
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    // Validate with the schema of the currently selected role.
    resolver: (values, ctx, opts) =>
      zodResolver((values.role === "STUDENT" ? studentSignupSchema : staffSignupSchema) as unknown as AnySchema)(values, ctx, opts),
    defaultValues: { role: "STUDENT", designation: "Assistant Professor" },
  });

  const departmentId = watch("departmentId");
  const typedSection = normalizeSection(String(watch("section") ?? ""));
  const typedCluster = normalizeCluster(String(watch("cluster") ?? ""));
  const clusters = useMemo(() => options.clusters.filter((c) => c.departmentId === departmentId), [options.clusters, departmentId]);
  const sections = useMemo(() => options.sections.filter((s) => s.departmentId === departmentId), [options.sections, departmentId]);
  const existingSection = sections.find((s) => s.name === typedSection);
  const existingSectionCluster = existingSection ? clusters.find((c) => c.id === existingSection.clusterId) : undefined;
  const existingCluster = clusters.find((c) => c.name.toLowerCase() === typedCluster.toLowerCase());
  const err = (name: string) => errors[name]?.message as string | undefined;

  function chooseRole(next: Role) {
    setRole(next);
    setValue("role", next);
    if (next === "HOD") setValue("designation", "Professor & Head");
    setServerError(null);
  }

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signupAction({ ...values, role });
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">I am a…</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const active = role === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => chooseRole(r.value)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-colors",
                  active ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/40",
                )}
              >
                <Icon aria-hidden className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-semibold">{r.label}</span>
                <span className="text-xs leading-tight text-muted-foreground">{r.help}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label="Full name" error={err("fullName")} required className="sm:col-span-2">
          <Input {...fieldAria("fullName", err("fullName"))} autoComplete="name" placeholder={role === "STUDENT" ? "Aarav Kumar" : "Dr. Rajesh Sharma"} {...register("fullName")} />
        </Field>
        <Field id="email" label="College email" error={err("email")} required className="sm:col-span-2">
          <Input {...fieldAria("email", err("email"))} type="email" autoComplete="email" placeholder="name@bmsit.in" {...register("email")} />
        </Field>

        {role === "STUDENT" ? (
          <Field id="usn" label="USN" error={err("usn")} required hint="As printed on your ID card, e.g. 1BY24CS045">
            <Input {...fieldAria("usn", err("usn"))} className="uppercase" placeholder="1BY24CS045" {...register("usn")} />
          </Field>
        ) : (
          <Field id="employeeId" label="Employee ID" error={err("employeeId")} required>
            <Input {...fieldAria("employeeId", err("employeeId"))} className="uppercase" placeholder="BMSIT-CSE-120" {...register("employeeId")} />
          </Field>
        )}

        {role !== "STUDENT" && (
          <Field id="designation" label="Designation" error={err("designation")} required>
            <NativeSelect {...fieldAria("designation", err("designation"))} {...register("designation")}>
              {DESIGNATIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </NativeSelect>
          </Field>
        )}

        <Field id="departmentId" label="Department" error={err("departmentId")} required className={role === "STUDENT" ? "" : "sm:col-span-2"}>
          <NativeSelect
            {...fieldAria("departmentId", err("departmentId"))}
            {...register("departmentId")}
            defaultValue=""
          >
            <option value="" disabled>Select department</option>
            {options.departments.map((d) => {
              const taken = role === "HOD" && !!d.hodName;
              return (
                <option key={d.id} value={d.id} disabled={taken}>
                  {d.code} · {d.name}{role === "HOD" ? (taken ? ` (HOD: ${d.hodName})` : " (vacant)") : ""}
                </option>
              );
            })}
          </NativeSelect>
        </Field>

        {role === "STUDENT" && (
          <Field
            id="section"
            label="Section"
            error={err("section")}
            required
            hint={
              !typedSection || !departmentId
                ? "Semester + letter, e.g. 5J"
                : existingSection
                  ? `Existing section ${typedSection} · ${existingSectionCluster?.name ?? ""}`
                  : /^[1-8][A-Z]$/.test(typedSection)
                    ? `New section ${typedSection} will be created`
                    : "Semester + letter, e.g. 5J"
            }
          >
            <Input
              {...fieldAria("section", err("section"))}
              list="section-options"
              className="uppercase"
              placeholder="5J"
              autoComplete="off"
              {...register("section", {
                onBlur: (e) => {
                  // Fill in the cluster of an existing section to avoid mismatches
                  const s = sections.find((x) => x.name === normalizeSection(e.target.value));
                  const c = s && clusters.find((x) => x.id === s.clusterId);
                  if (c && !watch("cluster")) setValue("cluster", c.name);
                },
              })}
            />
            <datalist id="section-options">
              {sections.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
          </Field>
        )}

        {role !== "HOD" && (
          <Field
            id="cluster"
            label="Cluster"
            error={err("cluster")}
            required
            className={role === "STUDENT" ? "" : "sm:col-span-2"}
            hint={
              !typedCluster || !departmentId
                ? "Type the number or name, e.g. 3 or Cluster 3"
                : existingCluster
                  ? role === "CLUSTER_HEAD"
                    ? existingCluster.headName
                      ? `${existingCluster.name} already has a Cluster Head (${existingCluster.headName}). Only one per cluster.`
                      : `${existingCluster.name} has no Cluster Head yet. You can take this seat.`
                    : `Existing cluster · ${existingCluster.name}`
                  : `New cluster "${typedCluster}" will be created`
            }
          >
            <Input
              {...fieldAria("cluster", err("cluster"))}
              list="cluster-options"
              placeholder="3"
              autoComplete="off"
              {...register("cluster")}
            />
            <datalist id="cluster-options">
              {clusters.map((c) => (
                <option key={c.id} value={c.name}>{role === "CLUSTER_HEAD" ? (c.headName ? `Cluster Head: ${c.headName}` : "vacant") : undefined}</option>
              ))}
            </datalist>
          </Field>
        )}

        <Field id="password" label="Password" error={err("password")} required hint="At least 8 characters with a letter and a number">
          <Input {...fieldAria("password", err("password"))} type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Field id="confirmPassword" label="Confirm password" error={err("confirmPassword")} required>
          <Input {...fieldAria("confirmPassword", err("confirmPassword"))} type="password" autoComplete="new-password" {...register("confirmPassword")} />
        </Field>
      </div>

      {serverError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <LoaderCircle aria-hidden className="animate-spin" />}
        {pending ? "Creating account…" : `Create ${ROLES.find((r) => r.value === role)!.label} account`}
      </Button>
    </form>
  );
}
