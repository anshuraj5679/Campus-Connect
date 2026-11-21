"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/**
 * Header bell with a live unread count (Supabase Realtime on `notifications`;
 * RLS guarantees each user only receives their own rows).
 */
export function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { count }] = await Promise.all([
      supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(8),
      supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    setItems(data ?? []);
    setUnread(count ?? 0);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as Item;
        setUnread((u) => u + 1);
        setItems((list) => (list ? [n, ...list].slice(0, 8) : list));
        toast.info(n.title, { description: n.body ?? undefined, action: n.link ? { label: "Open", onClick: () => router.push(n.link!) } : undefined });
        router.refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className="relative text-primary-foreground hover:bg-white/10 hover:text-primary-foreground dark:text-foreground">
          <Bell aria-hidden className="size-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-maroon px-1 text-[11px] font-bold text-maroon-foreground tabular-nums ring-2 ring-primary dark:ring-card">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Notifications</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                startTransition(async () => {
                  await markAllNotificationsRead();
                  await load();
                })
              }
            >
              <CheckCheck aria-hidden /> Mark all read
            </Button>
          )}
        </div>
        <ul className="max-h-[60vh] divide-y overflow-y-auto">
          {items === null && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</li>}
          {items?.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {items?.map((n) => (
            <li key={n.id}>
              <Link
                href={n.link ?? "/notifications"}
                onClick={() => {
                  setOpen(false);
                  if (!n.read_at) startTransition(() => markNotificationRead(n.id).then(() => setUnread((u) => Math.max(0, u - 1))));
                }}
                className={cn("flex gap-3 px-4 py-3 hover:bg-muted", !n.read_at && "bg-accent/50")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{n.title}</span>
                  {n.body && <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                  <span className="mt-0.5 block text-xs text-muted-foreground">{ago(n.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full" asChild onClick={() => setOpen(false)}>
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
