import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/format";

const TONES = {
  navy: "bg-primary/10 text-primary",
  green: "bg-status-available-bg text-status-available",
  blue: "bg-status-in-class-bg text-status-in-class",
  amber: "bg-status-busy-bg text-status-busy",
  red: "bg-status-leave-bg text-status-leave",
  slate: "bg-muted text-muted-foreground",
  maroon: "bg-maroon/10 text-maroon",
} as const;
export type Tone = keyof typeof TONES;

/** KPI tile: coloured icon, big number, label, optional hint/link. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "navy",
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  href?: string;
}) {
  const body = (
    <div className="flex items-start gap-4 rounded-xl border bg-card p-5 shadow-card transition-colors hover:border-primary/30">
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Card with an icon + title header, optional action link and body. */
export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
  description,
}: {
  title: string;
  icon?: LucideIcon;
  action?: { label: string; href: string } | React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  description?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card shadow-card", className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-5 py-3.5">
        <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-2.5">
          {Icon && <Icon aria-hidden className="size-5 shrink-0 text-primary" />}
          <div className="min-w-0">
            <h2 className="text-base leading-snug font-semibold break-words">{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action &&
          (typeof action === "object" && action !== null && "href" in (action as object) ? (
            <Link
              href={(action as { href: string }).href}
              className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary hover:underline"
            >
              {(action as { label: string }).label}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <div className="shrink-0">{action as React.ReactNode}</div>
          ))}
      </header>
      <div className={cn("flex-1 p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Navy dashboard banner with greeting and optional right-side slot. */
export function HeroBanner({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="bg-pattern relative mb-6 overflow-hidden rounded-2xl bg-primary px-6 py-6 text-primary-foreground shadow-card sm:px-8 sm:py-7 dark:bg-card dark:text-card-foreground">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-maroon" aria-hidden />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="text-sm font-medium opacity-85">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-base opacity-90">{subtitle}</p>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    </section>
  );
}

export function PersonAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <Avatar className={cn("size-11", className)}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className="bg-primary/10 font-semibold text-primary">{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** Small key/value row list. */
export function InfoList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y rounded-lg border">
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-2.5 text-sm">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className="min-w-0 font-medium break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
