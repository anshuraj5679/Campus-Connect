import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterChips } from "@/components/shared/url-controls";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { MarkRead } from "@/components/announcements/mark-read";
import { listAnnouncements } from "@/lib/data/announcements";
import { getNow } from "@/lib/datetime";

export const metadata: Metadata = { title: "Notices" };

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const sp = await searchParams;
  const [all, now] = await Promise.all([listAnnouncements(), getNow()]);
  const list = sp.scope ? all.filter((a) => a.scope === sp.scope) : all;
  const unread = all.filter((a) => a.unread);

  return (
    <>
      <PageHeader title="Notices" description={unread.length ? `${unread.length} unread` : "You're all caught up."} />
      <div className="mb-5">
        <FilterChips
          param="scope"
          options={[
            { value: "COLLEGE", label: "College", count: all.filter((a) => a.scope === "COLLEGE").length },
            { value: "DEPARTMENT", label: "Department", count: all.filter((a) => a.scope === "DEPARTMENT").length },
            { value: "CLUSTER", label: "Cluster", count: all.filter((a) => a.scope === "CLUSTER").length },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={Megaphone} title="No notices" description="Announcements from your college, department and cluster appear here." />
      ) : (
        <div className="space-y-4">
          {list.map((a) => <AnnouncementCard key={a.id} a={a} now={now} />)}
        </div>
      )}
      <MarkRead ids={unread.map((a) => a.id)} />
    </>
  );
}
