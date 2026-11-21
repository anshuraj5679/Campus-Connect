-- =====================================================================
-- Phases 3–4 · Calendar, period-based timetables, availability inputs
-- =====================================================================

create type public.timetable_status as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');
create type public.timetable_source as enum ('MANUAL', 'UPLOAD');
create type public.class_type as enum ('THEORY', 'LAB', 'TUTORIAL', 'MENTORING', 'MEETING');
create type public.unavailability_type as enum ('FULL_DAY', 'HALF_DAY', 'DATE_RANGE', 'CUSTOM_PERIODS');
create type public.override_kind as enum ('CANCELLED', 'EXTRA', 'RESCHEDULED');

-- ---------- college_settings (single row) ----------
create table public.college_settings (
  id             smallint primary key default 1 check (id = 1),
  working_days   smallint[] not null default '{1,2,3,4,5,6}', -- ISO: 1 = Monday … 6 = Saturday
  saturday_rule  text not null default 'SECOND_FOURTH_OFF'
                 check (saturday_rule in ('ALL_WORKING', 'SECOND_FOURTH_OFF', 'ALL_OFF')),
  college_start  time not null default '09:00',
  college_end    time not null default '16:30',
  academic_year  text not null default '2026-27',
  semester_type  text not null default 'ODD' check (semester_type in ('ODD', 'EVEN')),
  sla_working_days smallint not null default 5 check (sla_working_days between 1 and 30),
  updated_at     timestamptz not null default now(),
  check (college_end > college_start)
);
create trigger college_settings_set_updated_at before update on public.college_settings
  for each row execute function public.set_updated_at();
insert into public.college_settings (id) values (1);

-- ---------- period_slots ----------
create table public.period_slots (
  id         uuid primary key default gen_random_uuid(),
  label      text not null check (char_length(label) between 1 and 30),
  period_no  smallint unique check (period_no between 1 and 12), -- null for breaks
  start_time time not null,
  end_time   time not null,
  is_break   boolean not null default false,
  sort_order smallint not null unique,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check ((is_break and period_no is null) or (not is_break and period_no is not null))
);

-- ---------- holidays ----------
create table public.holidays (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique,
  name       text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now()
);

