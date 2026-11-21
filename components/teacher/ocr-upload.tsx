"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BookOpen, FileUp, LoaderCircle, Minus, Plus, RotateCcw, ScanText, TriangleExclamationPoint as TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { TimetableEditor, type RoutineContext } from "./timetable-editor";
import { uploadDirect } from "@/lib/upload-client";
import { matchTeacherName, type OcrWord, type ParsedEntry } from "@/lib/services/ocrParser";
import { toGray, type Gray } from "@/lib/services/ocrPreprocess";
import { readTimetableImage, type OcrFn } from "@/lib/services/ocrPipeline";
import type { EnrichedEntry, LegendRow } from "@/lib/services/routineParser";
import type { PeriodSlot } from "@/lib/services/periods";
import type { DraftEntry, OtherEntry } from "@/lib/services/timetableValidation";

type Section = { id: string; name: string; semester: number; homeRoom: string | null; departmentCode: string };
type Stage = "pick" | "working" | "subjects" | "review";

/**
 * Tesseract reads printed tables best at roughly 2,400–2,600 px wide:
 * smaller images lose the small header/day text, much larger ones break its
 * line detection. Every upload is normalised to this width.
 */
const OCR_WIDTH = 2500;

/** Render page 1 of a PDF at the OCR width with pdf.js. */
async function pdfToImage(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: OCR_WIDTH / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  return canvas.toDataURL("image/png");
}

/** Resize to the OCR width and read the greyscale pixels. */
async function loadGray(src: string): Promise<Gray> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = OCR_WIDTH / img.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return toGray(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}

/** Greyscale pixels → PNG data URL for Tesseract (cached per pixel buffer). */
const encoded = new WeakMap<Uint8ClampedArray, string>();
function toDataUrl(pixels: Uint8ClampedArray, w: number, h: number): string {
  const hit = encoded.get(pixels);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL("image/png");
  encoded.set(pixels, url);
  return url;
}

function wordsOf(data: { blocks?: { paragraphs: { lines: { words: OcrWord[] }[] }[] }[] | null }): OcrWord[] {
  const words: OcrWord[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox });
  return words;
}

/** Registered faculty account for a name: exact pick from the list first, then fuzzy name/initials. */
function resolveTeacher(name: string | null, teachers: { id: string; name: string }[]) {
  if (!name?.trim()) return { teacherId: null, teacherName: null };
  const exact = teachers.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
  const t = exact ?? matchTeacherName(name, teachers);
  return { teacherId: t?.id ?? null, teacherName: t?.name ?? name.trim() };
}

