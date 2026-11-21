import type { Metadata } from "next";
import { FileUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/kit";
import { CsvImport } from "@/components/admin/csv-import";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Bulk Import" };

export default async function AdminImportPage() {
  await requireRole(["ADMIN"]);
  return (
    <>
      <PageHeader title="Bulk import" description="Create student or teacher accounts from a CSV file, with a preview before saving." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Bulk Import" }]} />
      <SectionCard title="CSV import" icon={FileUp}><CsvImport /></SectionCard>
    </>
  );
}
