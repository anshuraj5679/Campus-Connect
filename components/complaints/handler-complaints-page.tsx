import { PageHeader, type Crumb } from "@/components/shared/page-header";
import { ComplaintsTable, type TableParams } from "./complaints-table";
import { getViewer } from "@/lib/data/viewer";
import { listComplaints } from "@/lib/data/complaints";
import { getNow } from "@/lib/datetime";

/** Shared list page for Cluster Head / HOD / Admin (RLS scopes what each sees). */
export async function HandlerComplaintsPage({ title, description, breadcrumbs, sp }: { title: string; description: string; breadcrumbs: Crumb[]; sp: TableParams }) {
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const rows = await listComplaints(viewer, { scope: "handler" });
  return (
    <>
      <PageHeader title={title} description={description} breadcrumbs={breadcrumbs} />
      <ComplaintsTable rows={rows} sp={sp} now={now} />
    </>
  );
}
