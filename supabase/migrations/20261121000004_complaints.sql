-- =====================================================================
-- Phase 5 · Complaint management with routing, SLA and escalation
-- =====================================================================

create type public.complaint_category as enum
  ('TEACHER', 'ACADEMIC', 'DEPARTMENT', 'FACILITY', 'COLLEGE', 'CONFIDENTIAL');
create type public.complaint_status as enum
  ('SUBMITTED', 'ASSIGNED', 'UNDER_REVIEW', 'ACTION_TAKEN', 'RESOLVED', 'CLOSED', 'ESCALATED', 'REOPENED');
create type public.handler_level as enum ('CLUSTER_HEAD', 'HOD', 'ADMIN');
-- PUBLIC: student + handlers · INTERNAL: handlers only · TEACHER: handlers + the requested teacher
create type public.message_audience as enum ('PUBLIC', 'INTERNAL', 'TEACHER');

-- ---------- Sequential complaint codes: CMP-2026-0001 ----------
create table public.complaint_counters (
  year       int primary key,
  last_value int not null default 0
);
alter table public.complaint_counters enable row level security; -- no policies: server only

create or replace function public.next_complaint_code(p_year int)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v int;
begin
  insert into public.complaint_counters (year, last_value) values (p_year, 1)
  on conflict (year) do update set last_value = public.complaint_counters.last_value + 1
  returning last_value into v;
  return format('CMP-%s-%s', p_year, lpad(v::text, 4, '0'));
end;
$$;
revoke all on function public.next_complaint_code(int) from public, anon, authenticated;

-- ---------- complaints ----------
create table public.complaints (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null unique,
  student_id              uuid not null references public.profiles (id) on delete restrict,
  category                public.complaint_category not null,
  subject                 text not null check (char_length(subject) between 5 and 150),
  description             text not null check (char_length(description) between 20 and 5000),
  teacher_id              uuid references public.profiles (id) on delete set null,
  department_id           uuid references public.departments (id) on delete set null,
  cluster_id              uuid references public.clusters (id) on delete set null,
  is_confidential         boolean not null default false,
  status                  public.complaint_status not null default 'SUBMITTED',
  current_assignee_id     uuid references public.profiles (id) on delete set null,
  assignee_level          public.handler_level,
  response_requested_from uuid references public.profiles (id) on delete set null,
  response_requested_at   timestamptz,
  response_received_at    timestamptz,
  sla_due_at              timestamptz,
  first_action_at         timestamptz,
  escalated_at            timestamptz,
  resolved_at             timestamptz,
  resolution_remarks      text,
  reopen_count            smallint not null default 0 check (reopen_count <= 1),
  reopen_reason           text,
  closed_at               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index complaints_status_assignee_idx on public.complaints (status, current_assignee_id);
create index complaints_student_idx on public.complaints (student_id, created_at desc);
create index complaints_teacher_idx on public.complaints (teacher_id);
create index complaints_department_idx on public.complaints (department_id);
create index complaints_cluster_idx on public.complaints (cluster_id);
create index complaints_response_idx on public.complaints (response_requested_from);
create index complaints_sla_idx on public.complaints (sla_due_at)
  where status in ('ASSIGNED', 'REOPENED');
create trigger complaints_set_updated_at before update on public.complaints
  for each row execute function public.set_updated_at();

-- ---------- messages / attachments / history ----------
create table public.complaint_messages (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  sender_id    uuid references public.profiles (id) on delete set null,
  body         text not null check (char_length(body) between 1 and 4000),
  audience     public.message_audience not null default 'PUBLIC',
  created_at   timestamptz not null default now()
);
create index complaint_messages_complaint_idx on public.complaint_messages (complaint_id, created_at);

create table public.complaint_attachments (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  path         text not null unique,
  file_name    text not null,
  mime         text not null check (mime in ('image/jpeg', 'image/png', 'application/pdf')),
  size         int not null check (size > 0 and size <= 5242880),
  created_at   timestamptz not null default now()
);
create index complaint_attachments_complaint_idx on public.complaint_attachments (complaint_id);

create table public.complaint_history (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null, -- null = system (SLA job)
  action       text not null,
  from_status  public.complaint_status,
  to_status    public.complaint_status,
  remark       text,
  meta         jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index complaint_history_complaint_idx on public.complaint_history (complaint_id, created_at);

-- The timeline is append-only for everyone, including the service role.
create or replace function public.forbid_history_change()
returns trigger language plpgsql
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old; -- allow cascade from a deleted complaint (seed reset)
  end if;
  raise exception 'complaint_history is immutable';
end;
$$;
create trigger complaint_history_immutable before update or delete on public.complaint_history
  for each row execute function public.forbid_history_change();

-- ---------- Visibility (mirrors lib/services/complaintAccess.ts) ----------
create or replace function public.can_view_complaint(c public.complaints)
returns boolean language sql stable security definer set search_path = ''
as $$
  select
    c.student_id = auth.uid()
    or public.is_admin()
    or c.current_assignee_id = auth.uid()
    or (
      c.teacher_id is distinct from auth.uid() -- the accused never sees it through scope
      and (
        c.department_id in (select public.my_hod_department_ids())
        or (not c.is_confidential and c.cluster_id in (select public.my_cluster_head_ids()))
      )
    )
    or (not c.is_confidential and c.response_requested_from = auth.uid())
$$;
revoke all on function public.can_view_complaint(public.complaints) from public;
grant execute on function public.can_view_complaint(public.complaints) to authenticated;

alter table public.complaints enable row level security;
alter table public.complaint_messages enable row level security;
alter table public.complaint_attachments enable row level security;
alter table public.complaint_history enable row level security;

create policy "complaints: scoped read" on public.complaints for select to authenticated
  using (public.can_view_complaint(complaints));

-- Students see PUBLIC messages; a requested teacher sees TEACHER messages;
-- handlers (staff who can view the complaint) see everything.
create policy "complaint_messages: by audience" on public.complaint_messages for select to authenticated
  using (exists (
    select 1 from public.complaints c
     where c.id = complaint_id
       and public.can_view_complaint(c)
       and (
         (c.student_id = (select auth.uid()) and audience = 'PUBLIC')
         or (c.student_id <> (select auth.uid())
             and c.response_requested_from = (select auth.uid())
             and c.current_assignee_id is distinct from (select auth.uid())
             and audience = 'TEACHER')
         or (c.student_id <> (select auth.uid())
             and c.response_requested_from is distinct from (select auth.uid())
             and (select public.auth_role()) in ('CLUSTER_HEAD', 'HOD', 'ADMIN'))
         or (c.current_assignee_id = (select auth.uid()))
       )
  ));

-- Evidence: the student and handlers, never the requested teacher.
create policy "complaint_attachments: student and handlers" on public.complaint_attachments for select to authenticated
  using (exists (
    select 1 from public.complaints c
     where c.id = complaint_id
       and public.can_view_complaint(c)
       and (c.student_id = (select auth.uid())
            or (c.response_requested_from is distinct from (select auth.uid())
                and (select public.auth_role()) in ('CLUSTER_HEAD', 'HOD', 'ADMIN')))
  ));

create policy "complaint_history: viewers of the complaint" on public.complaint_history for select to authenticated
  using (exists (select 1 from public.complaints c where c.id = complaint_id and public.can_view_complaint(c)));

revoke all on public.complaints, public.complaint_messages, public.complaint_attachments,
  public.complaint_history, public.complaint_counters from anon, authenticated;
grant select on public.complaints, public.complaint_messages, public.complaint_attachments,
  public.complaint_history to authenticated;
