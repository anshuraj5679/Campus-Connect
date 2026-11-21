"use client";

import { createClient } from "@/lib/supabase/client";
import { createUploadUrls, type UploadKind } from "@/lib/actions/uploads";

/**
 * Upload files straight from the browser to Supabase Storage using one-time
 * signed URLs from the server (keeps large files off Vercel's 4.5 MB limit).
 * Returns the stored paths in the same order as `files`.
 */
export async function uploadDirect(kind: UploadKind, files: File[]): Promise<{ paths: string[] } | { error: string }> {
  if (files.length === 0) return { paths: [] };
  const signed = await createUploadUrls(
    kind,
    files.map((f) => ({ name: f.name, type: f.type || "application/octet-stream", size: f.size })),
  );
  if (!signed.ok) return { error: signed.error };
  const supabase = createClient();
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const s = signed.data![i];
    const { error } = await supabase.storage.from(s.bucket).uploadToSignedUrl(s.path, s.token, files[i], { contentType: files[i].type || undefined });
    if (error) return { error: `${files[i].name}: ${error.message}` };
    paths.push(s.path);
  }
  return { paths };
}
