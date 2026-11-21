"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleArrowUp as ArrowUpCircle, CheckCheck, CircleCheckBig, Eye, LoaderCircle, MessageSquareReply, RotateCcw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { complaintAction } from "@/lib/actions/complaints";
import type { ComplaintAction } from "@/lib/services/complaintWorkflow";

type Def = { label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; variant?: "default" | "outline" | "secondary" | "destructive"; remark?: { label: string; required: boolean; placeholder: string }; confirm?: string };

const DEFS: Partial<Record<ComplaintAction, Def>> = {
  START_REVIEW: { label: "Start review", icon: Eye, variant: "outline" },
  REQUEST_RESPONSE: { label: "Request teacher response", icon: MessageSquareReply, variant: "outline", remark: { label: "Message to the teacher", required: false, placeholder: "Please share your side regarding…" }, confirm: "The teacher will be notified and can reply privately. They will not see who complained." },
  MARK_ACTION_TAKEN: { label: "Mark action taken", icon: Wrench, variant: "outline", remark: { label: "What action was taken?", required: false, placeholder: "e.g. Spoke to the lab in-charge" } },
  ESCALATE: { label: "Escalate", icon: ArrowUpCircle, variant: "destructive", remark: { label: "Reason for escalation", required: false, placeholder: "Needs HOD approval because…" }, confirm: "The complaint moves to the next level (Cluster Head → HOD → Administrator)." },
  RESOLVE: { label: "Resolve", icon: CircleCheckBig, variant: "default", remark: { label: "Resolution remarks (shown to the student)", required: true, placeholder: "Explain what was done…" } },
  REOPEN: { label: "Reopen", icon: RotateCcw, variant: "destructive", remark: { label: "Why are you reopening?", required: true, placeholder: "The issue is still happening because…" }, confirm: "You can reopen only once, within 7 days of resolution." },
  CLOSE: { label: "Accept & close", icon: CheckCheck, variant: "outline", confirm: "Closing confirms the issue is resolved. It can't be reopened afterwards." },
};

const ORDER: ComplaintAction[] = ["START_REVIEW", "REQUEST_RESPONSE", "MARK_ACTION_TAKEN", "ESCALATE", "RESOLVE", "REOPEN", "CLOSE"];

/** Buttons for exactly the actions the workflow service allows this viewer (re-checked on the server). */
export function ComplaintActionBar({ complaintId, actions }: { complaintId: string; actions: ComplaintAction[] }) {
  const [open, setOpen] = useState<ComplaintAction | null>(null);
  const [remark, setRemark] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const visible = ORDER.filter((a) => actions.includes(a) && DEFS[a]);
  if (visible.length === 0) return null;

  const run = (action: ComplaintAction) =>
    startTransition(async () => {
      const r = await complaintAction({ complaintId, action, remark: remark.trim() || undefined });
      if (r.ok) {
        toast.success(r.message ?? "Done");
        setOpen(null);
        setRemark("");
        router.refresh();
      } else toast.error(r.error);
    });

  const def = open ? DEFS[open]! : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {visible.map((a) => {
          const d = DEFS[a]!;
          return (
            <Button key={a} variant={d.variant ?? "outline"} onClick={() => (d.remark || d.confirm ? (setRemark(""), setOpen(a)) : run(a))} disabled={pending}>
              <d.icon aria-hidden className="size-4" /> {d.label}
            </Button>
          );
        })}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          {def && open && (
            <form onSubmit={(e) => { e.preventDefault(); run(open); }} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{def.label}</DialogTitle>
                {def.confirm && <DialogDescription>{def.confirm}</DialogDescription>}
              </DialogHeader>
              {def.remark && (
                <div className="space-y-1.5">
                  <Label htmlFor="remark">{def.remark.label}{def.remark.required && " *"}</Label>
                  <Textarea id="remark" rows={4} autoFocus value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={def.remark.placeholder} maxLength={2000} />
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
                <Button type="submit" variant={def.variant === "destructive" ? "destructive" : "default"} disabled={pending || (def.remark?.required && remark.trim().length < 5)}>
                  {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <def.icon aria-hidden className="size-4" />} {def.label}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
