-- =====================================================================
-- Student privacy
-- =====================================================================
-- Student contact details (name, email, phone) are no longer visible to every member
-- of staff: only the student, their class teacher, Cluster Head, HOD and the admin.
-- Staff profiles stay readable by everyone (teacher directory).
drop policy "profiles: read own, staff, or as staff" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or role <> 'STUDENT'
    or (select public.is_admin())
    or id in (
      select sp.user_id from public.student_profiles sp
       where sp.section_id in (select public.my_class_section_ids())
          or sp.cluster_id in (select public.my_cluster_head_ids())
          or sp.department_id in (select public.my_hod_department_ids())
    )
  );
