-- =====================================================================
-- Section routines: the Cluster Head uploads each section's class routine
-- (PDF/photo → reviewed grid). Students see their section's published routine.
-- =====================================================================

create table public.section_timetables (
  id           uuid primary key default gen_random_uuid(),
  section_id   uuid not null references public.sections (id) on delete cascade,
  status       public.timetable_status not null default 'DRAFT',
  file_path    text,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- One live routine and at most one draft per section
create unique index section_timetables_one_published on public.section_timetables (section_id) where status = 'PUBLISHED';
create unique index section_timetables_one_draft on public.section_timetables (section_id) where status = 'DRAFT';
create index section_timetables_section_idx on public.section_timetables (section_id, status);
create trigger section_timetables_set_updated_at before update on public.section_timetables
  for each row execute function public.set_updated_at();

create table public.section_timetable_entries (
  id             uuid primary key default gen_random_uuid(),
  timetable_id   uuid not null references public.section_timetables (id) on delete cascade,
  day_of_week    smallint not null check (day_of_week between 1 and 6),
  start_period   smallint not null check (start_period between 1 and 12),
  end_period     smallint not null check (end_period between 1 and 12),
  subject_code   text,
  subject_name   text not null check (char_length(subject_name) between 1 and 120),
  teacher_id     uuid references public.profiles (id) on delete set null, -- matched faculty account (optional)
  teacher_name   text check (char_length(teacher_name) <= 120),            -- as written on the routine
  room           text,
  type           public.class_type not null default 'THEORY',
  low_confidence boolean not null default false,
  created_at     timestamptz not null default now(),
  check (end_period >= start_period),
  -- A section cannot have two classes in the same period.
  exclude using gist (
    timetable_id with =,
    day_of_week with =,
    int4range(start_period, end_period, '[]') with &&
  )
);
create index section_timetable_entries_tt_idx on public.section_timetable_entries (timetable_id);
create index section_timetable_entries_teacher_idx on public.section_timetable_entries (teacher_id);

-- Who may manage a section's routine: the Cluster Head of its cluster, the HOD of its department, the admin.
create or replace function public.can_manage_section(p_section uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.sections s
      join public.clusters c on c.id = s.cluster_id
     where s.id = p_section
       and (c.cluster_head_id = auth.uid() or s.department_id in (select public.my_hod_department_ids()))
  )
$$;
revoke all on function public.can_manage_section(uuid) from public;
grant execute on function public.can_manage_section(uuid) to authenticated;

alter table public.section_timetables enable row level security;
alter table public.section_timetable_entries enable row level security;

-- Published routines are visible inside the college; drafts only to those who manage the section.
create policy "section_timetables: published or manager" on public.section_timetables for select to authenticated
  using (status = 'PUBLISHED' or public.can_manage_section(section_id));
create policy "section_timetable_entries: via visible routine" on public.section_timetable_entries for select to authenticated
  using (exists (
    select 1 from public.section_timetables t
     where t.id = timetable_id and (t.status = 'PUBLISHED' or public.can_manage_section(t.section_id))
  ));

revoke all on public.section_timetables, public.section_timetable_entries from anon, authenticated;
grant select on public.section_timetables, public.section_timetable_entries to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.section_timetables;
  end if;
end;
$$;
