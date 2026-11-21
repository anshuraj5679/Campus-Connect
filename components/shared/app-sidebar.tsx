"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/auth/roles";
import { NAV_BY_ROLE, SIDEBAR_COOKIE } from "./nav-config";
import { NavList } from "./nav-list";

/** Desktop (lg+) collapsible sidebar. Collapsed state is kept in a cookie so the server renders it correctly. */
export function AppSidebar({ role, defaultCollapsed }: { role: Role; defaultCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-[4.5rem]" : "w-[17rem]",
      )}
    >
      <nav className="flex-1 overflow-x-hidden overflow-y-auto p-3">
        <NavList groups={NAV_BY_ROLE[role]} collapsed={collapsed} />
      </nav>
      <div className="border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("w-full text-muted-foreground", collapsed ? "justify-center" : "justify-start")}
        >
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          {!collapsed && <span>Collapse</span>}
        </Button>
      </div>
    </aside>
  );
}