-- ---------- timetable_versions ----------
create table public.timetable_versions (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles (id) on delete cascade,
  status       public.timetable_status not null default 'DRAFT',
  source       public.timetable_source not null default 'MANUAL',
  file_path    text,
  ocr_meta     jsonb,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Exactly one active published version and at most one draft per teacher.
create unique index timetable_one_published on public.timetable_versions (teacher_id) where status = 'PUBLISHED';
create unique index timetable_one_draft on public.timetable_versions (teacher_id) where status = 'DRAFT';
create index timetable_versions_teacher_idx on public.timetable_versions (teacher_id, status);
create trigger timetable_versions_set_updated_at before update on public.timetable_versions
  for each row execute function public.set_updated_at();

-- ---------- timetable_entries ----------
create table public.timetable_entries (
  id             uuid primary key default gen_random_uuid(),
  version_id     uuid not null references public.timetable_versions (id) on delete cascade,
  teacher_id     uuid not null references public.profiles (id) on delete cascade, -- copied from version
  day_of_week    smallint not null check (day_of_week between 1 and 6),
  start_period   smallint not null check (start_period between 1 and 12),
  end_period     smallint not null check (end_period between 1 and 12),
  subject_code   text,
  subject_name   text not null check (char_length(subject_name) between 1 and 120),
  section_id     uuid references public.sections (id) on delete set null,
  semester       smallint,
  section        text,
  room           text,
  type           public.class_type not null default 'THEORY',
  low_confidence boolean not null default false, -- set by OCR import, cleared on review
  created_at     timestamptz not null default now(),
  check (end_period >= start_period),
  -- A teacher can never have two entries in the same slot of the same version.
  exclude using gist (
    version_id with =,
    day_of_week with =,
    int4range(start_period, end_period, '[]') with &&
  )
);
create index timetable_entries_version_idx on public.timetable_entries (version_id);
create index timetable_entries_teacher_day_idx on public.timetable_entries (teacher_id, day_of_week);
create index timetable_entries_section_idx on public.timetable_entries (section_id, day_of_week);

create or replace function public.timetable_entry_set_teacher()
returns trigger language plpgsql set search_path = ''
as $$
begin
  select teacher_id into new.teacher_id from public.timetable_versions where id = new.version_id;
  return new;
end;
$$;
create trigger timetable_entries_set_teacher before insert or update of version_id on public.timetable_entries
  for each row execute function public.timetable_entry_set_teacher();

-- ---------- teacher_unavailability ----------
create table public.teacher_unavailability (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references public.profiles (id) on delete cascade,
  type           public.unavailability_type not null,
  half           text check (half in ('FN', 'AN')),
  periods        smallint[],
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  reason_private text check (char_length(reason_private) <= 500),
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  check (end_at > start_at),
  check ((type = 'HALF_DAY') = (half is not null)),
  check ((type = 'CUSTOM_PERIODS') = (periods is not null))
);
create index teacher_unavailability_teacher_idx on public.teacher_unavailability (teacher_id, start_at, end_at);

-- ---------- availability_preferences ----------
create table public.availability_preferences (
  teacher_id         uuid primary key references public.profiles (id) on delete cascade,
  accepting_meetings boolean not null default true,
  note               text check (char_length(note) <= 120),
  updated_at         timestamptz not null default now()
);
create trigger availability_preferences_set_updated_at before update on public.availability_preferences
  for each row execute function public.set_updated_at();

-- ---------- schedule_overrides ----------
create table public.schedule_overrides (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles (id) on delete cascade,
  date         date not null,
  period       smallint not null check (period between 1 and 12),
  kind         public.override_kind not null,
  subject_name text,
  section_id   uuid references public.sections (id) on delete set null,
  room         text,
  details      text check (char_length(details) <= 300),
  created_at   timestamptz not null default now(),
  unique (teacher_id, date, period)
);
create index schedule_overrides_teacher_date_idx on public.schedule_overrides (teacher_id, date);

-- ---------- RLS ----------
alter table public.college_settings enable row level security;
alter table public.period_slots enable row level security;
alter table public.holidays enable row level security;
alter table public.timetable_versions enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.teacher_unavailability enable row level security;
alter table public.availability_preferences enable row level security;
alter table public.schedule_overrides enable row level security;

create policy "college_settings: read" on public.college_settings for select to authenticated using (true);
create policy "period_slots: read" on public.period_slots for select to authenticated using (true);
create policy "holidays: read" on public.holidays for select to authenticated using (true);

-- Published timetables are public inside the college; drafts only to their owner.
create policy "timetable_versions: published or own" on public.timetable_versions for select to authenticated
  using (status = 'PUBLISHED' or teacher_id = (select auth.uid()) or (select public.is_admin()));
create policy "timetable_entries: via visible version" on public.timetable_entries for select to authenticated
  using (exists (
    select 1 from public.timetable_versions v
     where v.id = version_id
       and (v.status = 'PUBLISHED' or v.teacher_id = (select auth.uid()) or (select public.is_admin()))
  ));

-- Everyone may see THAT a teacher is unavailable (for live status); the
-- reason column is not granted, so students can never read it.
create policy "teacher_unavailability: read" on public.teacher_unavailability for select to authenticated using (true);
create policy "availability_preferences: read" on public.availability_preferences for select to authenticated using (true);
create policy "availability_preferences: own upsert" on public.availability_preferences for insert to authenticated
  with check (teacher_id = (select auth.uid()));
create policy "availability_preferences: own update" on public.availability_preferences for update to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy "schedule_overrides: read" on public.schedule_overrides for select to authenticated using (true);

revoke all on public.college_settings, public.period_slots, public.holidays, public.timetable_versions,
  public.timetable_entries, public.teacher_unavailability, public.availability_preferences,
  public.schedule_overrides from anon, authenticated;
grant select on public.college_settings, public.period_slots, public.holidays, public.timetable_versions,
  public.timetable_entries, public.availability_preferences, public.schedule_overrides to authenticated;
grant insert (teacher_id, accepting_meetings, note), update (accepting_meetings, note)
  on public.availability_preferences to authenticated;
-- Column-level grant: everything except reason_private.
grant select (id, teacher_id, type, half, periods, start_at, end_at, cancelled_at, created_at)
  on public.teacher_unavailability to authenticated;

-- Reason is readable only by the teacher, their Cluster Head, their HOD and the admin.
create or replace function public.get_unavailability_reason(p_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select u.reason_private
    from public.teacher_unavailability u
    left join public.teacher_profiles t on t.user_id = u.teacher_id
   where u.id = p_id
     and (
       u.teacher_id = auth.uid()
       or public.is_admin()
       or t.cluster_id in (select public.my_cluster_head_ids())
       or t.department_id in (select public.my_hod_department_ids())
     )
$$;
revoke all on function public.get_unavailability_reason(uuid) from public;
grant execute on function public.get_unavailability_reason(uuid) to authenticated;
