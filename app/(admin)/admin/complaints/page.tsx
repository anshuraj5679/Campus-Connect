import type { Metadata } from "next";
import { HandlerComplaintsPage } from "@/components/complaints/handler-complaints-page";
import type { TableParams } from "@/components/complaints/complaints-table";

export const metadata: Metadata = { title: "Complaints" };

export default async function AdminComplaintsPage({ searchParams }: { searchParams: Promise<TableParams> }) {
  return (
    <HandlerComplaintsPage
      title="Complaints"
      description="Facility and college-wide complaints, plus every complaint in the college (read access)."
      breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Complaints" }]}
      sp={await searchParams}
    />
  );
}