export function OcrUpload({
  periods,
  sections,
  otherEntries,
  departmentCode,
  knownCodes,
  routine,
}: {
  periods: PeriodSlot[];
  sections: Section[];
  otherEntries: OtherEntry[];
  departmentCode: string;
  /** Subject codes already used in the college, for correcting OCR misreads. */
  knownCodes: string[];
  /** Cluster Head uploading one section's routine (cells name subjects/teachers, not sections). */
  routine?: RoutineContext;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [base, setBase] = useState<(ParsedEntry | EnrichedEntry)[]>([]);
  const [legend, setLegend] = useState<LegendRow[]>([]);
  const [classRoom, setClassRoom] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [editorKey, setEditorKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Routine classes with the (possibly corrected) subject table applied. */
  function routineDrafts(list: (ParsedEntry | EnrichedEntry)[], rows: LegendRow[]): DraftEntry[] {
    return list.map((e) => {
      const en = e as EnrichedEntry;
      const row = en.legendIndex !== undefined ? rows[en.legendIndex] : undefined;
      const person = resolveTeacher(row ? (en.practical ? (row.practical ?? row.faculty) : row.faculty) : (en.teacherName ?? null), routine!.teachers);
      return {
        id: e.id,
        dayOfWeek: e.dayOfWeek,
        startPeriod: e.startPeriod,
        endPeriod: e.endPeriod,
        subjectCode: row ? row.code : e.subjectCode,
        subjectName: (row && e.type !== "LAB" ? row.name : e.subjectName).slice(0, 120) || "Unknown subject",
        sectionId: routine!.sectionId,
        section: routine!.sectionName,
        semester: null,
        room: e.room,
        type: e.type,
        ...person,
        lowConfidence: e.lowConfidence,
      };
    });
  }

  function toReview(drafts: DraftEntry[]) {
    setEntries(drafts);
    setEditorKey((k) => k + 1);
    setStage("review");
    const flagged = drafts.filter((d) => d.lowConfidence).length;
    if (drafts.length)
      toast.success(
        flagged
          ? `Read ${drafts.length} classes. ${flagged} cell${flagged > 1 ? "s" : ""} need checking (yellow) before publishing.`
          : `Read ${drafts.length} classes. Compare them with the original, then publish.`,
      );
  }

  async function handle(file: File) {
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) return toast.error("Upload a JPG, PNG or PDF file.");
    if (file.size > 10 * 1024 * 1024) return toast.error("The file must be 10 MB or smaller.");
    setStage("working");
    try {
      setStatusText("Uploading original…");
      setProgress(5);
      // Original goes straight to Storage (signed URL), never through the server
      const up = await uploadDirect(routine ? "routine" : "timetable", [file]);
      if ("error" in up) throw new Error(up.error);
      setFilePath(up.paths[0]);

      setStatusText(file.type === "application/pdf" ? "Rendering PDF…" : "Preparing image…");
      setProgress(10);
      const src = file.type === "application/pdf" ? await pdfToImage(file) : URL.createObjectURL(file);
      setImage(src);
      const gray = await loadGray(src);

      const { createWorker, PSM } = await import("tesseract.js");
      let pageCalls = 0;
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text" && pageCalls > 0) setProgress((p) => Math.max(p, Math.min(92, 12 + Math.round((pageCalls - 1 + m.progress) * 40))));
        },
      });
      const ocr: OcrFn = async (pixels, w, h, mode, rect) => {
        if (mode !== "block") pageCalls++;
        await worker.setParameters({ tessedit_pageseg_mode: mode === "sparse" ? PSM.SPARSE_TEXT : mode === "block" ? PSM.SINGLE_LINE : PSM.AUTO });
        const { data } = await worker.recognize(toDataUrl(pixels, w, h), rect ? { rectangle: rect } : {}, { blocks: true, text: true });
        return { words: wordsOf(data), text: data.text ?? "" };
      };
      const result = await readTimetableImage(gray, ocr, {
        periods,
        knownCodes,
        routine: routine ? { sectionName: routine.sectionName, teachers: routine.teachers } : undefined,
        onStatus: setStatusText,
      });
      await worker.terminate();
      setProgress(100);
      setWarnings(result.warnings);

      if (routine) {
        setBase(result.entries);
        setLegend(result.legend);
        setClassRoom(result.header?.classRoom ?? null);
        if (result.legend.length) setStage("subjects");
        else toReview(routineDrafts(result.entries, []));
        return;
      }

      const deptSections = sections.filter((s) => s.departmentCode === departmentCode);
      toReview(
        result.entries.map((e) => {
          const match = deptSections.find((s) => s.name === e.section) ?? null;
          return {
            id: e.id,
            dayOfWeek: e.dayOfWeek,
            startPeriod: e.startPeriod,
            endPeriod: e.endPeriod,
            subjectCode: e.subjectCode,
            subjectName: e.subjectName.slice(0, 120) || e.subjectCode || "Unknown subject",
            sectionId: match?.id ?? null,
            section: match?.name ?? null,
            semester: match?.semester ?? null,
            room: e.room ?? match?.homeRoom ?? null,
            type: e.type,
            lowConfidence: e.lowConfidence || !match,
          };
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the file.");
      setStage("pick");
    }
  }

  if (stage === "pick" || stage === "working") {
    return (
      <div className="mx-auto max-w-2xl">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f && stage === "pick") handle(f);
          }}
          className="flex flex-col items-center rounded-2xl border-2 border-dashed bg-card p-10 text-center shadow-card"
        >
          {stage === "pick" ? (
            <>
              <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileUp aria-hidden className="size-8" /></span>
              <p className="text-lg font-semibold">{routine ? `Upload Section ${routine.sectionName} routine` : "Upload your timetable"}</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {routine
                  ? "The department timetable sheet (photo or PDF), including the subject / code / faculty table under it. We read the grid and the subject table; you check everything before publishing."
                  : "A clear, straight photo or PDF works best. We read it with OCR and build a draft. You review every cell, and nothing goes live until you publish."}
              </p>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" id="tt-file" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
              <Button size="lg" className="mt-5" onClick={() => inputRef.current?.click()}>
                <FileUp aria-hidden /> Choose file
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">JPG, PNG or PDF · up to 10 MB · or drag and drop</p>
            </>
          ) : (
            <>
              <LoaderCircle aria-hidden className="mb-4 size-10 animate-spin text-primary" />
              <p className="text-lg font-semibold">{statusText}</p>
              <Progress value={progress} className="mt-4 w-full max-w-sm" aria-label="OCR progress" />
              <p className="mt-2 text-sm text-muted-foreground tabular-nums">{progress}%</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const original = (
    <section className="rounded-xl border bg-card shadow-card" aria-label="Original file">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="flex items-center gap-2 font-semibold"><ScanText aria-hidden className="size-5 text-primary" /> Original</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out"><Minus aria-hidden /></Button>
          <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in"><Plus aria-hidden /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom(1)} aria-label="Reset zoom"><RotateCcw aria-hidden /></Button>
        </div>
      </div>
      <div className="h-[70vh] overflow-auto bg-muted/40 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt="Uploaded timetable" style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="origin-top-left rounded shadow" />}
      </div>
    </section>
  );

  const warningBox = (list: string[]) =>
    list.length > 0 && (
      <div role="status" className="flex gap-3 rounded-xl border border-status-busy/40 bg-status-busy-bg p-4 text-sm text-status-busy-fg">
        <TriangleAlert aria-hidden className="size-5 shrink-0 text-status-busy" />
        <ul className="space-y-0.5">{list.map((w) => <li key={w}>{w}</li>)}</ul>
      </div>
    );

  if (stage === "subjects" && routine) {
    const uses = (i: number) => base.filter((e) => (e as EnrichedEntry).legendIndex === i).length;
    const set = (i: number, patch: Partial<LegendRow>) => setLegend((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    return (
      <div className="space-y-4">
        {warningBox(warnings)}
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {original}
          <section className="min-w-0 rounded-xl border bg-card shadow-card" aria-labelledby="subjects-title">
            <div className="border-b px-5 py-3.5">
              <h2 id="subjects-title" className="flex items-center gap-2 text-base font-semibold"><BookOpen aria-hidden className="size-5 text-primary" /> Step 1 of 2 · Subjects &amp; faculty</h2>
              <p className="text-sm text-muted-foreground">
                Read from the table under the timetable. Fix any spelling here once and it applies to every class of that subject.
                {classRoom && <> Class room: <strong>{classRoom}</strong> (used for theory classes).</>}
              </p>
            </div>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-2 py-1.5 font-semibold">Subject</th>
                    <th className="w-32 px-2 py-1.5 font-semibold">Code</th>
                    <th className="px-2 py-1.5 font-semibold">Faculty</th>
                    <th className="px-2 py-1.5 font-semibold">Faculty for practical</th>
                    <th className="w-16 px-2 py-1.5 text-right font-semibold">Classes</th>
                  </tr>
                </thead>
                <tbody>
                  {legend.map((r, i) => (
                    <tr key={i} className="border-t align-top">
                      <td className="p-1.5"><Input aria-label={`Subject ${i + 1} name`} value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                      <td className="p-1.5"><Input aria-label={`Subject ${i + 1} code`} value={r.code ?? ""} onChange={(e) => set(i, { code: e.target.value.toUpperCase() || null })} className="uppercase" /></td>
                      <td className="p-1.5"><Input aria-label={`Subject ${i + 1} faculty`} list="routine-faculty" value={r.faculty ?? ""} onChange={(e) => set(i, { faculty: e.target.value || null })} /></td>
                      <td className="p-1.5"><Input aria-label={`Subject ${i + 1} practical faculty`} list="routine-faculty" value={r.practical ?? ""} onChange={(e) => set(i, { practical: e.target.value || null })} /></td>
                      <td className="p-1.5 pt-3.5 text-right tabular-nums text-muted-foreground">{uses(i)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="routine-faculty">
                {routine.teachers.map((t) => <option key={t.id} value={t.name} />)}
              </datalist>
              <p className="mt-2 px-2 text-xs text-muted-foreground">Pick a registered faculty member from the suggestions to link their account (students then see their live status), or keep the name as printed.</p>
            </div>
            <div className="flex justify-end border-t px-5 py-3">
              <Button onClick={() => toReview(routineDrafts(base, legend))}>
                Continue to timetable <ArrowRight aria-hidden />
              </Button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {warningBox(entries.length === 0 ? ["Nothing could be read. Add the classes manually in the grid.", ...warnings] : warnings)}
      {routine && legend.length > 0 && (
        <Button
          variant="outline"
          onClick={() => {
            if (window.confirm("Go back to Subjects & faculty? Changes you made in the grid will be replaced.")) setStage("subjects");
          }}
        >
          <ArrowLeft aria-hidden /> Step 1 · Subjects &amp; faculty
        </Button>
      )}
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {original}
        <div className="min-w-0">
          <TimetableEditor key={editorKey} periods={periods} sections={sections} initialEntries={entries} otherEntries={otherEntries} hasDraft={false} source="UPLOAD" filePath={filePath} routine={routine} />
        </div>
      </div>
    </div>
  );
}
