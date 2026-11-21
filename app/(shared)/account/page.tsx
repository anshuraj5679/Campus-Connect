import type { Metadata } from "next";
import { BadgeCheck, TriangleExclamationPoint as CircleAlert, IdCard, KeyRound } from "lucide-react";
import { ChangePasswordForm } from "@/components/shared/change-password-form";
import { PageHeader } from "@/components/shared/page-header";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { InfoList, PersonAvatar, SectionCard } from "@/components/shared/kit";
import { getViewer } from "@/lib/data/viewer";
import { ROLE_LABEL } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "My Account" };

export default async function AccountPage() {
  const v = await getViewer();
  const academic = v.student
    ? [
        { label: "USN", value: v.student.usn },
        { label: "Department", value: v.student.departmentCode },
        { label: "Section", value: `Semester ${v.student.semester} · ${v.student.section}` },
        { label: "Cluster", value: v.student.clusterName },
      ]
    : v.teacher
      ? [
          { label: "Employee ID", value: v.teacher.employeeId },
          { label: "Designation", value: v.teacher.designation },
          { label: "Department", value: v.teacher.departmentCode },
          { label: "Cluster", value: v.teacher.clusterName ?? "—" },
          { label: "Cabin", value: v.teacher.cabin ?? "—" },
        ]
      : [];

  return (
    <>
      <PageHeader title="My Account" description="Your profile as recorded by the college." />
      <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-6 shadow-card">
          <div className="flex items-center gap-4">
            <PersonAvatar name={v.fullName} src={v.avatarUrl} className="size-16 text-lg" />
            <div className="min-w-0">
              <p className="truncate text-xl font-bold">{v.fullName}</p>
              <p className="text-muted-foreground">{ROLE_LABEL[v.role]}</p>
            </div>
          </div>
          <div className="mt-5">
            <InfoList
              items={[
                { label: "Email", value: v.email },
                { label: "Role", value: ROLE_LABEL[v.role] },
                {
                  label: "Verification",
                  value: v.isVerified ? (
                    <span className="inline-flex items-center gap-1.5 text-status-available-fg"><BadgeCheck aria-hidden className="size-4 text-status-available" /> Verified by college</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-status-busy-fg"><CircleAlert aria-hidden className="size-4 text-status-busy" /> Pending verification</span>
                  ),
                },
              ]}
            />
          </div>
          <div className="mt-6"><SignOutButton /></div>
        </section>
        {academic.length > 0 && (
          <SectionCard title="Academic details" icon={IdCard}>
            <InfoList items={academic} />
            <p className="mt-3 text-xs text-muted-foreground">To correct these details, contact the college office.</p>
          </SectionCard>
        )}
        <SectionCard title="Change password" icon={KeyRound} className="lg:col-span-2 lg:max-w-xl">
          <ChangePasswordForm />
        </SectionCard>
      </div>
    </>
  );
}
