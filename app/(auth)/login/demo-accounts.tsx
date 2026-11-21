"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  GraduationCap,
  LoaderCircle,
  Network,
  Presentation,
  ShieldCheck,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { demoSignInAction } from "@/lib/auth/actions";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";

const ICONS: Record<Role, LucideIcon> = {
  STUDENT: GraduationCap,
  TEACHER: Presentation,
  CLUSTER_HEAD: Network,
  HOD: Landmark,
  ADMIN: ShieldCheck,
};

type PublicDemoAccount = { role: Role; fullName: string; subtitle: string };

/** One-click sign-in for evaluators (shown only when NEXT_PUBLIC_DEMO_MODE=true). */
export function DemoAccounts({ accounts }: { accounts: PublicDemoAccount[] }) {
  const [pending, startTransition] = useTransition();
  const [activeRole, setActiveRole] = useState<Role | null>(null);

  function signInAs(role: Role) {
    setActiveRole(role);
    startTransition(async () => {
      const result = await demoSignInAction(role);
      if (result?.error) {
        toast.error(result.error);
        setActiveRole(null);
      }
    });
  }

  return (
    <section aria-labelledby="demo-heading" className="rounded-lg border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="demo-heading" className="text-sm font-semibold">
          Demo accounts
        </h2>
        <span className="text-xs text-muted-foreground">One-click sign in</span>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {accounts.map((account) => {
          const Icon = ICONS[account.role];
          const loading = pending && activeRole === account.role;
          return (
            <li key={account.role} className={account.role === "ADMIN" ? "min-w-0 sm:col-span-2" : "min-w-0"}>
              <button
                type="button"
                onClick={() => signInAs(account.role)}
                disabled={pending}
                className="flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-60"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  {loading ? (
                    <LoaderCircle aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <Icon aria-hidden className="size-4" />
                  )}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-[13px] font-semibold">{ROLE_LABEL[account.role]}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {account.fullName} · {account.subtitle}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
