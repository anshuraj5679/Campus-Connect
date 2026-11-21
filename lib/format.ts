import { formatDistanceStrict } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "Asia/Kolkata";
const TITLES = /^(dr|prof|mr|mrs|ms|miss|shri|smt)\.?$/i;

/** "Dr. Rajesh Sharma" → "RS", "Aarav Kumar" → "AK". Honorifics are ignored. */
export function getInitials(fullName: string): string {
  const words = fullName
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !TITLES.test(w));
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function firstName(fullName: string): string {
  return fullName.replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, "").split(" ")[0];
}

/** "11:05 AM" */
export function fmtTime(d: Date | string): string {
  return formatInTimeZone(new Date(d), TZ, "h:mm a");
}

/** "21 Nov 2026" */
export function fmtDate(d: Date | string): string {
  return formatInTimeZone(new Date(d), TZ, "d MMM yyyy");
}

/** "21 Nov, 11:05 AM" */
export function fmtDateTime(d: Date | string): string {
  return formatInTimeZone(new Date(d), TZ, "d MMM, h:mm a");
}

/** "in 25 min" / "2 h ago" relative to `now`. */
export function relativeTime(d: Date | string, now: Date): string {
  const date = new Date(d);
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 45_000) return "just now";
  let text: string;
  if (abs < 3_600_000) text = `${Math.round(abs / 60_000)} min`;
  else if (abs < 86_400_000) text = `${Math.round(abs / 3_600_000)} h`;
  else text = formatDistanceStrict(date, now);
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

/** "3 days", "5 h", "40 min" */
export function durationLabel(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
  const days = Math.round(ms / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
