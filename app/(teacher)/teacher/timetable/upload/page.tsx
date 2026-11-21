import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { OcrUpload } from "@/components/teacher/ocr-upload";
import { getViewer } from "@/lib/data/viewer";
import { getCalendar } from "@/lib/data/calendar";
import { loadOtherEntries, loadSectionOptions, loadTeacherVersions } from "@/lib/data/timetable";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Upload timetable" };

export default async function UploadTimetablePage() {
  const viewer = await getViewer();
  const [calendar, sections, others, mine] = await Promise.all([
    getCalendar(),
    loadSectionOptions(),
    loadOtherEntries(createAdminClient(), viewer.id),
    loadTeacherVersions(viewer.id),
  ]);
  const knownCodes = [...new Set([...others, ...mine.publishedEntries, ...mine.draftEntries].map((e) => e.subjectCode).filter((c): c is string => !!c))];
  return (
    <>
      <PageHeader
        title="Upload timetable"
        description="Scan → review → publish. Low-confidence cells are highlighted in yellow and must be checked."
        breadcrumbs={[{ label: "My Dashboard", href: "/teacher" }, { label: "Timetable", href: "/teacher/timetable" }, { label: "Upload" }]}
      />
      <OcrUpload
        periods={calendar.periods}
        sections={sections}
        otherEntries={others}
        departmentCode={viewer.teacher?.departmentCode ?? ""}
        knownCodes={knownCodes}
      />
    </>
  );
}
