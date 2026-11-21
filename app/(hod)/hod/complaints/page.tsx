import type { Metadata } from "next";
import { HandlerComplaintsPage } from "@/components/complaints/handler-complaints-page";
import type { TableParams } from "@/components/complaints/complaints-table";

export const metadata: Metadata = { title: "Department Complaints" };

export default async function HodComplaintsPage({ searchParams }: { searchParams: Promise<TableParams> }) {
  return (
    <HandlerComplaintsPage
      title="Complaints"
      description="All complaints in your department, including escalated and confidential ones."
      breadcrumbs={[{ label: "Department Overview", href: "/hod" }, { label: "Complaints" }]}
      sp={await searchParams}
    />
  );
}
