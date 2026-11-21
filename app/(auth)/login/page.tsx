import type { Metadata } from "next";
import Link from "next/link";
import { TriangleExclamationPoint as TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isDemoMode } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/validators/auth";
import { DEMO_ACCOUNTS } from "@/lib/auth/demo";
import { LoginForm } from "./login-form";
import { DemoAccounts } from "./demo-accounts";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next) ?? undefined;
  // Only public, non-secret fields go to the client.
  const demoAccounts = DEMO_ACCOUNTS.map(({ role, fullName, subtitle }) => ({ role, fullName, subtitle }));

  return (
    <div className="space-y-6">
      {!isSupabaseConfigured && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Supabase is not configured</AlertTitle>
          <AlertDescription>
            Copy <code>.env.example</code> to <code>.env.local</code> and add your project URL and
            keys, then restart the dev server.
          </AlertDescription>
        </Alert>
      )}

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription className="text-sm">Students, teachers, Cluster Heads, HODs and the office all sign in here.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={nextPath} />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        New to CampusConnect?{" "}
        <Link href="/signup" className="font-semibold text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>

      {isDemoMode && <DemoAccounts accounts={demoAccounts} />}
    </div>
  );
}
