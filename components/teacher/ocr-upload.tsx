"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, LoaderCircle, Minus, Plus, RotateCcw, ScanText, TriangleExclamationPoint as TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TimetableEditor } from "./timetable-editor";
import { uploadTimetableFile } from "@/lib/actions/timetable";
import { parseTimetableWords, type OcrWord } from "@/lib/services/ocrParser";
import type { PeriodSlot } from "@/lib/services/periods";
import type { DraftEntry, OtherEntry } from "@/lib/services/timetableValidation";

type Section = { id: string; name: string; semester: number; homeRoom: string | null; departmentCode: string };
type Stage = "pick" | "working" | "review";

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

/** Resize to the OCR width and convert to greyscale (better contrast for Tesseract). */
async function prepareForOcr(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = OCR_WIDTH / img.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "grayscale(1) contrast(1.15)";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function wordsOf(data: { blocks?: { paragraphs: { lines: { words: OcrWord[] }[] }[] }[] | null }): OcrWord[] {
  const words: OcrWord[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox });
  return words;
}

export function OcrUpload({
  periods,
  sections,
  otherEntries,
  departmentCode,
  knownCodes,
}: {
  periods: PeriodSlot[];
  sections: Section[];
  otherEntries: OtherEntry[];
  departmentCode: string;
  /** Subject codes already used in the college, for correcting OCR misreads. */
  knownCodes: string[];
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) return toast.error("Upload a JPG, PNG or PDF file.");
    if (file.size > 10 * 1024 * 1024) return toast.error("The file must be 10 MB or smaller.");
    setStage("working");
    try {
      setStatusText("Uploading original…");
      setProgress(5);
      const fd = new FormData();
      fd.append("file", file);
      const up = await uploadTimetableFile(fd);
      if (!up.ok) throw new Error(up.error);
      setFilePath(up.data!.path);

      setStatusText(file.type === "application/pdf" ? "Rendering PDF…" : "Preparing image…");
      setProgress(12);
      const src = file.type === "application/pdf" ? await pdfToImage(file) : URL.createObjectURL(file);
      setImage(src);

      setStatusText("Reading text (OCR)…");
      const ocrSrc = await prepareForOcr(src);
      const { createWorker, PSM } = await import("tesseract.js");
      let pass = 0;
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(15 + Math.round((pass * 40 + m.progress * 40)));
        },
      });
      // Pass 1: sparse-text mode finds isolated words in table cells.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      let parsed = parseTimetableWords(wordsOf((await worker.recognize(ocrSrc, {}, { blocks: true })).data), periods, { knownCodes });
      // Pass 2 (fallback): automatic page layout, keep whichever read more of the table.
      if (parsed.daysFound < 3 || parsed.entries.length === 0) {
        pass = 1;
        setStatusText("Trying another reading mode…");
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
        const second = parseTimetableWords(wordsOf((await worker.recognize(ocrSrc, {}, { blocks: true })).data), periods, { knownCodes });
        if (second.entries.length > parsed.entries.length) parsed = second;
      }
      await worker.terminate();

      setStatusText("Building draft timetable…");
      const deptSections = sections.filter((s) => s.departmentCode === departmentCode);
      const drafts: DraftEntry[] = parsed.entries.map((e) => {
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
      });
      setEntries(drafts);
      setWarnings(parsed.warnings);
      setProgress(100);
      setStage("review");
      const flagged = drafts.filter((d) => d.lowConfidence).length;
      if (drafts.length)
        toast.success(
          flagged
            ? `Read ${drafts.length} classes. ${flagged} cell${flagged > 1 ? "s" : ""} need checking (yellow) before publishing.`
            : `Read ${drafts.length} classes. Compare them with the original, then publish.`,
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
              <p className="text-lg font-semibold">Upload your timetable</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">A clear, straight photo or PDF works best. We read it with OCR and build a draft. You review every cell, and nothing goes live until you publish.</p>
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

  return (
    <div className="space-y-4">
      {(warnings.length > 0 || entries.length === 0) && (
        <div role="status" className="flex gap-3 rounded-xl border border-status-busy/40 bg-status-busy-bg p-4 text-sm text-status-busy-fg">
          <TriangleAlert aria-hidden className="size-5 shrink-0 text-status-busy" />
          <ul className="space-y-0.5">
            {(warnings.length ? warnings : ["Nothing could be read. Add the classes manually in the grid."]).map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
        <div className="min-w-0">
          <TimetableEditor periods={periods} sections={sections} initialEntries={entries} otherEntries={otherEntries} hasDraft={false} source="UPLOAD" filePath={filePath} />
        </div>
      </div>
    </div>
  );
}
