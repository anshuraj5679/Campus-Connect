import { Megaphone, PenLine } from "lucide-react";
import { PageHeader, type Crumb } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/kit";
import { EmptyState } from "@/components/shared/empty-state";
import { AnnouncementCard } from "./announcement-card";
import { AnnouncementActions, AnnouncementForm } from "./announcement-form";
import { listAnnouncements } from "@/lib/data/announcements";
import { getViewer } from "@/lib/data/viewer";
import { getNow } from "@/lib/datetime";
import { createAdminClient } from "@/lib/supabase/admin";

/** Composer + "my announcements" list for Cluster Heads, HODs and the Admin. */
export async function ManageAnnouncementsPage({ breadcrumbs }: { breadcrumbs: Crumb[] }) {
  const [viewer, now] = await Promise.all([getViewer(), getNow()]);
  const admin = createAdminClient();
  let scopeLabel = "Whole college";
  let sectionOptions: string[] = [];
  if (viewer.role === "HOD" && viewer.hodOf[0]) {
    const [{ data: d }, { data: s }] = await Promise.all([
      admin.from("departments").select("code, name").eq("id", viewer.hodOf[0]).single(),
      admin.from("sections").select("name").eq("department_id", viewer.hodOf[0]).order("name"),
    ]);
    scopeLabel = `${d?.code} · ${d?.name}`;
    sectionOptions = (s ?? []).map((x) => x.name);
  } else if (viewer.role === "CLUSTER_HEAD" && viewer.clusterHeadOf[0]) {
    const [{ data: c }, { data: s }] = await Promise.all([
      admin.from("clusters").select("name, departments(code)").eq("id", viewer.clusterHeadOf[0]).single(),
      admin.from("sections").select("name").eq("cluster_id", viewer.clusterHeadOf[0]).order("name"),
    ]);
    scopeLabel = `${(c as any)?.departments?.code} ${c?.name}`;
    sectionOptions = (s ?? []).map((x) => x.name);
  } else {
    const { data: s } = await admin.from("sections").select("name").order("name");
    sectionOptions = [...new Set((s ?? []).map((x) => x.name))];
  }
  const mine = await listAnnouncements({ authoredBy: viewer.role === "ADMIN" ? undefined : viewer.id });

  return (
    <>
      <PageHeader title="Announcements" description="Publish notices to your students and teachers. Recipients get a notification." breadcrumbs={breadcrumbs} />
      <div className="grid gap-5 xl:grid-cols-5">
        <SectionCard title="New announcement" icon={PenLine} className="xl:col-span-2 xl:self-start">
          <AnnouncementForm scopeLabel={scopeLabel} sectionOptions={sectionOptions} />
        </SectionCard>
        <div className="space-y-4 xl:col-span-3">
          <h2 className="text-lg font-semibold">{viewer.role === "ADMIN" ? "All announcements" : "Your announcements"}</h2>
          {mine.length === 0 ? (
            <EmptyState icon={Megaphone} title="No announcements yet" description="Your published notices will appear here." />
          ) : (
            mine.map((a) => <AnnouncementCard key={a.id} a={{ ...a, unread: false }} now={now} actions={<AnnouncementActions id={a.id} pinned={a.pinned} />} />)
          )}
        </div>
      </div>
    </>
  );
}
