import {
  BookOpen,
  CalendarDays,
  CalendarOff,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AVAILABILITY_LABEL, type AvailabilityStatus } from "@/lib/constants/status";

/** Colour + icon + text for every status, so status is never conveyed by colour alone. */
const STYLES: Record<AvailabilityStatus, { icon: LucideIcon; className: string; iconClass: string }> = {
  AVAILABLE: {
    icon: CircleCheck,
    className: "bg-status-available-bg text-status-available-fg border-status-available/30",
    iconClass: "text-status-available",
  },
  IN_CLASS: {
    icon: BookOpen,
    className: "bg-status-in-class-bg text-status-in-class-fg border-status-in-class/30",
    iconClass: "text-status-in-class",
  },
  BUSY: {
    icon: CircleMinus,
    className: "bg-status-busy-bg text-status-busy-fg border-status-busy/30",
    iconClass: "text-status-busy",
  },
  ON_LEAVE: {
    icon: CalendarOff,
    className: "bg-status-leave-bg text-status-leave-fg border-status-leave/30",
    iconClass: "text-status-leave",
  },
  HOLIDAY: {
    icon: CalendarDays,
    className: "bg-status-off-bg text-status-off-fg border-status-off/30",
    iconClass: "text-status-off",
  },
  OFF_HOURS: {
    icon: Moon,
    className: "bg-status-off-bg text-status-off-fg border-status-off/30",
    iconClass: "text-status-off",
  },
  NOT_PUBLISHED: {
    icon: CircleDashed,
    className:
      "bg-status-unpublished-bg text-status-unpublished-fg border-dashed border-status-unpublished",
    iconClass: "text-status-unpublished",
  },
};

const SIZES = {
  sm: "h-6 gap-1 px-2 text-xs [&_svg]:size-3.5",
  md: "h-7 gap-1.5 px-2.5 text-[13px] [&_svg]:size-4",
  lg: "h-9 gap-2 px-3.5 text-sm font-semibold [&_svg]:size-[18px]",
};

export function StatusChip({
  status,
  label,
  size = "md",
  className,
}: {
  status: AvailabilityStatus;
  /** Override the default label, e.g. "Busy · Not accepting meetings". */
  label?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const style = STYLES[status];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border font-medium whitespace-nowrap",
        SIZES[size],
        style.className,
        className,
      )}
    >
      <Icon aria-hidden className={style.iconClass} />
      {label ?? AVAILABILITY_LABEL[status]}
    </span>
  );
}
