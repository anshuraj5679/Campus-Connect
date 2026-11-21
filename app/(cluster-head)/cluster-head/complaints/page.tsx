import type { Metadata } from "next";
import { HandlerComplaintsPage } from "@/components/complaints/handler-complaints-page";
import type { TableParams } from "@/components/complaints/complaints-table";

export const metadata: Metadata = { title: "Cluster Complaints" };

export default async function ClusterComplaintsPage({ searchParams }: { searchParams: Promise<TableParams> }) {
  return (
    <HandlerComplaintsPage
      title="Complaints"
      description="Complaints assigned to you and non-confidential complaints in your cluster."
      breadcrumbs={[{ label: "Cluster Overview", href: "/cluster-head" }, { label: "Complaints" }]}
      sp={await searchParams}
    />
  );
}
