-- =====================================================================
-- Phase 1 · Foundation: roles + profiles
-- Phase 2 adds departments, clusters, student/teacher profiles etc.
-- =====================================================================

-- ---------- Enums ----------
create type public.user_role as enum ('STUDENT', 'TEACHER', 'CLUSTER_HEAD', 'HOD', 'ADMIN');

-- ---------- Shared trigger: maintain updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 1 and 120),
  email       text not null,
  phone       text,
  avatar_url  text,
  role        public.user_role not null default 'STUDENT',
  is_verified boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Helper: current user's role (used by RLS policies) ----------
-- SECURITY DEFINER so policies on `profiles` can call it without recursion.
create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

revoke all on function public.auth_role() from public;
grant execute on function public.auth_role() to authenticated;

-- ---------- New auth user → profile row ----------
-- The role comes from app_metadata, which only the service role can set.
-- (user_metadata is user-editable, so it is used only for the display name.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  begin
    v_role := coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'STUDENT');
  exception when invalid_text_representation then
    v_role := 'STUDENT';
  end;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- profiles.role → JWT claim (app_metadata.role) ----------
-- Keeps `profiles.role` as the single source of truth while letting the
-- middleware read the role from the verified access token without a DB query.
create or replace function public.sync_role_to_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', new.role::text)
   where id = new.id;
  return new;
end;
$$;

create trigger profiles_sync_role
  after insert or update of role on public.profiles
  for each row execute function public.sync_role_to_auth();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;

-- Everyone signed in can see staff profiles (students need teacher names);
-- staff can see all profiles; students can see only their own.
create policy "profiles: read own, staff, or as staff"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or role <> 'STUDENT'
    or (select public.auth_role()) in ('TEACHER', 'CLUSTER_HEAD', 'HOD', 'ADMIN')
  );

-- Users may edit only their own contact details. Column grants below stop
-- anyone from changing role / is_verified / is_active through the API;
-- those changes go through admin server actions using the service role.
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
