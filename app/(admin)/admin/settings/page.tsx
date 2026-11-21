import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/kit";
import { SettingsForm } from "@/components/admin/settings-form";
import { getCalendar } from "@/lib/data/calendar";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "College Settings" };

export default async function AdminSettingsPage() {
  await requireRole(["ADMIN"]);
  const { settings } = await getCalendar();
  return (
    <>
      <PageHeader title="College settings" description="Working days, Saturday rule, college hours, academic year and complaint SLA." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "College Settings" }]} />
      <SectionCard title="Academic calendar" icon={Settings} className="max-w-3xl">
        <SettingsForm initial={settings} />
      </SectionCard>
    </>
  );
}
