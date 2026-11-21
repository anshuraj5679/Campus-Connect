-- =====================================================================
-- Fix: keep profiles.role in sync when app_metadata.role is set AFTER the
-- auth user row is inserted (GoTrue's admin createUser inserts first and
-- writes app_metadata in a follow-up update, so the insert trigger only
-- ever saw the default role).
--
-- Direction of truth:
--   * admin actions change profiles.role  → profiles_sync_role → app_metadata
--   * server-side sign-up / seed set app_metadata.role → this trigger → profiles
-- The loop terminates because each side only writes when the value differs.
-- app_metadata can only be written with the service role, never by users.
-- =====================================================================

create or replace function public.sync_role_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  begin
    v_role := (new.raw_app_meta_data ->> 'role')::public.user_role;
  exception when invalid_text_representation then
    return new;
  end;
  if v_role is not null then
    update public.profiles set role = v_role where id = new.id and role is distinct from v_role;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_role_changed
  after update of raw_app_meta_data on auth.users
  for each row
  when ((new.raw_app_meta_data ->> 'role') is distinct from (old.raw_app_meta_data ->> 'role'))
  execute function public.sync_role_from_auth();

-- The sync-to-auth trigger should only write when the value actually differs.
create or replace function public.sync_role_to_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role::text)
   where id = new.id
     and (raw_app_meta_data ->> 'role') is distinct from new.role::text;
  return new;
end;
$$;

-- One-time repair of rows created before this fix.
update public.profiles p
   set role = (u.raw_app_meta_data ->> 'role')::public.user_role
  from auth.users u
 where u.id = p.id
   and (u.raw_app_meta_data ->> 'role') in ('STUDENT', 'TEACHER', 'CLUSTER_HEAD', 'HOD', 'ADMIN')
   and p.role::text is distinct from (u.raw_app_meta_data ->> 'role');
