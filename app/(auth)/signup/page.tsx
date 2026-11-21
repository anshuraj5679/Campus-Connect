import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { SignupForm, type SignupOptions } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

/** Public reference data for the form (department/cluster/section names and which head posts are filled). */
async function loadOptions(): Promise<SignupOptions> {
  if (!isSupabaseConfigured) return { departments: [], clusters: [], sections: [] };
  const admin = createAdminClient();
  const [d, c, s] = await Promise.all([
    admin.from("departments").select("id, code, name, hod:profiles!departments_hod_id_fkey(full_name)").order("code"),
    admin.from("clusters").select("id, name, department_id, head:profiles!clusters_cluster_head_id_fkey(full_name)").order("name"),
    admin.from("sections").select("id, name, semester, department_id, cluster_id").order("name"),
  ]);
  return {
    departments: (d.data ?? []).map((x: any) => ({ id: x.id, code: x.code, name: x.name, hodName: x.hod?.full_name ?? null })),
    clusters: (c.data ?? []).map((x: any) => ({ id: x.id, name: x.name, departmentId: x.department_id, headName: x.head?.full_name ?? null })),
    sections: (s.data ?? []).map((x) => ({ id: x.id, name: x.name, semester: x.semester, departmentId: x.department_id, clusterId: x.cluster_id })),
  };
}

export default async function SignupPage() {
  const options = await loadOptions();
  return (
    <div className="space-y-5">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription className="text-sm">
            Choose your role and type your cluster and section. New ones are created automatically. Each department has one HOD and each cluster one Cluster Head.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm options={options} />
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
