"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { rolesForPath, type Role } from "@/lib/auth/roles";
import { EVIDENCE_MIME, MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES } from "@/lib/services/complaintWorkflow";
import { fail, guard, ok, parse, type ActionResult } from "@/lib/server/action";

/**
 * Direct-to-Storage uploads.
 *
 * Vercel limits a request body to 4.5 MB, so files never pass through our
 * server. The server checks role, file count, type and size, then hands out
 * one-time signed upload URLs under the user's own folder. The browser uploads
 * straight to Supabase Storage, and the follow-up action (create complaint,
 * notice, timetable draft) only sends the path, which is verified again
 * (owner folder + real size/type from Storage).
 */

export type UploadKind = "evidence" | "timetable" | "routine" | "announcement";

const RULES: Record<UploadKind, { bucket: string; roles: () => readonly Role[]; maxFiles: number; maxBytes: number; mime: readonly string[] | null }> = {
  evidence: { bucket: "complaint-evidence", roles: () => ["STUDENT"], maxFiles: MAX_EVIDENCE_FILES, maxBytes: MAX_EVIDENCE_BYTES, mime: EVIDENCE_MIME },
  timetable: { bucket: "timetables", roles: () => rolesForPath("/teacher")!, maxFiles: 1, maxBytes: 10 * 1024 * 1024, mime: ["image/jpeg", "image/png", "application/pdf"] },
  // Section routine PDFs/photos uploaded by the Cluster Head (or HOD / admin)
  routine: { bucket: "timetables", roles: () => ["CLUSTER_HEAD", "HOD", "ADMIN"], maxFiles: 1, maxBytes: 10 * 1024 * 1024, mime: ["image/jpeg", "image/png", "application/pdf"] },
  announcement: { bucket: "announcements", roles: () => ["CLUSTER_HEAD", "HOD", "ADMIN"], maxFiles: 1, maxBytes: 10 * 1024 * 1024, mime: null },
};

const fileMeta = z.object({ name: z.string().min(1).max(200), type: z.string().max(100), size: z.number().int().positive() });

export type SignedUpload = { path: string; token: string; bucket: string };

export async function createUploadUrls(kind: UploadKind, files: unknown): Promise<ActionResult<SignedUpload[]>> {
  return guard(async () => {
    const rule = RULES[kind];
    if (!rule) return fail("Unknown upload type.");
    const user = await requireRole(rule.roles());
    const p = parse(z.array(fileMeta).min(1).max(rule.maxFiles, `Attach at most ${rule.maxFiles} file(s).`), files);
    if ("error" in p) return fail(p.error);
    for (const f of p.data) {
      if (rule.mime && !rule.mime.includes(f.type)) return fail(`${f.name}: this file type is not allowed.`);
      if (f.size > rule.maxBytes) return fail(`${f.name} is larger than ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`);
    }
    const storage = createAdminClient().storage.from(rule.bucket);
    const out: SignedUpload[] = [];
    for (const f of p.data) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "file";
      const path = `${user.id}/${randomUUID()}-${safe}`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error || !data) return fail(error?.message ?? "Could not prepare the upload.");
      out.push({ path: data.path, token: data.token, bucket: rule.bucket });
    }
    return ok(out);
  });
}
