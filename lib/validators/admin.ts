import { z } from "zod";

export const announcementSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(150),
  body: z.string().trim().min(3, "Write the notice").max(5000),
  audience: z.enum(["STUDENTS", "TEACHERS", "BOTH"]),
  semesters: z.array(z.number().int().min(1).max(8)).default([]),
  sections: z.array(z.string().regex(/^[1-8][A-Z]$/)).default([]),
  pinned: z.boolean().default(false),
  expiresAt: z.iso.date().optional().or(z.literal("")),
});

export const periodSlotsSchema = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(30),
      start: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
      end: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
      isBreak: z.boolean(),
    }),
  )
  .min(1, "Add at least one period")
  .max(16)
  .superRefine((slots, ctx) => {
    slots.forEach((s, i) => {
      if (s.end <= s.start) ctx.addIssue({ code: "custom", path: [i, "end"], message: `${s.label}: end must be after start` });
      if (i > 0 && s.start < slots[i - 1].end) ctx.addIssue({ code: "custom", path: [i, "start"], message: `${s.label} overlaps the previous slot` });
    });
  });

export const settingsSchema = z
  .object({
    workingDays: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one working day"),
    saturdayRule: z.enum(["ALL_WORKING", "SECOND_FOURTH_OFF", "ALL_OFF"]),
    collegeStart: z.string().regex(/^\d{2}:\d{2}$/),
    collegeEnd: z.string().regex(/^\d{2}:\d{2}$/),
    academicYear: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use the format 2026-27"),
    semesterType: z.enum(["ODD", "EVEN"]),
    slaWorkingDays: z.number().int().min(1).max(30),
  })
  .refine((v) => v.collegeEnd > v.collegeStart, { path: ["collegeEnd"], message: "Closing time must be after opening time" });

export const holidaySchema = z.object({
  date: z.iso.date("Choose a date"),
  name: z.string().trim().min(2, "Enter a name").max(80),
});

export const departmentSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, "2–6 capital letters, e.g. CSE"),
  name: z.string().trim().min(2).max(120),
});

export const clusterSchema = z.object({ departmentId: z.uuid(), name: z.string().trim().min(1).max(60) });

export const sectionSchema = z.object({
  departmentId: z.uuid(),
  clusterId: z.uuid(),
  name: z.string().trim().toUpperCase().regex(/^[1-8][A-Z]$/, "Format: semester + letter, e.g. 5A"),
  homeRoom: z.string().trim().max(30).optional(),
});

export const studentCsvRow = z.object({
  full_name: z.string().trim().min(3).max(80),
  email: z.email().trim().toLowerCase(),
  usn: z.string().trim().toUpperCase().regex(/^[1-4][A-Z]{2}[0-9]{2}[A-Z]{2,3}[0-9]{3}$/, "Invalid USN"),
  department_code: z.string().trim().toUpperCase(),
  section: z.string().trim().toUpperCase().regex(/^[1-8][A-Z]$/, "Invalid section"),
});

export const teacherCsvRow = z.object({
  full_name: z.string().trim().min(3).max(80),
  email: z.email().trim().toLowerCase(),
  employee_id: z.string().trim().toUpperCase().min(3).max(20),
  department_code: z.string().trim().toUpperCase(),
  cluster_name: z.string().trim().optional().default(""),
  designation: z.string().trim().default("Assistant Professor"),
  cabin_location: z.string().trim().optional().default(""),
});
