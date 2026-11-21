-- =====================================================================
-- Phases 6–7 · Notifications, announcements, audit log, storage, realtime
-- =====================================================================

create type public.announcement_scope as enum ('COLLEGE', 'DEPARTMENT', 'CLUSTER');
create type public.announcement_audience as enum ('STUDENTS', 'TEACHERS', 'BOTH');

-- ---------- notifications ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null check (char_length(title) <= 160),
  body       text check (char_length(body) <= 600),
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy "notifications: own read" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications: own mark read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------- announcements ----------
create table public.announcements (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid references public.profiles (id) on delete set null,
  scope           public.announcement_scope not null,
  department_id   uuid references public.departments (id) on delete cascade,
  cluster_id      uuid references public.clusters (id) on delete cascade,
  audience        public.announcement_audience not null default 'BOTH',
  semesters       smallint[] not null default '{}',
  sections        text[] not null default '{}',
  title           text not null check (char_length(title) between 3 and 150),
  body            text not null check (char_length(body) between 3 and 5000),
  attachment_path text,
  attachment_name text,
  pinned          boolean not null default false,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (scope <> 'DEPARTMENT' or department_id is not null),
  check (scope <> 'CLUSTER' or cluster_id is not null)
);
create index announcements_created_idx on public.announcements (created_at desc);
create index announcements_scope_idx on public.announcements (scope, department_id, cluster_id);
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- Targeting rule (mirrors lib/services/announcements.ts)
create or replace function public.is_announcement_target(a public.announcements)
returns boolean language sql stable security definer set search_path = ''
as $$
  select
    (a.expires_at is null or a.expires_at > now())
    and (
      a.audience = 'BOTH'
      or (a.audience = 'STUDENTS' and public.auth_role() = 'STUDENT')
      or (a.audience = 'TEACHERS' and public.auth_role() in ('TEACHER', 'CLUSTER_HEAD', 'HOD'))
    )
    and (
      a.scope = 'COLLEGE'
      or (a.scope = 'DEPARTMENT' and a.department_id = public.my_department_id())
      or (a.scope = 'CLUSTER' and a.cluster_id = public.my_cluster_id())
    )
    and (
      public.auth_role() <> 'STUDENT'
      or (
        (cardinality(a.semesters) = 0 or public.my_semester() = any (a.semesters))
        and (cardinality(a.sections) = 0 or public.my_section() = any (a.sections))
      )
    )
$$;
revoke all on function public.is_announcement_target(public.announcements) from public;
grant execute on function public.is_announcement_target(public.announcements) to authenticated;

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

create policy "announcements: author, admin or target" on public.announcements for select to authenticated
  using (
    author_id = (select auth.uid())
    or (select public.is_admin())
    or public.is_announcement_target(announcements)
  );
create policy "announcement_reads: own" on public.announcement_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy "announcement_reads: own insert" on public.announcement_reads for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on public.announcements, public.announcement_reads from anon, authenticated;
grant select on public.announcements to authenticated;
grant select, insert on public.announcement_reads to authenticated;

-- ---------- audit_logs ----------
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
alter table public.audit_logs enable row level security;
create policy "audit_logs: admin read" on public.audit_logs for select to authenticated
  using ((select public.is_admin()));
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

-- ---------- Storage buckets ----------
-- Private buckets are accessed only through short-lived signed URLs that the
-- server issues after an access check (no storage policies for clients).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('timetables', 'timetables', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf']),
  ('complaint-evidence', 'complaint-evidence', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf']),
  ('announcements', 'announcements', false, 10485760, null),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------- Realtime ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.notifications,
      public.teacher_unavailability,
      public.availability_preferences,
      public.timetable_versions,
      public.schedule_overrides,
      public.complaint_messages,
      public.complaints;
  end if;
end;
$$;
