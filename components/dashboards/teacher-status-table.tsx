import Link from "next/link";
import { StatusChip } from "@/components/shared/status-chip";
import { PersonAvatar } from "@/components/shared/kit";
import type { DirectoryTeacher } from "@/lib/data/teachers";
import type { TeacherAvailability } from "@/lib/data/availability";

/** Live status of a group of teachers (Cluster Head / HOD monitoring). */
export function TeacherStatusTable({ teachers, availability }: { teachers: DirectoryTeacher[]; availability: Map<string, TeacherAvailability> }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">Teacher</th>
            <th scope="col" className="px-4 py-3">Status now</th>
            <th scope="col" className="hidden px-4 py-3 md:table-cell">Next class</th>
            <th scope="col" className="hidden px-4 py-3 lg:table-cell">Timetable</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {teachers.map((t) => {
            const a = availability.get(t.id)!;
            return (
              <tr key={t.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link href={`/teachers/${t.id}`} className="flex items-center gap-3">
                    <PersonAvatar name={t.fullName} className="size-9" />
                    <span>
                      <span className="block font-semibold hover:text-primary">{t.fullName}</span>
                      <span className="block text-xs text-muted-foreground">{t.designation}{t.role === "CLUSTER_HEAD" ? " · Cluster Head" : t.role === "HOD" ? " · HOD" : ""}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={a.status.status} label={a.status.label} size="sm" />
                  <p className="mt-1 text-xs text-muted-foreground">{a.status.detail}</p>
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {a.next ? (
                    <span className="text-sm">{a.next.subjectCode ?? a.next.subjectName} · {a.next.section ?? ""}<span className="block text-xs text-muted-foreground">{a.next.startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit" })}</span></span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  {a.entries ? <span className="text-status-available-fg">Published · {a.entries.length} classes</span> : <span className="text-muted-foreground">Not published</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
