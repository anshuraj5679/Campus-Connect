import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarOff, CalendarDays, Megaphone, MessageSquareExclamationPoint, MessagesSquare, CircleArrowUp, CircleCheckBig, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterChips, Pagination } from "@/components/shared/url-controls";
import { MarkAllReadButton } from "@/components/shared/mark-all-read";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getNow } from "@/lib/datetime";
import { fmtDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

const ICON: Record<string, LucideIcon> = {
  COMPLAINT_ASSIGNED: MessageSquareExclamationPoint,
  COMPLAINT_STATUS: MessageSquareExclamationPoint,
  COMPLAINT_MESSAGE: MessagesSquare,
  RESPONSE_REQUESTED: MessagesSquare,
  COMPLAINT_ESCALATED: CircleArrowUp,
  COMPLAINT_RESOLVED: CircleCheckBig,
  TEACHER_UNAVAILABLE: CalendarOff,
  TIMETABLE_PUBLISHED: CalendarDays,
  ANNOUNCEMENT: Megaphone,
};
const PAGE = 20;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const now = await getNow();
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabase.from("notifications").select("*", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false });
  if (sp.filter === "unread") q = q.is("read_at", null);
  const { data, count } = await q.range((page - 1) * PAGE, page * PAGE - 1);
  const { count: unread } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);

  return (
    <>
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : "You're all caught up."} actions={unread ? <MarkAllReadButton /> : undefined} />
      <div className="mb-4">
        <FilterChips param="filter" options={[{ value: "unread", label: "Unread", count: unread ?? 0 }]} />
      </div>
      {!data?.length ? (
        <EmptyState icon={Bell} title={sp.filter === "unread" ? "No unread notifications" : "No notifications yet"} description="Complaint updates, unavailability alerts and notices will appear here." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
          {data.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <Link href={n.link ?? "#"} className={cn("flex gap-4 px-5 py-4 hover:bg-muted/50", !n.read_at && "bg-accent/40")}>
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", n.read_at ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{n.title}</span>
                    {n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-muted-foreground" title={fmtDateTime(n.created_at)}>{relativeTime(n.created_at, now)}</span>
                  </span>
                  {!n.read_at && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5">
        <Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / PAGE))} total={count ?? 0} />
      </div>
    </>
  );
}
