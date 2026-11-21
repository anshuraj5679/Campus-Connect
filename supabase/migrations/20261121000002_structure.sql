-- =====================================================================
-- Phase 2 · College structure
-- Department → Clusters → Sections; one HOD per department, one Cluster
-- Head per cluster; students belong to a section, teachers to a cluster.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------- departments ----------
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z]{2,6}$'),
  name       text not null check (char_length(name) between 2 and 120),
  hod_id     uuid unique references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger departments_set_updated_at before update on public.departments
  for each row execute function public.set_updated_at();

-- ---------- clusters ----------
create table public.clusters (
  id              uuid primary key default gen_random_uuid(),
  department_id   uuid not null references public.departments (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  cluster_head_id uuid unique references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (department_id, name),
  unique (id, department_id) -- target for composite FKs (cluster must belong to department)
);
create index clusters_department_idx on public.clusters (department_id);
create trigger clusters_set_updated_at before update on public.clusters
  for each row execute function public.set_updated_at();

-- ---------- sections (e.g. CSE 5A) ----------
create table public.sections (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  cluster_id    uuid not null,
  semester      smallint not null check (semester between 1 and 8),
  name          text not null check (name ~ '^[1-8][A-Z]$'),
  home_room     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (department_id, name),
  check (left(name, 1)::smallint = semester),
  foreign key (cluster_id, department_id) references public.clusters (id, department_id) on delete restrict
);
create index sections_cluster_idx on public.sections (cluster_id);
create index sections_department_idx on public.sections (department_id);
create trigger sections_set_updated_at before update on public.sections
  for each row execute function public.set_updated_at();

-- ---------- student_profiles ----------
create table public.student_profiles (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  usn           text not null unique check (usn ~ '^[1-4][A-Z]{2}[0-9]{2}[A-Z]{2,3}[0-9]{3}$'),
  section_id    uuid not null references public.sections (id) on delete restrict,
  -- Denormalised from the section by trigger (fast filters, announcements targeting)
  department_id uuid not null references public.departments (id),
  cluster_id    uuid not null references public.clusters (id),
  semester      smallint not null,
  section       text not null,
  batch_year    smallint not null check (batch_year between 2000 and 2100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index student_profiles_section_idx on public.student_profiles (section_id);
create index student_profiles_cluster_idx on public.student_profiles (cluster_id);
create index student_profiles_department_idx on public.student_profiles (department_id);
create trigger student_profiles_set_updated_at before update on public.student_profiles
  for each row execute function public.set_updated_at();

create or replace function public.sync_student_section()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s record;
begin
  select department_id, cluster_id, semester, name into s
    from public.sections where id = new.section_id;
  if not found then
    raise exception 'Section % does not exist', new.section_id;
  end if;
  new.department_id := s.department_id;
  new.cluster_id    := s.cluster_id;
  new.semester      := s.semester;
  new.section       := s.name;
  return new;
end;
$$;
create trigger student_profiles_sync_section
  before insert or update of section_id on public.student_profiles
  for each row execute function public.sync_student_section();

-- If a section moves to another cluster, its students move with it.
create or replace function public.propagate_section_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.student_profiles
     set cluster_id = new.cluster_id, semester = new.semester, section = new.name
   where section_id = new.id;
  return new;
end;
$$;
create trigger sections_propagate after update of cluster_id, semester, name on public.sections
  for each row execute function public.propagate_section_change();

-- ---------- teacher_profiles ----------
create table public.teacher_profiles (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  employee_id    text not null unique check (char_length(employee_id) between 2 and 20),
  designation    text not null default 'Assistant Professor',
  department_id  uuid not null references public.departments (id) on delete restrict,
  cluster_id     uuid,
  cabin_location text,
  subjects       text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (cluster_id, department_id) references public.clusters (id, department_id) on delete set null (cluster_id)
);
create index teacher_profiles_department_idx on public.teacher_profiles (department_id);
create index teacher_profiles_cluster_idx on public.teacher_profiles (cluster_id);
create trigger teacher_profiles_set_updated_at before update on public.teacher_profiles
  for each row execute function public.set_updated_at();

-- ---------- RLS helper functions (SECURITY DEFINER avoids policy recursion) ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'ADMIN' from public.profiles where id = auth.uid() and is_active), false) $$;

create or replace function public.my_hod_department_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select id from public.departments where hod_id = auth.uid() $$;

create or replace function public.my_cluster_head_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select id from public.clusters where cluster_head_id = auth.uid() $$;

-- Department / cluster / semester / section of the signed-in student or teacher
create or replace function public.my_department_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select department_id from public.student_profiles where user_id = auth.uid()),
    (select department_id from public.teacher_profiles where user_id = auth.uid())
  )
$$;

create or replace function public.my_cluster_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select cluster_id from public.student_profiles where user_id = auth.uid()),
    (select cluster_id from public.teacher_profiles where user_id = auth.uid())
  )
$$;

create or replace function public.my_semester()
returns smallint language sql stable security definer set search_path = ''
as $$ select semester from public.student_profiles where user_id = auth.uid() $$;

create or replace function public.my_section()
returns text language sql stable security definer set search_path = ''
as $$ select section from public.student_profiles where user_id = auth.uid() $$;

revoke all on function public.is_admin(), public.my_hod_department_ids(), public.my_cluster_head_ids(),
  public.my_department_id(), public.my_cluster_id(), public.my_semester(), public.my_section() from public;
grant execute on function public.is_admin(), public.my_hod_department_ids(), public.my_cluster_head_ids(),
  public.my_department_id(), public.my_cluster_id(), public.my_semester(), public.my_section() to authenticated;

-- ---------- RLS ----------
alter table public.departments enable row level security;
alter table public.clusters enable row level security;
alter table public.sections enable row level security;
alter table public.student_profiles enable row level security;
alter table public.teacher_profiles enable row level security;

-- College structure is visible to every signed-in user. All writes go through
-- admin server actions (service role) after a server-side role check.
create policy "departments: read" on public.departments for select to authenticated using (true);
create policy "clusters: read" on public.clusters for select to authenticated using (true);
create policy "sections: read" on public.sections for select to authenticated using (true);

-- Teacher directory is visible to every signed-in user.
create policy "teacher_profiles: read" on public.teacher_profiles for select to authenticated using (true);

-- Student academic records: the student, their Cluster Head, their HOD, the admin.
create policy "student_profiles: read scoped" on public.student_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or cluster_id in (select public.my_cluster_head_ids())
    or department_id in (select public.my_hod_department_ids())
  );

revoke insert, update, delete on public.departments, public.clusters, public.sections,
  public.student_profiles, public.teacher_profiles from anon, authenticated;
revoke select on public.departments, public.clusters, public.sections,
  public.student_profiles, public.teacher_profiles from anon;
grant select on public.departments, public.clusters, public.sections,
  public.student_profiles, public.teacher_profiles to authenticated;
