import Link from "next/link";
import { MapPin } from "lucide-react";
import { StatusChip } from "./status-chip";
import { PersonAvatar } from "./kit";
import type { TeacherStatus } from "@/lib/services/availability";
import type { DirectoryTeacher } from "@/lib/data/teachers";
import { ROLE_LABEL, isRole } from "@/lib/auth/roles";

/** Find-a-Teacher card: who, where, and live status with one line of context. */
export function TeacherCard({ teacher, status }: { teacher: DirectoryTeacher; status: TeacherStatus }) {
  const roleBadge = teacher.role === "HOD" || teacher.role === "CLUSTER_HEAD" ? (isRole(teacher.role) ? ROLE_LABEL[teacher.role] : null) : null;
  return (
    <Link
      href={`/teachers/${teacher.id}`}
      className="group flex flex-col rounded-xl border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-3.5">
        <PersonAvatar name={teacher.fullName} src={teacher.avatarUrl} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold group-hover:text-primary">{teacher.fullName}</p>
          <p className="truncate text-sm text-muted-foreground">{teacher.designation}</p>
          <p className="truncate text-sm text-muted-foreground">
            {teacher.departmentCode}
            {teacher.clusterName ? ` · ${teacher.clusterName}` : ""}
            {roleBadge && <span className="ml-1.5 rounded bg-maroon/10 px-1.5 py-0.5 text-xs font-semibold text-maroon">{roleBadge}</span>}
          </p>
          {teacher.classTeacherOf && (
            <p className="mt-1">
              <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">Class Teacher · {teacher.departmentCode} {teacher.classTeacherOf}</span>
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <StatusChip status={status.status} label={status.label} size="lg" />
        <p className="text-sm font-medium text-foreground/85">{status.detail}</p>
      </div>
      {teacher.cabin && (
        <p className="mt-auto flex items-center gap-1.5 border-t pt-3 text-sm text-muted-foreground [&:not(:first-child)]:mt-4">
          <MapPin aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{teacher.cabin}</span>
        </p>
      )}
    </Link>
  );
}
