import { z } from "zod";

export const CLASS_TYPES = ["THEORY", "LAB", "TUTORIAL", "MENTORING", "MEETING"] as const;

export const entrySchema = z
  .object({
    id: z.string().min(1),
    dayOfWeek: z.number().int().min(1).max(6),
    startPeriod: z.number().int().min(1).max(12),
    endPeriod: z.number().int().min(1).max(12),
    subjectCode: z.string().trim().max(15).nullable(),
    subjectName: z.string().trim().min(1, "Subject name is required").max(120),
    sectionId: z.uuid().nullable(),
    room: z.string().trim().max(40).nullable(),
    type: z.enum(CLASS_TYPES),
    lowConfidence: z.boolean().optional(),
    // Section routines: the teacher of the class (account match optional, name as written)
    teacherId: z.uuid().nullable().optional(),
    teacherName: z.string().trim().max(120).nullable().optional(),
  })
  .refine((e) => e.endPeriod >= e.startPeriod, { message: "End period must be after start period", path: ["endPeriod"] });

export const saveDraftSchema = z.object({
  entries: z.array(entrySchema).max(80, "Too many entries"),
  source: z.enum(["MANUAL", "UPLOAD"]).default("MANUAL"),
  filePath: z.string().max(300).nullable().optional(),
});

export type EntryInput = z.infer<typeof entrySchema>;

/** A Cluster Head's routine draft for one section. */
export const saveRoutineSchema = z.object({
  sectionId: z.uuid(),
  entries: z.array(entrySchema).max(80, "Too many entries"),
  filePath: z.string().max(300).nullable().optional(),
});

export const unavailabilitySchema = z
  .object({
    type: z.enum(["FULL_DAY", "HALF_DAY", "DATE_RANGE", "CUSTOM_PERIODS"]),
    date: z.iso.date("Choose a date"),
    endDate: z.iso.date().optional().or(z.literal("")),
    half: z.enum(["FN", "AN"]).optional(),
    periods: z.array(z.number().int().min(1).max(12)).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.type !== "DATE_RANGE" || (v.endDate && v.endDate >= v.date), { path: ["endDate"], message: "End date must be on or after the start date" })
  .refine((v) => v.type !== "HALF_DAY" || v.half, { path: ["half"], message: "Choose forenoon or afternoon" })
  .refine((v) => v.type !== "CUSTOM_PERIODS" || (v.periods && v.periods.length > 0), { path: ["periods"], message: "Choose at least one period" });

export type UnavailabilityInput = z.infer<typeof unavailabilitySchema>;

export const preferenceSchema = z.object({
  acceptingMeetings: z.boolean(),
  note: z.string().trim().max(120).optional(),
});

export const overrideSchema = z.object({
  date: z.iso.date(),
  period: z.number().int().min(1).max(12),
  kind: z.enum(["CANCELLED", "EXTRA", "RESCHEDULED"]),
  subjectName: z.string().trim().max(120).optional(),
  sectionId: z.uuid().optional().or(z.literal("")),
  room: z.string().trim().max(40).optional(),
  details: z.string().trim().max(300).optional(),
});
