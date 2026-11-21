import type { Metadata } from "next";
import { ManageAnnouncementsPage } from "@/components/announcements/manage-page";

export const metadata: Metadata = { title: "Cluster Announcements" };

export default function ClusterAnnouncementsPage() {
  return <ManageAnnouncementsPage breadcrumbs={[{ label: "Cluster Overview", href: "/cluster-head" }, { label: "Announcements" }]} />;
}
