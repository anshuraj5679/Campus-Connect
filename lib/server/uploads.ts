import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Verify a file the browser uploaded directly to Storage: it must sit in the
 * user's own folder and its REAL size / content type (read from Storage) must
 * satisfy the rules. Returns the verified metadata.
 */
export async function verifyUploadedFile(
  bucket: string,
  userId: string,
  path: string,
  rules: { maxBytes: number; mime?: readonly string[] | null },
): Promise<{ ok: true; size: number; contentType: string } | { ok: false; error: string }> {
  if (typeof path !== "string" || !path.startsWith(`${userId}/`) || path.includes("..")) {
    return { ok: false, error: "Invalid file reference." };
  }
  const { data, error } = await createAdminClient().storage.from(bucket).info(path);
  if (error || !data) return { ok: false, error: "The uploaded file was not found. Please upload it again." };
  const size = data.size ?? 0;
  const contentType = data.contentType ?? "application/octet-stream";
  if (size <= 0 || size > rules.maxBytes) return { ok: false, error: "The uploaded file is too large." };
  if (rules.mime && !rules.mime.includes(contentType)) return { ok: false, error: "This file type is not allowed." };
  return { ok: true, size, contentType };
}
