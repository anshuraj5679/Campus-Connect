import { z } from "zod";

export const CATEGORIES = ["TEACHER", "ACADEMIC", "DEPARTMENT", "FACILITY", "COLLEGE", "CONFIDENTIAL"] as const;

export const complaintSchema = z
  .object({
    category: z.enum(CATEGORIES, "Choose a category"),
    teacherId: z.uuid().optional().or(z.literal("")),
    subject: z.string().trim().min(5, "Subject must be at least 5 characters").max(150),
    description: z.string().trim().min(20, "Please describe the issue in at least 20 characters").max(5000),
    isConfidential: z.boolean().default(false),
  })
  .refine((v) => v.category !== "TEACHER" || !!v.teacherId, { path: ["teacherId"], message: "Choose the teacher this complaint is about" });

export type ComplaintInput = z.infer<typeof complaintSchema>;

export const messageSchema = z.object({
  complaintId: z.uuid(),
  body: z.string().trim().min(1, "Write a message").max(4000),
  audience: z.enum(["PUBLIC", "INTERNAL", "TEACHER"]).default("PUBLIC"),
});

export const complaintActionSchema = z.object({
  complaintId: z.uuid(),
  action: z.enum(["START_REVIEW", "MARK_ACTION_TAKEN", "RESOLVE", "ESCALATE", "REQUEST_RESPONSE", "REOPEN", "CLOSE"]),
  remark: z.string().trim().max(2000).optional(),
});
