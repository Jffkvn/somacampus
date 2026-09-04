-- ==============================================================================
-- SOMACAMPUS MIGRATION: PARENT GUARDIAN ACCESS
-- Migration ID: 20260913000000
-- ==============================================================================
-- student_guardians and school_calendars have RLS enabled with zero policies
-- (deny-by-default), so guardian-linked reads and school calendar reads are
-- denied for every authenticated user. This opens scoped SELECT only:
-- guardians see their own links, staff see links for their school's students,
-- and calendars stay strictly school-scoped (never USING(true)).
-- Idempotent: DROP POLICY IF EXISTS before each CREATE; CREATE OR REPLACE
-- for the helper function. No writes granted.

-- ------------------------------------------------------------------------------
-- student_guardians: staff of the student's school can read
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS student_guardians_staff_read ON public.student_guardians;
CREATE POLICY student_guardians_staff_read ON public.student_guardians
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_enrolments se
      JOIN public.user_roles ur ON ur.school_id = se.school_id
      WHERE se.student_id = student_guardians.student_id
        AND ur.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- student_guardians: guardians can read their own guardian links
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS student_guardians_self_read ON public.student_guardians;
CREATE POLICY student_guardians_self_read ON public.student_guardians
  FOR SELECT TO authenticated
  USING (
    guardian_person_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- school_calendars: school-scoped read for staff and guardians of enrolled children
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS school_calendars_auth_read ON public.school_calendars;
CREATE POLICY school_calendars_auth_read ON public.school_calendars
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_calendars.school_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.student_enrolments se
      JOIN public.student_guardians sg ON sg.student_id = se.student_id
      JOIN public.people p ON p.id = sg.guardian_person_id
      WHERE p.auth_user_id = auth.uid()
        AND se.school_id = school_calendars.school_id
    )
  );

-- ------------------------------------------------------------------------------
-- Helper: student IDs of the caller's children with active enrolments in a school
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_guardian_student_ids_for_school(p_school_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT se.student_id
  FROM public.student_guardians sg
  JOIN public.people p ON p.id = sg.guardian_person_id
  JOIN public.student_enrolments se ON se.student_id = sg.student_id
  WHERE p.auth_user_id = auth.uid()
    AND se.school_id = p_school_id
    AND se.status = 'active';
$$;
