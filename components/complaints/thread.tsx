"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, LoaderCircle, Send, UserRoundCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { postComplaintMessage } from "@/lib/actions/complaints";

type Msg = { id: string; senderName: string; senderRole: string; body: string; audience: "PUBLIC" | "INTERNAL" | "TEACHER"; createdAt: string; mine: boolean };
type Channel = "PUBLIC" | "INTERNAL" | "TEACHER";

const CHANNEL_LABEL: Record<Channel, string> = { PUBLIC: "Reply to student", INTERNAL: "Internal note", TEACHER: "Message teacher" };

/** Chat-style thread. Handlers can add yellow internal notes that students never receive (RLS). */
export function ComplaintThread({
  complaintId,
  messages,
  channels,
  disabledReason,
}: {
  complaintId: string;
  messages: Msg[];
  channels: Channel[];
  disabledReason?: string | null;
}) {
  const [channel, setChannel] = useState<Channel>(channels[0] ?? "PUBLIC");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view by scrolling the message list only (never the page).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Live: new messages on this complaint (RLS filters what this user may receive)
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`complaint:${complaintId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "complaint_messages", filter: `complaint_id=eq.${complaintId}` }, () => router.refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "complaints", filter: `id=eq.${complaintId}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [complaintId, router]);

  const send = () =>
    startTransition(async () => {
      const r = await postComplaintMessage({ complaintId, body, audience: channel });
      if (r.ok) {
        setBody("");
        toast.success(r.message ?? "Sent");
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="flex min-h-[420px] flex-col">
      <div ref={listRef} className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" role="log" aria-label="Messages" tabIndex={0}>
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p>}
        {messages.map((m) => {
          const internal = m.audience === "INTERNAL";
          const teacher = m.audience === "TEACHER";
          return (
            <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                  internal
                    ? "border border-yellow-300 bg-yellow-50 text-yellow-950 dark:bg-yellow-900/40 dark:text-yellow-50"
                    : teacher
                      ? "border border-violet-200 bg-violet-50 text-violet-950 dark:bg-violet-900/40 dark:text-violet-50"
                      : m.mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                  m.mine ? "rounded-br-md" : "rounded-bl-md",
                )}
              >
                <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold opacity-80">
                  {internal && <Lock aria-hidden className="size-3" />}
                  {teacher && <UserRoundCog aria-hidden className="size-3" />}
                  {m.mine ? "You" : m.senderName}
                  {m.senderRole && !m.mine && <span className="font-normal">· {m.senderRole.replace("_", " ").toLowerCase()}</span>}
                  {internal && <span className="rounded bg-yellow-300 px-1 text-[10px] text-yellow-950">INTERNAL NOTE</span>}
                  {teacher && <span className="rounded bg-violet-200 px-1 text-[10px] text-violet-950">HANDLER ↔ TEACHER</span>}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-right text-[11px] opacity-70 tabular-nums">
                  {new Date(m.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t p-3">
        {channels.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">{disabledReason ?? "You cannot post on this complaint."}</p>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (body.trim()) send(); }} className="space-y-2">
            {channels.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Message type">
                {channels.map((c) => (
                  <button key={c} type="button" role="tab" aria-selected={channel === c} onClick={() => setChannel(c)}
                    className={cn("rounded-full border px-3 py-1 text-xs font-semibold", channel === c ? (c === "INTERNAL" ? "border-yellow-400 bg-yellow-100 text-yellow-950" : "border-primary bg-primary text-primary-foreground") : "bg-card")}>
                    {CHANNEL_LABEL[c]}
                  </button>
                ))}
              </div>
            )}
            <label htmlFor="msg" className="sr-only">Message</label>
            <Textarea
              id="msg"
              rows={3}
              value={body}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              placeholder={channel === "INTERNAL" ? "Visible only to handlers…" : channel === "TEACHER" ? "Only you and the teacher see this…" : "Write a message…"}
              className={cn(channel === "INTERNAL" && "border-yellow-300 bg-yellow-50/60 dark:bg-yellow-950/30")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim()) send();
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Ctrl + Enter to send</span>
              <Button type="submit" disabled={pending || !body.trim()}>
                {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />} {channel === "INTERNAL" ? "Add note" : "Send"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
