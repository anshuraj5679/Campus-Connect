import { CalendarClock, MessageSquareExclamationPoint, Megaphone, UserSearch } from "lucide-react";
import { Crest } from "@/components/shared/crest";
import { siteConfig } from "@/lib/config";

const FEATURES = [
  { icon: UserSearch, title: "Live teacher availability", text: "See who is in class, free or on leave, right now." },
  { icon: CalendarClock, title: "Period-wise timetables", text: "Today's classes, next class and room at a glance." },
  { icon: MessageSquareExclamationPoint, title: "Complaints that get resolved", text: "Auto-routed to the right person, tracked to closure." },
  { icon: Megaphone, title: "Notices in one place", text: "College, department and cluster announcements." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="h-1 bg-maroon" aria-hidden />
      <div className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <aside className="bg-pattern relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex dark:bg-card dark:text-card-foreground">
          <div className="flex items-center gap-4">
            <Crest className="h-16 w-14" />
            <div className="leading-tight">
              <p className="text-2xl font-bold tracking-tight">{siteConfig.appName}</p>
              <p className="mt-1 text-base opacity-90">{siteConfig.collegeName}</p>
              <p className="mt-0.5 text-xs opacity-70">{siteConfig.collegeTagline}</p>
            </div>
          </div>

          <div className="max-w-lg space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">Your college, connected.</h2>
            <ul className="space-y-4">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
                    <f.icon aria-hidden className="size-5" />
                  </span>
                  <span>
                    <span className="block font-semibold">{f.title}</span>
                    <span className="block text-sm opacity-80">{f.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-end justify-between gap-4 text-xs opacity-75">
            <p>{siteConfig.collegeAddress}</p>
            <p className="shrink-0 tabular-nums">{siteConfig.academicYearLabel}</p>
          </div>
        </aside>

        <main className="flex items-start justify-center px-4 py-8 sm:items-center sm:px-6 sm:py-12">
          <div className="w-full max-w-xl">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <Crest className="h-12 w-11" />
              <div className="leading-tight">
                <p className="text-lg font-bold text-primary">{siteConfig.appName}</p>
                <p className="text-sm text-muted-foreground">{siteConfig.collegeName}</p>
              </div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
