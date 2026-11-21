import { z } from "zod";

/** Shared by the login form (client) and the sign-in server action. */
export const loginSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72)
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

const base = {
  fullName: z.string().trim().min(3, "Enter your full name").max(80),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password,
  confirmPassword: z.string(),
};

/** VTU USN, e.g. 1BY24CS045 */
export const USN_PATTERN = /^[1-4][A-Z]{2}[0-9]{2}[A-Z]{2,3}[0-9]{3}$/;

/** Cluster names: letters, digits, spaces, dot, hyphen, ampersand (no SQL-pattern characters). */
export const CLUSTER_NAME = /^[A-Za-z0-9][A-Za-z0-9 .&-]*$/;

/** "5j", "5 J", "5-J" → "5J" (semester digit + section letter). */
export function normalizeSection(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** "3", "c3", "cluster 3", "Cluster-3" → "Cluster 3". Other names are kept, tidied. */
export function normalizeCluster(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  const n = t.match(/^(?:cluster|cl|c)?\s*[-#]?\s*(\d{1,2})$/i);
  if (n) return `Cluster ${Number(n[1])}`;
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

const sectionField = z
  .string()
  .transform(normalizeSection)
  .pipe(z.string().regex(/^[1-8][A-Z]$/, "Type your section as semester + letter, e.g. 5J"));

const clusterField = z
  .string()
  .transform(normalizeCluster)
  .pipe(
    z
      .string()
      .min(1, "Type your cluster, e.g. 3 or Cluster 3")
      .max(40, "Cluster name is too long")
      .regex(CLUSTER_NAME, "Use only letters, numbers and spaces, e.g. Cluster 3"),
  );

export const studentSignupSchema = z
  .object({
    ...base,
    role: z.literal("STUDENT"),
    usn: z.string().trim().toUpperCase().regex(USN_PATTERN, "Enter a valid USN, e.g. 1BY24CS045"),
    departmentId: z.uuid("Select your department"),
    section: sectionField,
    cluster: clusterField,
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const DESIGNATIONS = ["Professor", "Associate Professor", "Assistant Professor", "Professor & Head"] as const;

/**
 * Faculty sign-up: Teacher, Cluster Head (one per cluster) or HOD (one per
 * department). Whether the chosen position is still vacant is checked by the
 * server atomically when the account is created.
 */
export const staffSignupSchema = z
  .object({
    ...base,
    role: z.enum(["TEACHER", "CLUSTER_HEAD", "HOD"]),
    employeeId: z.string().trim().toUpperCase().min(3, "Enter your employee ID").max(20),
    designation: z.enum(DESIGNATIONS),
    departmentId: z.uuid("Select your department"),
    // Typed by the user; created automatically if it does not exist yet. Not used for HOD.
    cluster: z.string().optional().default(""),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" })
  .transform((v) => ({ ...v, cluster: v.cluster ? normalizeCluster(v.cluster) : "" }))
  .refine((v) => v.role === "HOD" || (v.cluster.length > 0 && v.cluster.length <= 40 && CLUSTER_NAME.test(v.cluster)), {
    path: ["cluster"],
    message: "Type your cluster, e.g. 3 or Cluster 3 (letters, numbers and spaces only)",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" })
  .refine((v) => v.password !== v.currentPassword, { path: ["password"], message: "Choose a password different from the current one" });

export type StudentSignupInput = z.infer<typeof studentSignupSchema>;
export type StaffSignupInput = z.infer<typeof staffSignupSchema>;

/**
 * Only allow same-site relative redirects after login ("/student/complaints"),
 * never "//evil.com" or "https://…" (open-redirect protection).
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
