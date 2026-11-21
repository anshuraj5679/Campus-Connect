import type { Metadata } from "next";
import { ManageAnnouncementsPage } from "@/components/announcements/manage-page";

export const metadata: Metadata = { title: "Department Announcements" };

export default function HodAnnouncementsPage() {
  return <ManageAnnouncementsPage breadcrumbs={[{ label: "Department Overview", href: "/hod" }, { label: "Announcements" }]} />;
}
