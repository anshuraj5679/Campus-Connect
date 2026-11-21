import type { Metadata } from "next";
import { ManageAnnouncementsPage } from "@/components/announcements/manage-page";

export const metadata: Metadata = { title: "College Announcements" };

export default function AdminAnnouncementsPage() {
  return <ManageAnnouncementsPage breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Announcements" }]} />;
}
