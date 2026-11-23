"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheckBig, LoaderCircle, RotateCcw, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { approveAccount, assignClassTeacher, rejectAccount, restoreAccount } from "@/lib/actions/approvals";
import type { PersonStatus } from "@/lib/data/people";

/** Approve / reject a pending account (or restore a rejected one). */
export function ApprovalButtons({ userId, name, status }: { userId: string; name: string; status: PersonStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => ReturnType<typeof approveAccount>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  if (status === "REJECTED") {
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => restoreAccount(userId))}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />} Restore
      </Button>
    );
  }
  if (status !== "PENDING") return null;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button size="sm" disabled={pending} onClick={() => run(() => approveAccount(userId))} aria-label={`Approve ${name}`}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <CircleCheckBig aria-hidden />} Approve
      </Button>
      <ConfirmButton
        size="sm"
        variant="outline"
        title={`Reject ${name}?`}
        description="They won't be able to sign in. Use this for accounts that don't belong here (wrong section, not a student of the college). You can restore them later."
        confirmLabel="Reject registration"
        onConfirm={async () => {
          const r = await rejectAccount(userId);
          if (r.ok) router.refresh();
          return r;
        }}
        aria-label={`Reject ${name}`}
      >
        <UserX aria-hidden /> Reject
      </ConfirmButton>
    </div>
  );
}

/** Cluster Head picks a section's class teacher from the cluster's approved teachers. */
export function ClassTeacherSelect({
  sectionId,
  sectionName,
  currentId,
  options,
}: {
  sectionId: string;
  sectionName: string;
  currentId: string | null;
  options: { id: string; name: string; busyWith: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <NativeSelect
        aria-label={`Class teacher of Section ${sectionName}`}
        value={currentId ?? ""}
        disabled={pending}
        className="min-w-52"
        onChange={(e) => {
          const value = e.target.value;
          startTransition(async () => {
            const r = await assignClassTeacher(sectionId, value || null);
            if (r.ok) {
              toast.success(r.message);
              router.refresh();
            } else toast.error(r.error);
          });
        }}
      >
        <option value="">No class teacher yet</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={!!o.busyWith && o.id !== currentId}>
            {o.name}
            {o.busyWith && o.id !== currentId ? ` (class teacher of ${o.busyWith})` : ""}
          </option>
        ))}
      </NativeSelect>
      {pending && <LoaderCircle aria-hidden className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
