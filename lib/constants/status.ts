/**
 * Availability statuses returned by the availability engine (Phase 4).
 * Order matches the engine's priority order (spec §3.3).
 */
export const AVAILABILITY_STATUSES = [
  "ON_LEAVE",
  "HOLIDAY",
  "OFF_HOURS",
  "IN_CLASS",
  "AVAILABLE",
  "BUSY",
  "NOT_PUBLISHED",
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Available",
  IN_CLASS: "In Class",
  BUSY: "Busy",
  ON_LEAVE: "On Leave",
  HOLIDAY: "Holiday",
  OFF_HOURS: "Off Campus Hours",
  NOT_PUBLISHED: "Timetable Not Published",
};
