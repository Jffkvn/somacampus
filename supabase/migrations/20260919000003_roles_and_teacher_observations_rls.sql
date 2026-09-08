-- 20260919000003_roles_and_teacher_observations_rls.sql
-- 1. Grant authenticated SELECT on system lookup table 'roles'
-- 2. Update teacher_observations INSERT and UPDATE policies to check user_roles.role_id directly

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_read ON public.roles;
CREATE POLICY roles_read ON public.roles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS teacher_observations_auth_insert ON public.teacher_observations;
CREATE POLICY teacher_observations_auth_insert ON public.teacher_observations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id
    ) OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  );

DROP POLICY IF EXISTS teacher_observations_auth_update ON public.teacher_observations;
CREATE POLICY teacher_observations_auth_update ON public.teacher_observations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id
    ) OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id
    ) OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  );
