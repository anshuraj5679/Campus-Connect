import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isRole, type Role } from "./roles";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  avatarUrl: string | null;
  isVerified: boolean;
  isActive: boolean;
};

/** The authenticated Supabase user (validated with the Auth server), once per request. */
export const getAuthUser = cache(async () => {
  // Always opt the page into per-request rendering, even before Supabase is
  // configured, so an auth redirect can never be baked in at build time.
  await connection();
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

/** The signed-in user's profile from `public.profiles` (the source of truth for role). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, avatar_url, is_verified, is_active")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile || !isRole(profile.role)) return null;

  return {
    id: profile.id,
    email: profile.email ?? authUser.email ?? "",
    fullName: profile.full_name,
    role: profile.role,
    avatarUrl: profile.avatar_url,
    isVerified: profile.is_verified,
    isActive: profile.is_active,
  };
});

/** Any signed-in, active user. Use at the top of protected layouts / actions. */
export async function requireUser(): Promise<CurrentUser> {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/login");

  const user = await getCurrentUser();
  if (!user) redirect("/forbidden?reason=no-profile");
  if (!user.isActive) redirect("/forbidden?reason=inactive");
  return user;
}

/** Server-side role gate. Hiding a button is not security; this is. */
export async function requireRole(roles: readonly Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/forbidden");
  return user;
}
