import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Crest } from "./crest";
import { SignOutButton } from "./sign-out-button";
import { getAuthUser, getCurrentUser } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/roles";

const MESSAGES: Record<string, { title: string; body: string }> = {
  default: {
    title: "You don't have access to this page",
    body: "This page belongs to a different role, or the record is not shared with you. If you think this is a mistake, contact the college office.",
  },
  "no-role": { title: "Your account is not set up yet", body: "Your login works, but no role has been assigned to your account. Please contact the college office." },
  "no-profile": { title: "Your account is not set up yet", body: "Your login works, but your college profile has not been created. Please contact the college office." },
  inactive: { title: "Your account is deactivated", body: "Your account has been deactivated by the administrator. Please contact the college office to reactivate it." },
};

export async function ForbiddenView({ reason }: { reason?: string }) {
  const message = MESSAGES[reason ?? "default"] ?? MESSAGES.default;
  const [authUser, user] = await Promise.all([getAuthUser(), getCurrentUser()]);
  const canGoHome = user && user.isActive && !reason;
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <div className="h-1 bg-maroon" aria-hidden />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <Crest className="mx-auto mb-6 h-14 w-12" />
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-status-leave-bg">
            <ShieldX aria-hidden className="size-7 text-status-leave" />
          </div>
          <p className="text-sm font-bold tracking-wider text-muted-foreground uppercase tabular-nums">Error 403</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{message.title}</h1>
          <p className="mt-2 text-muted-foreground">{message.body}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {canGoHome && (
              <Button asChild size="lg">
                <Link href={homeForRole(user.role)}>Go to my dashboard</Link>
              </Button>
            )}
            {authUser ? <SignOutButton variant={canGoHome ? "outline" : "default"} /> : (
              <Button asChild size="lg"><Link href="/login">Sign in</Link></Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
