import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ComplaintWizard } from "@/components/complaints/complaint-wizard";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { getViewer } from "@/lib/data/viewer";
import { PendingSelfBanner } from "@/components/people/approval-banners";
import { approverLabel } from "@/lib/data/people";

export const metadata: Metadata = { title: "Raise a complaint" };

export default async function NewComplaintPage() {
  const me = await requireRole(["STUDENT"]);
  if (!me.isVerified) {
    const viewer = await getViewer();
    return (
      <>
        <PageHeader title="Raise a complaint" breadcrumbs={[{ label: "My Complaints", href: "/student/complaints" }, { label: "New" }]} />
        <PendingSelfBanner approver={await approverLabel(viewer)} restriction="You can raise complaints once your account is approved." />
      </>
    );
  }
  const { data } = await createAdminClient()
    .from("teacher_profiles")
    .select("user_id, profiles!inner(full_name, is_active), departments(code)")
    .eq("profiles.is_active", true);
  const teachers = (data ?? [])
    .map((t: any) => ({ id: t.user_id as string, name: t.profiles.full_name as string, department: (t.departments?.code ?? "") as string }))
    .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Raise a complaint"
        description="Your complaint is routed automatically to the right person and tracked to closure."
        breadcrumbs={[{ label: "My Complaints", href: "/student/complaints" }, { label: "New" }]}
      />
      <ComplaintWizard teachers={teachers} />
    </>
  );
}
