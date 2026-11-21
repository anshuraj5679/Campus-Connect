"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead } from "@/lib/actions/notifications";

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await markAllNotificationsRead();
          if (r.ok) {
            toast.success("All notifications marked as read");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <CheckCheck aria-hidden /> Mark all as read
    </Button>
  );
}
