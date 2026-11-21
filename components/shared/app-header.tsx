import Link from "next/link";
import { siteConfig, isDemoMode } from "@/lib/config";
import { ROLE_LABEL, homeForRole } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getNow, isTimeSimulated } from "@/lib/datetime";
import { addDaysToDate, isoDayOfDate, istDateTime, istParts } from "@/lib/services/time";
import { Crest } from "./crest";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { SimulateTime } from "./simulate-time";

function demoPresets(now: Date) {
  const today = istParts(now).date;
  let monday = today;
  while (isoDayOfDate(monday) !== 1) monday = addDaysToDate(monday, 1);
  return [
    { label: "Mon 9:30 AM", iso: istDateTime(monday, "09:30").toISOString() },
    { label: "Mon 10:55 AM", iso: istDateTime(monday, "10:55").toISOString() },
    { label: "Mon 12:15 PM", iso: istDateTime(monday, "12:15").toISOString() },
    { label: "Mon 2:00 PM", iso: istDateTime(monday, "14:00").toISOString() },
    { label: "Mon 6:00 PM", iso: istDateTime(monday, "18:00").toISOString() },
  ];
}

/** Institutional top bar: crest, app + college name, AY chip, (demo clock), bell, account menu. */
export async function AppHeader({ user }: { user: CurrentUser }) {
  const isStudent = user.role === "STUDENT";
  const supabase = await createClient();
  const [{ count }, now, simulated] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    getNow(),
    isTimeSimulated(),
  ]);

  return (
    <header className="sticky top-0 z-40 h-16 bg-primary text-primary-foreground shadow-sm dark:bg-card dark:text-card-foreground">
      <div className="h-1 bg-maroon" aria-hidden />
      <div className="flex h-15 items-center gap-2 px-3 sm:px-5">
        {!isStudent && <MobileNav role={user.role} />}

        <Link href={homeForRole(user.role)} className="flex min-w-0 items-center gap-3 rounded-md pr-2" aria-label={`${siteConfig.appName} home`}>
          <Crest className="h-10 w-9" />
          <span className="min-w-0 leading-tight">
            <span className="block text-lg font-bold tracking-tight">{siteConfig.appName}</span>
            <span className="block max-w-[46vw] truncate text-xs opacity-80 sm:max-w-none">{siteConfig.collegeName}</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="hidden rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-white/20 md:inline-block dark:bg-muted dark:ring-border">
            {siteConfig.academicYearLabel}
          </span>
          {isDemoMode && <SimulateTime nowIso={now.toISOString()} simulated={simulated} presets={demoPresets(now)} />}
          <NotificationBell userId={user.id} initialUnread={count ?? 0} />
          <UserMenu fullName={user.fullName} email={user.email} roleLabel={ROLE_LABEL[user.role]} avatarUrl={user.avatarUrl} />
        </div>
      </div>
    </header>
  );
}
