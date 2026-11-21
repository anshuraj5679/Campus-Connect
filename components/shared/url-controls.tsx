"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Update one or more URL search params (resets to page 1). Lists read params on the server. */
function useParamSetter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = (updates: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!keepPage) next.delete("page");
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { params, set, pending };
}

export function SearchBox({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { params, set, pending } = useParamSetter();
  const [value, setValue] = useState(params.get(param) ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get(param) ?? "") !== value) set({ [param]: value.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden className={cn("absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground", pending && "animate-pulse")} />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 pr-10 pl-10 text-base"
      />
      {value && (
        <button type="button" onClick={() => setValue("")} aria-label="Clear search" className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({ param, label, options, allLabel = "All" }: { param: string; label: string; options: { value: string; label: string }[]; allLabel?: string }) {
  const { params, set } = useParamSetter();
  return (
    <div className="min-w-40">
      <label className="sr-only" htmlFor={`f-${param}`}>{label}</label>
      <NativeSelect id={`f-${param}`} value={params.get(param) ?? ""} onChange={(e) => set({ [param]: e.target.value || null })}>
        <option value="">{`${label}: ${allLabel}`}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function FilterChips({ param, options }: { param: string; options: { value: string; label: string; count?: number }[] }) {
  const { params, set } = useParamSetter();
  const current = params.get(param) ?? "";
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {[{ value: "", label: "All" }, ...options].map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => set({ [param]: o.value || null })}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
            )}
          >
            {o.label}
            {"count" in o && o.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white/20" : "bg-muted")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ToggleParam({ param, label }: { param: string; label: string }) {
  const { params, set } = useParamSetter();
  const on = params.get(param) === "1";
  return (
    <div className="flex h-10 items-center gap-2 rounded-lg border bg-card px-3">
      <Switch id={`t-${param}`} checked={on} onCheckedChange={(v) => set({ [param]: v ? "1" : null })} />
      <Label htmlFor={`t-${param}`} className="cursor-pointer text-sm">{label}</Label>
    </div>
  );
}

export function Pagination({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  const { set } = useParamSetter();
  if (pageCount <= 1) return <p className="text-sm text-muted-foreground">{total} result{total === 1 ? "" : "s"}</p>;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        Page {page} of {pageCount} · {total} results
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) }, true)}>
          <ChevronLeft aria-hidden /> Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => set({ page: String(page + 1) }, true)}>
          Next <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
