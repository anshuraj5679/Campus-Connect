import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  scope: "COLLEGE" | "DEPARTMENT" | "CLUSTER";
  scopeLabel: string;
  audience: "STUDENTS" | "TEACHERS" | "BOTH";
  semesters: number[];
  sections: string[];
  pinned: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  authorName: string;
  authorId: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
  unread: boolean;
};

/**
 * Notices visible to the signed-in user (RLS: public.is_announcement_target),
 * pinned first, with unread state from announcement_reads.
 */
export async function listAnnouncements(opts: { authoredBy?: string; limit?: number } = {}): Promise<AnnouncementItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("announcements")
    .select("*, departments(code), clusters(name)")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.authoredBy) q = q.eq("author_id", opts.authoredBy);
  const { data } = await q;
  const rows = data ?? [];
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: reads }, { data: authors }] = await Promise.all([
    rows.length ? supabase.from("announcement_reads").select("announcement_id").eq("user_id", auth.user?.id ?? "").in("announcement_id", rows.map((r) => r.id)) : Promise.resolve({ data: [] as any[] }),
    rows.length ? createAdminClient().from("profiles").select("id, full_name").in("id", rows.map((r) => r.author_id).filter(Boolean)) : Promise.resolve({ data: [] as any[] }),
  ]);
  const readSet = new Set((reads ?? []).map((r) => r.announcement_id));
  const authorName = new Map((authors ?? []).map((a) => [a.id, a.full_name]));

  const withFiles = rows.filter((r) => r.attachment_path);
  const signed = withFiles.length
    ? ((await createAdminClient().storage.from("announcements").createSignedUrls(withFiles.map((r) => r.attachment_path!), 60 * 30)).data ?? [])
    : [];
  const urlOf = new Map(withFiles.map((r, i) => [r.id, signed[i]?.signedUrl ?? null]));

  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    scope: r.scope,
    scopeLabel: r.scope === "COLLEGE" ? "College" : r.scope === "DEPARTMENT" ? `${r.departments?.code ?? ""} Department` : `${r.departments?.code ?? ""} ${r.clusters?.name ?? "Cluster"}`.trim(),
    audience: r.audience,
    semesters: r.semesters ?? [],
    sections: r.sections ?? [],
    pinned: r.pinned,
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
    createdAt: new Date(r.created_at),
    authorName: authorName.get(r.author_id) ?? "College Office",
    authorId: r.author_id,
    attachmentName: r.attachment_name,
    attachmentUrl: urlOf.get(r.id) ?? null,
    unread: !readSet.has(r.id) && r.author_id !== auth.user?.id,
  }));
}
