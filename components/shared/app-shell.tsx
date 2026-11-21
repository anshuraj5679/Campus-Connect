import { cookies } from "next/headers";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/lib/auth/session";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { SIDEBAR_COOKIE } from "./nav-config";
import { StudentBottomNav } from "./student-bottom-nav";

/**
 * Signed-in layout used by every role's route group.
 * Navigation is chosen from the *user's* role, so a Cluster Head opening
 * /teacher/timetable still sees the Cluster Head sidebar.
 */
export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const isStudent = user.role === "STUDENT";

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>
      <AppHeader user={user} />
      <div className="flex flex-1">
        <AppSidebar role={user.role} defaultCollapsed={collapsed} />
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8",
            isStudent && "pb-24 lg:pb-6",
          )}
        >
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
      </div>
      {isStudent && <StudentBottomNav />}
    </div>
  );
}
