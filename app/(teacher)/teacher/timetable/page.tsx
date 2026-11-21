import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { TimetableEditor } from "@/components/teacher/timetable-editor";
import { getViewer } from "@/lib/data/viewer";
import { getCalendar } from "@/lib/data/calendar";
import { loadOtherEntries, loadSectionOptions, loadTeacherVersions } from "@/lib/data/timetable";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Timetable" };

export default async function TeacherTimetablePage() {
  const viewer = await getViewer();
  const [calendar, versions, sections, others] = await Promise.all([
    getCalendar(),
    loadTeacherVersions(viewer.id),
    loadSectionOptions(),
    loadOtherEntries(createAdminClient(), viewer.id),
  ]);
  const editing = versions.draft ? versions.draftEntries : versions.publishedEntries;

  return (
    <>
      <PageHeader
        title="My Timetable"
        description={
          versions.published
            ? `Published ${fmtDateTime(versions.published.published_at!)}${versions.draft ? " · you have an unpublished draft" : ""}`
            : "Not published yet. Students see “Timetable Not Published” until you publish."
        }
        breadcrumbs={[{ label: "My Dashboard", href: "/teacher" }, { label: "Timetable" }]}
        actions={
          <Button variant="outline" asChild>
            <Link href="/teacher/timetable/upload"><Upload aria-hidden /> Upload PDF / photo</Link>
          </Button>
        }
      />
      <TimetableEditor
        key={versions.draft?.updated_at ?? versions.published?.published_at ?? "new"}
        periods={calendar.periods}
        sections={sections}
        initialEntries={editing}
        otherEntries={others}
        hasDraft={!!versions.draft}
        source={(versions.draft?.source as "MANUAL" | "UPLOAD") ?? "MANUAL"}
        filePath={versions.draft?.file_path ?? null}
      />
    </>
  );
}
