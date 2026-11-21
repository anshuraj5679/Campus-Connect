"use client";

import { useEffect } from "react";
import { markAnnouncementsRead } from "@/lib/actions/announcements";

/** Marks the notices on screen as read (the unread dots stay visible for this visit). */
export function MarkRead({ ids }: { ids: string[] }) {
  useEffect(() => {
    if (ids.length) markAnnouncementsRead(ids);
  }, [ids]);
  return null;
}
