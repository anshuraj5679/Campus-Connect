-- =====================================================================
-- Class teachers and account approval
--  * Every section has (at most) one class teacher, assigned by the Cluster Head;
--    a teacher is class teacher of at most one section.
--  * New students are approved by their section's class teacher (the Cluster Head
--    when the section has none); new cluster teachers by their Cluster Head.
--  * Class teachers may read the academic records of their own section only.
-- =====================================================================

alter table public.sections
  add column class_teacher_id uuid references public.profiles (id) on delete set null;
create unique index sections_one_section_per_class_teacher on public.sections (class_teacher_id) where class_teacher_id is not null;

alter table public.profiles
  add column verified_by uuid references public.profiles (id) on delete set null,
  add column verified_at timestamptz,
  add column rejected_at timestamptz;

-- Sections the signed-in user is class teacher of
create or replace function public.my_class_section_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select id from public.sections where class_teacher_id = (select auth.uid()) $$;
revoke all on function public.my_class_section_ids() from public;
grant execute on function public.my_class_section_ids() to authenticated;

drop policy "student_profiles: read scoped" on public.student_profiles;
create policy "student_profiles: read scoped" on public.student_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or section_id in (select public.my_class_section_ids())
    or cluster_id in (select public.my_cluster_head_ids())
    or department_id in (select public.my_hod_department_ids())
  );

