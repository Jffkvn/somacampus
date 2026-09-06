-- ==============================================================================
-- SOMACAMPUS MIGRATION: ONLINE ACADEMIC SAFE ORIGIN
-- Migration ID: 20260915000002
-- ==============================================================================
-- Preserves the physical school invariant:
--   Physical assignment/observation: class_id required (online_session_id IS NULL)
--   Online assignment/observation: online_session_id required (class_id optional)
--
-- Safely alters assignments and teacher_observations:
--  1. class_id DROP NOT NULL
--  2. assignments_origin_check constraint
--  3. teacher_observations_origin_check constraint
--  4. Updates is_authorised_assignment_creator to recognize online session teachers
--  5. Updates observation visibility policy to recognize online enrolments for guardians
-- ==============================================================================

-- 1. Safely alter assignments
ALTER TABLE public.assignments ALTER COLUMN class_id DROP NOT NULL;

ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_origin_check;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_origin_check
  CHECK (
    (online_session_id IS NULL AND class_id IS NOT NULL)
    OR (online_session_id IS NOT NULL)
  );

-- 2. Safely alter teacher_observations
ALTER TABLE public.teacher_observations ALTER COLUMN class_id DROP NOT NULL;

ALTER TABLE public.teacher_observations DROP CONSTRAINT IF EXISTS teacher_observations_origin_check;
ALTER TABLE public.teacher_observations
  ADD CONSTRAINT teacher_observations_origin_check
  CHECK (
    (online_session_id IS NULL AND class_id IS NOT NULL)
    OR (online_session_id IS NOT NULL)
  );

-- 3. Authorization Function: update is_authorised_assignment_creator
CREATE OR REPLACE FUNCTION public.is_authorised_assignment_creator(
  p_school_id UUID,
  p_class_id UUID,
  p_stream_id UUID,
  p_subject_id UUID,
  p_assigned_date DATE,
  p_online_session_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_employee_id UUID;
  v_is_admin_or_principal BOOLEAN := false;
  v_is_session_teacher BOOLEAN := false;
  v_is_subject_teacher BOOLEAN := false;
  v_is_scheduled_teacher BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Check Admin / Principal role
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id
      AND ur.school_id = p_school_id
      AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
  ) INTO v_is_admin_or_principal;

  IF v_is_admin_or_principal THEN
    RETURN true;
  END IF;

  -- 2. Find Employee ID
  SELECT e.id INTO v_employee_id
  FROM public.employees e
  JOIN public.people p ON p.id = e.person_id
  WHERE p.auth_user_id = v_user_id
    AND e.school_id = p_school_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN false;
  END IF;

  -- 3. If this is an online session assignment, check online session / offering assignment
  IF p_online_session_id IS NOT NULL THEN
    -- Check if employee is the designated teacher of the session
    SELECT EXISTS (
      SELECT 1 FROM public.online_sessions os
      WHERE os.id = p_online_session_id
        AND os.school_id = p_school_id
        AND os.teacher_id = v_employee_id
    ) INTO v_is_session_teacher;

    IF v_is_session_teacher THEN
      RETURN true;
    END IF;

    -- Check if employee is assigned to the offering in online_teaching_assignments
    SELECT EXISTS (
      SELECT 1 FROM public.online_sessions os
      JOIN public.online_teaching_assignments ota ON ota.offering_id = os.offering_id
      JOIN public.online_teacher_engagements ote ON ote.id = ota.engagement_id
      WHERE os.id = p_online_session_id
        AND os.school_id = p_school_id
        AND ote.employee_id = v_employee_id
    ) INTO v_is_session_teacher;

    IF v_is_session_teacher THEN
      RETURN true;
    END IF;
  END IF;

  -- 4. Physical checks require class_id
  IF p_class_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check Subject Teacher assignment
  SELECT EXISTS (
    SELECT 1 FROM public.subject_teachers st
    WHERE st.school_id = p_school_id
      AND st.teacher_id = v_employee_id
      AND st.class_id = p_class_id
      AND (p_stream_id IS NULL OR st.stream_id IS NULL OR st.stream_id = p_stream_id)
      AND st.subject_id = p_subject_id
      AND st.effective_from <= p_assigned_date
      AND (st.effective_to IS NULL OR st.effective_to >= p_assigned_date)
  ) INTO v_is_subject_teacher;

  IF v_is_subject_teacher THEN
    RETURN true;
  END IF;

  -- Check active timetable schedule
  SELECT EXISTS (
    SELECT 1 FROM public.timetable_entries te
    JOIN public.timetables t ON t.id = te.timetable_id
    WHERE te.teacher_id = v_employee_id
      AND te.class_id = p_class_id
      AND (p_stream_id IS NULL OR te.stream_id IS NULL OR te.stream_id = p_stream_id)
      AND te.subject_id = p_subject_id
      AND t.school_id = p_school_id
      AND t.is_active = true
  ) INTO v_is_scheduled_teacher;

  RETURN v_is_scheduled_teacher;
