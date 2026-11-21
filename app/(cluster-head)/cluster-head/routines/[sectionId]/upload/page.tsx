import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { OcrUpload } from "@/components/teacher/ocr-upload";
import { getViewer } from "@/lib/data/viewer";
import { getCalendar } from "@/lib/data/calendar";
import { loadRoutine, loadRoutineTeachers } from "@/lib/data/routines";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Upload section routine" };

export default async function UploadRoutinePage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) notFound();
  const viewer = await getViewer();
  const routine = await loadRoutine(sectionId);
  if (!routine) notFound();
  if (!viewer.clusterHeadOf.includes(routine.section.clusterId)) forbidden();

  const admin = createAdminClient();
  const [calendar, teachers, codesA, codesB] = await Promise.all([
    getCalendar(),
    loadRoutineTeachers(routine.section.departmentId, routine.section.clusterId),
    admin.from("section_timetable_entries").select("subject_code").not("subject_code", "is", null).limit(2000),
    admin.from("timetable_entries").select("subject_code").not("subject_code", "is", null).limit(2000),
  ]);
  // Subject codes already used in the college, for correcting OCR misreads.
  const knownCodes = [...new Set([...(codesA.data ?? []), ...(codesB.data ?? [])].map((r) => r.subject_code as string))];
  const s = routine.section;

  return (
    <>
      <PageHeader
        title={`Upload Section ${s.name} routine`}
        description="Scan → review → publish. Teachers are matched by name or initials; low-confidence cells are highlighted in yellow and must be checked."
        breadcrumbs={[
          { label: "Section Routines", href: "/cluster-head/routines" },
          { label: `Section ${s.name}`, href: `/cluster-head/routines/${s.id}` },
          { label: "Upload" },
        ]}
      />
      <OcrUpload
        periods={calendar.periods}
        sections={[]}
        otherEntries={[]}
        departmentCode={s.departmentCode}
        knownCodes={knownCodes}
        routine={{ sectionId: s.id, sectionName: s.name, homeRoom: s.homeRoom, teachers: teachers.map((t) => ({ id: t.id, name: t.name })) }}
      />
    </>
  );
}
