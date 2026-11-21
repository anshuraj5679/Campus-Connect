"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

export function SignOutButton({ variant = "outline" }: { variant?: "default" | "outline" | "ghost" }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant={variant} disabled={pending} onClick={() => startTransition(() => signOutAction())}>
      <LogOut aria-hidden />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
