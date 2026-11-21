"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { CircleCheckBig, CircleX, Download, FileUp, LoaderCircle, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { studentCsvRow, teacherCsvRow } from "@/lib/validators/admin";
import { importUsers, type ImportRowResult } from "@/lib/actions/admin";

type Kind = "students" | "teachers";
const TEMPLATES: Record<Kind, { headers: string[]; sample: string[] }> = {
  students: { headers: ["full_name", "email", "usn", "department_code", "section"], sample: ["Rhea Menon", "rhea.menon@bmsit.in", "1BY24CS101", "CSE", "5A"] },
  teachers: { headers: ["full_name", "email", "employee_id", "department_code", "cluster_name", "designation", "cabin_location"], sample: ["Dr. Vinay Kumar", "vinay.kumar@bmsit.in", "BMSIT-CSE-150", "CSE", "Cluster 2", "Associate Professor", "CSE Block, Room 326"] },
};

export function CsvImport() {
  const [kind, setKind] = useState<Kind>("students");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<{ results: ImportRowResult[]; password: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const schema = kind === "students" ? studentCsvRow : teacherCsvRow;
  const checked = rows.map((r) => {
    const p = schema.safeParse(r);
    return { row: r, ok: p.success, error: p.success ? null : p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  });
  const valid = checked.filter((c) => c.ok);

  const template = () => {
    const t = TEMPLATES[kind];
    const blob = new Blob([`${t.headers.join(",")}\n${t.sample.map((s) => (s.includes(",") ? `"${s}"` : s)).join(",")}\n`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `campusconnect-${kind}-template.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(["students", "teachers"] as Kind[]).map((k) => (
          <Button key={k} variant={kind === k ? "default" : "outline"} onClick={() => { setKind(k); setRows([]); setResults(null); setFileName(null); }}>
            Import {k}
          </Button>
        ))}
        <Button variant="ghost" onClick={template} className="ml-auto"><Download aria-hidden /> Download template</Button>
      </div>
      <p className="text-sm text-muted-foreground">Columns: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{TEMPLATES[kind].headers.join(", ")}</code></p>

      <label htmlFor="csv" className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed bg-card p-8 text-center hover:border-primary/40">
        <FileUp aria-hidden className="size-8 text-muted-foreground" />
        <span className="mt-2 font-semibold">{fileName ?? "Choose a CSV file"}</span>
        <span className="text-sm text-muted-foreground">Rows are checked here first. Nothing is saved until you click Import.</span>
      </label>
      <input
        id="csv"
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setFileName(f.name);
          setResults(null);
          Papa.parse<Record<string, string>>(f, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
            complete: (res) => {
              if (res.data.length > 300) toast.warning("Only the first 300 rows will be imported.");
              setRows(res.data.slice(0, 300));
            },
            error: (err) => toast.error(err.message),
          });
          e.target.value = "";
        }}
      />

      {rows.length > 0 && !results && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm"><strong>{valid.length}</strong> valid · <strong className="text-destructive">{rows.length - valid.length}</strong> with errors</p>
            <Button
              disabled={pending || valid.length === 0}
              onClick={() =>
                startTransition(async () => {
                  const r = await importUsers(kind, valid.map((v) => v.row));
                  if (r.ok) { setResults(r.data!); toast.success(r.message ?? "Imported"); } else toast.error(r.error);
                })
              }
            >
              {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Upload aria-hidden />} Import {valid.length} {kind}
            </Button>
          </div>
          <div className="max-h-[55vh] overflow-auto rounded-xl border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs font-semibold text-muted-foreground uppercase">
                <tr><th className="px-3 py-2">#</th>{TEMPLATES[kind].headers.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}<th className="px-3 py-2">Check</th></tr>
              </thead>
              <tbody className="divide-y">
                {checked.map((c, i) => (
                  <tr key={i} className={cn(!c.ok && "bg-destructive/5")}>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                    {TEMPLATES[kind].headers.map((h) => <td key={h} className="px-3 py-2">{c.row[h]}</td>)}
                    <td className="px-3 py-2">{c.ok ? <CircleCheckBig aria-label="Valid" className="size-4 text-status-available" /> : <span className="text-xs text-destructive">{c.error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="font-semibold">Import finished: {results.results.filter((r) => r.ok).length} created, {results.results.filter((r) => !r.ok).length} failed.</p>
          <p className="text-sm text-muted-foreground">New accounts can sign in with the default password <code className="rounded bg-muted px-1.5 py-0.5">{results.password}</code>. Ask users to change it.</p>
          <ul className="max-h-72 divide-y overflow-auto rounded-lg border text-sm">
            {results.results.map((r) => (
              <li key={r.row} className="flex items-center gap-2 px-3 py-2">
                {r.ok ? <CircleCheckBig aria-hidden className="size-4 text-status-available" /> : <CircleX aria-hidden className="size-4 text-destructive" />}
                <span className="tabular-nums text-muted-foreground">#{r.row}</span> {r.email} · <span className={r.ok ? "" : "text-destructive"}>{r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
