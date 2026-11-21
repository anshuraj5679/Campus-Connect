import { Paperclip, Pin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnnouncementItem } from "@/lib/data/announcements";
import { fmtDate, relativeTime } from "@/lib/format";

const AUDIENCE: Record<AnnouncementItem["audience"], string> = { STUDENTS: "Students", TEACHERS: "Teachers", BOTH: "Students & teachers" };

export function AnnouncementCard({ a, now, actions }: { a: AnnouncementItem; now: Date; actions?: React.ReactNode }) {
  return (
    <article className={cn("rounded-xl border bg-card p-5 shadow-card", a.pinned && "border-maroon/30", a.unread && "ring-2 ring-primary/20")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {a.unread && <span className="size-2.5 rounded-full bg-primary" aria-label="Unread" />}
          {a.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-maroon/10 px-2 py-0.5 text-xs font-semibold text-maroon">
              <Pin aria-hidden className="size-3" /> Pinned
            </span>
          )}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{a.scopeLabel}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            <Users aria-hidden className="size-3" />
            {AUDIENCE[a.audience]}
            {a.semesters.length > 0 && ` · Sem ${a.semesters.join(", ")}`}
            {a.sections.length > 0 && ` · ${a.sections.join(", ")}`}
          </span>
        </div>
        {actions}
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug">{a.title}</h3>
      <p className="mt-1.5 whitespace-pre-wrap text-[15px] text-foreground/90">{a.body}</p>
      {a.attachmentName && (
        <a href={a.attachmentUrl ?? "#"} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:border-primary/40 hover:text-primary">
          <Paperclip aria-hidden className="size-4" /> {a.attachmentName}
        </a>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {a.authorName} · {relativeTime(a.createdAt, now)}
        {a.expiresAt && ` · expires ${fmtDate(a.expiresAt)}`}
      </p>
    </article>
  );
}
