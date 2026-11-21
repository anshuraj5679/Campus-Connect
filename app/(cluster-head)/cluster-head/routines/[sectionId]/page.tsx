import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ExternalLink, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { TimetableEditor } from "@/components/teacher/timetable-editor";
import { getViewer } from "@/lib/data/viewer";
import { getCalendar } from "@/lib/data/calendar";
import { loadRoutine, loadRoutineTeachers } from "@/lib/data/routines";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Section routine" };

export default async function SectionRoutinePage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) notFound();
  const viewer = await getViewer();
  const routine = await loadRoutine(sectionId);
  if (!routine) notFound();
  if (!viewer.clusterHeadOf.includes(routine.section.clusterId)) forbidden();

  const [calendar, teachers] = await Promise.all([getCalendar(), loadRoutineTeachers(routine.section.departmentId, routine.section.clusterId)]);
  const editing = routine.draft ? routine.draftEntries : routine.publishedEntries;
  const filePath = routine.draft?.file_path ?? routine.published?.file_path ?? null;
  const fileUrl = filePath ? (await createAdminClient().storage.from("timetables").createSignedUrl(filePath, 60 * 60)).data?.signedUrl : null;
  const s = routine.section;

  return (
    <>
      <PageHeader
        title={`Section ${s.name} routine`}
        description={
          routine.published
            ? `${s.departmentCode} · ${s.clusterName} · published ${fmtDateTime(routine.published.published_at!)}${routine.draft ? " · you have unpublished changes" : ""}`
            : `${s.departmentCode} · ${s.clusterName} · not published yet. Students see “Routine not published”.`
        }
        breadcrumbs={[{ label: "Cluster Overview", href: "/cluster-head" }, { label: "Section Routines", href: "/cluster-head/routines" }, { label: `Section ${s.name}` }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {fileUrl && (
              <Button variant="outline" asChild>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /> Original file</a>
              </Button>
            )}
            <Button asChild>
              <Link href={`/cluster-head/routines/${s.id}/upload`}><Upload aria-hidden /> Upload PDF / photo</Link>
            </Button>
          </div>
        }
      />
      <TimetableEditor
        key={routine.draft?.updated_at ?? routine.published?.published_at ?? "new"}
        periods={calendar.periods}
        sections={[]}
        initialEntries={editing}
        otherEntries={[]}
        hasDraft={!!routine.draft}
        source="UPLOAD"
        filePath={filePath}
        routine={{ sectionId: s.id, sectionName: s.name, homeRoom: s.homeRoom, teachers: teachers.map((t) => ({ id: t.id, name: t.name })) }}
      />
    </>
  );
}
