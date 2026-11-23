import Link from "next/link";
import { ChevronRight, Hourglass, UserCheck } from "lucide-react";

/** Shown to a user whose own account is still waiting for approval. */
export function PendingSelfBanner({ approver, restriction }: { approver: string; restriction?: string }) {
  return (
    <div role="status" className="mb-5 flex gap-3 rounded-xl border border-status-busy/40 bg-status-busy-bg p-4 text-status-busy-fg">
      <Hourglass aria-hidden className="mt-0.5 size-5 shrink-0 text-status-busy" />
      <div>
        <p className="font-semibold">Verification pending</p>
        <p className="text-sm">
          Your account is waiting for approval by {approver}. {restriction}
        </p>
      </div>
    </div>
  );
}

/** Shown to class teachers / Cluster Heads who have accounts to approve. */
export function ApprovalsReminder({ students, teachers, studentsHref, teachersHref }: { students: number; teachers: number; studentsHref: string; teachersHref?: string }) {
  if (!students && !teachers) return null;
  const parts = [students ? `${students} student${students > 1 ? "s" : ""}` : null, teachers ? `${teachers} teacher${teachers > 1 ? "s" : ""}` : null].filter(Boolean).join(" and ");
  return (
    <Link
      href={students ? studentsHref : (teachersHref ?? studentsHref)}
      className="mb-5 flex items-center gap-3 rounded-xl border border-status-busy/40 bg-status-busy-bg p-4 text-status-busy-fg transition-shadow hover:shadow-md"
    >
      <UserCheck aria-hidden className="size-5 shrink-0 text-status-busy" />
      <p className="flex-1 text-sm">
        <span className="font-semibold">{parts} waiting for your approval.</span> Review their details and approve or reject.
      </p>
      <ChevronRight aria-hidden className="size-5 shrink-0" />
    </Link>
  );
}
