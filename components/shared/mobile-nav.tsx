"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { siteConfig } from "@/lib/config";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { NAV_BY_ROLE } from "./nav-config";
import { NavList } from "./nav-list";
import { Crest } from "./crest";

/** Slide-in navigation drawer for staff on screens below lg. */
export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground lg:hidden dark:text-foreground" aria-label="Open menu">
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0">
        <SheetHeader className="flex-row items-center gap-2.5 border-b px-4 py-3">
          <Crest className="h-8 w-7" />
          <div className="min-w-0 text-left">
            <SheetTitle className="text-sm">{siteConfig.appName}</SheetTitle>
            <SheetDescription className="text-xs">{ROLE_LABEL[role]}</SheetDescription>
          </div>
        </SheetHeader>
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto p-3">
          <NavList groups={NAV_BY_ROLE[role]} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