END;
$$;

-- 4. Backwards-compatible 5-argument shim for is_authorised_assignment_creator
CREATE OR REPLACE FUNCTION public.is_authorised_assignment_creator(
  p_school_id UUID,
  p_class_id UUID,
  p_stream_id UUID,
  p_subject_id UUID,
  p_assigned_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_authorised_assignment_creator(p_school_id, p_class_id, p_stream_id, p_subject_id, p_assigned_date, NULL);
$$;

-- 5. Re-attach RLS policies on assignments and student_submissions passing online_session_id
DROP POLICY IF EXISTS assignments_auth_insert ON public.assignments;
CREATE POLICY assignments_auth_insert ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_authorised_assignment_creator(school_id, class_id, stream_id, subject_id, assigned_date, online_session_id)
  );

DROP POLICY IF EXISTS assignments_auth_update ON public.assignments;
CREATE POLICY assignments_auth_update ON public.assignments
  FOR UPDATE TO authenticated
  USING (
    public.is_authorised_assignment_creator(school_id, class_id, stream_id, subject_id, assigned_date, online_session_id)
  )
  WITH CHECK (
    public.is_authorised_assignment_creator(school_id, class_id, stream_id, subject_id, assigned_date, online_session_id)
  );

DROP POLICY IF EXISTS student_submissions_auth_insert ON public.student_submissions;
CREATE POLICY student_submissions_auth_insert ON public.student_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND public.is_authorised_assignment_creator(a.school_id, a.class_id, a.stream_id, a.subject_id, a.assigned_date, a.online_session_id)
    )
  );

DROP POLICY IF EXISTS student_submissions_auth_update ON public.student_submissions;
CREATE POLICY student_submissions_auth_update ON public.student_submissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND public.is_authorised_assignment_creator(a.school_id, a.class_id, a.stream_id, a.subject_id, a.assigned_date, a.online_session_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND public.is_authorised_assignment_creator(a.school_id, a.class_id, a.stream_id, a.subject_id, a.assigned_date, a.online_session_id)
    )
  );

-- 6. Update observation visibility to recognize online enrolments for guardians
DROP POLICY IF EXISTS teacher_observations_visibility_read ON public.teacher_observations;
CREATE POLICY teacher_observations_visibility_read ON public.teacher_observations
  FOR SELECT TO authenticated
  USING (
    -- author always sees own rows
    EXISTS (SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_observations.teacher_id)
    -- admin / principal see all
    OR EXISTS (SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal'))
    -- school staff see academic_team + parent_visible
    OR (teacher_observations.visibility IN ('academic_team', 'parent_visible') AND EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.school_id = teacher_observations.school_id
        AND e.status = 'active' AND e.is_teacher
    ))
    -- guardians see parent_visible rows for their children (physical OR online enrolled)
    OR (teacher_observations.visibility = 'parent_visible' AND EXISTS (
      SELECT 1 FROM public.student_guardians sg
      JOIN public.people p ON p.id = sg.guardian_person_id
      WHERE p.auth_user_id = auth.uid()
        AND sg.student_id = teacher_observations.student_id
        AND (
          EXISTS (
            SELECT 1 FROM public.student_enrolments se
            WHERE se.student_id = sg.student_id
              AND se.school_id = teacher_observations.school_id
              AND se.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM public.online_enrolments oe
            WHERE oe.student_id = sg.student_id
              AND oe.school_id = teacher_observations.school_id
              AND oe.status = 'active'
          )
        )
    ))
  );
