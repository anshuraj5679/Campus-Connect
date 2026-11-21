"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Play, Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/shared/confirm-button";
import {
  assignClusterHead,
  assignHod,
  changeUserRole,
  createCluster,
  createDepartment,
  createSection,
  deleteStructureItem,
  moveTeacherToCluster,
  setUserFlag,
  addHoliday,
  deleteHoliday,
} from "@/lib/actions/admin";
import { runJobsNow } from "@/lib/actions/demo";
import type { ActionResult } from "@/lib/server/action";

function useRun() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });
  return { pending, run };
}

export function AssignHeadSelect({ kind, targetId, currentId, options }: { kind: "hod" | "cluster"; targetId: string; currentId: string | null; options: { id: string; name: string }[] }) {
  const { pending, run } = useRun();
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`assign-${targetId}`}>{kind === "hod" ? "HOD" : "Cluster Head"}</label>
      <NativeSelect
        id={`assign-${targetId}`}
        className="h-9 min-w-52"
        value={currentId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value || null;
          run(() => (kind === "hod" ? assignHod(targetId, v) : assignClusterHead(targetId, v)));
        }}
      >
        <option value="">{kind === "hod" ? "No HOD (vacant)" : "No Cluster Head (vacant)"}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </NativeSelect>
      {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
    </div>
  );
}

export function MoveTeacherSelect({ teacherId, clusterId, clusters }: { teacherId: string; clusterId: string | null; clusters: { id: string; name: string }[] }) {
  const { pending, run } = useRun();
  return (
    <NativeSelect className="h-8 w-36 text-xs" aria-label="Move to cluster" value={clusterId ?? ""} disabled={pending} onChange={(e) => run(() => moveTeacherToCluster(teacherId, e.target.value || null))}>
      <option value="">No cluster</option>
      {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </NativeSelect>
  );
}

export function AddDepartmentForm() {
  const { pending, run } = useRun();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => createDepartment({ code, name }), () => { setCode(""); setName(""); }); }}>
      <Input aria-label="Department code" placeholder="Code (e.g. ISE)" value={code} onChange={(e) => setCode(e.target.value)} className="w-36 uppercase" />
      <Input aria-label="Department name" placeholder="Department name" value={name} onChange={(e) => setName(e.target.value)} className="min-w-56 flex-1" />
      <Button type="submit" disabled={pending}><Plus aria-hidden /> Add department</Button>
    </form>
  );
}

export function AddClusterForm({ departmentId }: { departmentId: string }) {
  const { pending, run } = useRun();
  const [name, setName] = useState("");
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => createCluster({ departmentId, name }), () => setName("")); }}>
      <Input aria-label="Cluster name" placeholder="New cluster name" value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-44" />
      <Button type="submit" size="sm" variant="outline" disabled={pending || !name.trim()}><Plus aria-hidden /> Cluster</Button>
    </form>
  );
}

export function AddSectionForm({ departmentId, clusterId }: { departmentId: string; clusterId: string }) {
  const { pending, run } = useRun();
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => createSection({ departmentId, clusterId, name, homeRoom: room }), () => { setName(""); setRoom(""); }); }}>
      <Input aria-label="Section" placeholder="5C" value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-16 text-xs uppercase" />
      <Input aria-label="Home room" placeholder="Room" value={room} onChange={(e) => setRoom(e.target.value)} className="h-8 w-20 text-xs" />
      <Button type="submit" size="xs" variant="outline" disabled={pending || !name.trim()}><Plus aria-hidden /> Section</Button>
    </form>
  );
}

export function DeleteStructureButton({ kind, id, label }: { kind: "cluster" | "section"; id: string; label: string }) {
  return (
    <ConfirmButton title={`Delete ${label}?`} description="Only empty clusters / sections can be deleted." confirmLabel="Delete" onConfirm={() => deleteStructureItem(kind, id)} variant="ghost" size="icon-xs" aria-label={`Delete ${label}`}>
      <Trash aria-hidden />
    </ConfirmButton>
  );
}

export function UserRowControls({ userId, role, isActive, isVerified, isSelf }: { userId: string; role: string; isActive: boolean; isVerified: boolean; isSelf: boolean }) {
  const { pending, run } = useRun();
  const lockedRole = role === "HOD" || role === "CLUSTER_HEAD";
  return (
    <div className="flex flex-wrap items-center gap-4">
      {lockedRole ? (
        <span className="w-36 text-xs text-muted-foreground">Change on Structure page</span>
      ) : (
        <NativeSelect aria-label="Role" className="h-9 w-36" value={role} disabled={pending || isSelf} onChange={(e) => run(() => changeUserRole(userId, e.target.value as "STUDENT" | "TEACHER" | "ADMIN"))}>
          <option value="STUDENT">Student</option>
          <option value="TEACHER">Teacher</option>
          <option value="ADMIN">Admin</option>
        </NativeSelect>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isVerified} disabled={pending} onCheckedChange={(v) => run(() => setUserFlag(userId, "is_verified", v))} aria-label="Verified" />
        Verified
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} disabled={pending || isSelf} onCheckedChange={(v) => run(() => setUserFlag(userId, "is_active", v))} aria-label="Active" />
        Active
      </label>
    </div>
  );
}

export function AddHolidayForm() {
  const { pending, run } = useRun();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addHoliday({ date, name }), () => { setDate(""); setName(""); }); }}>
      <Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      <Input aria-label="Holiday name" placeholder="e.g. Kannada Rajyotsava" value={name} onChange={(e) => setName(e.target.value)} className="min-w-56 flex-1" />
      <Button type="submit" disabled={pending}><Plus aria-hidden /> Add holiday</Button>
    </form>
  );
}

export function DeleteHolidayButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton title={`Remove "${name}"?`} confirmLabel="Remove" onConfirm={() => deleteHoliday(id)} variant="ghost" size="icon-sm" aria-label={`Remove ${name}`}>
      <Trash aria-hidden />
    </ConfirmButton>
  );
}

export function RunJobsButton({ className }: { className?: string }) {
  const { pending, run } = useRun();
  return (
    <Button variant="outline" className={className} disabled={pending} onClick={() => run(() => runJobsNow())}>
      {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Play aria-hidden />} Run SLA &amp; auto-close now
    </Button>
  );
}
