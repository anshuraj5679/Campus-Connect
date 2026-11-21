"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { KeyRound, LoaderCircle } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldAria } from "./field";
import { changePasswordSchema } from "@/lib/validators/auth";
import { changePasswordAction } from "@/lib/auth/actions";

type Values = z.input<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) =>
        startTransition(async () => {
          setServerError(null);
          const r = await changePasswordAction(v);
          if ("error" in r) setServerError(r.error);
          else {
            toast.success("Password changed. Use the new password next time you sign in.");
            reset();
          }
        }),
      )}
    >
      <Field id="currentPassword" label="Current password" error={errors.currentPassword?.message} required>
        <Input type="password" autoComplete="current-password" {...fieldAria("currentPassword", errors.currentPassword?.message)} {...register("currentPassword")} />
      </Field>
      <Field id="password" label="New password" error={errors.password?.message} required hint="At least 8 characters with a letter and a number">
        <Input type="password" autoComplete="new-password" {...fieldAria("password", errors.password?.message)} {...register("password")} />
      </Field>
      <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message} required>
        <Input type="password" autoComplete="new-password" {...fieldAria("confirmPassword", errors.confirmPassword?.message)} {...register("confirmPassword")} />
      </Field>
      {serverError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <KeyRound aria-hidden />} Change password
      </Button>
    </form>
  );
}
