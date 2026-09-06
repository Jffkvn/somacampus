-- ==============================================================================
-- SOMACAMPUS MIGRATION: ONLINE RLS HARDENING
-- Migration ID: 20260915000001
-- ==============================================================================
-- Phase 9 Hardening: Database-level authority for RLS.
-- Guarantees:
--  1. Teachers receive 0 pricing rows and 0 peer compensation data.
--  2. Teachers only see sessions, participants, and engagements where they are assigned.
--  3. Leadership (admin, principal, bursar) has administrative visibility.
--  4. Learners only see public pricing, own enrolments, own bookings, and own sessions.
-- ==============================================================================

-- 1. Helper: Check if caller holds leadership roles (admin, principal, bursar)
CREATE OR REPLACE FUNCTION public.online_centre_is_leadership(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = p_school_id
      AND ur.role_id IN ('admin', 'principal', 'bursar')
  );
$$;

-- 2. Helper: School-scoped student ID resolver
CREATE OR REPLACE FUNCTION public.online_centre_my_student_id_for_school(p_school_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.people p ON p.id = s.person_id
  WHERE p.auth_user_id = auth.uid()
    AND s.school_id = p_school_id
  ORDER BY s.id
  LIMIT 1;
$$;

-- ------------------------------------------------------------------------------
-- 3. REWRITE POLICIES
-- ------------------------------------------------------------------------------

-- -- online_pricing_options ----------------------------------------------------
-- Teachers receive ZERO rows. Only leadership sees internal/all rows.
-- Learners see display_mode = 'PUBLIC' only.
DROP POLICY IF EXISTS online_pricing_options_read ON public.online_pricing_options;
CREATE POLICY online_pricing_options_read ON public.online_pricing_options
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_leadership(school_id)
    OR (
      display_mode = 'PUBLIC'
      AND public.online_centre_is_learner(school_id)
    )
  );

DROP POLICY IF EXISTS online_pricing_options_insert ON public.online_pricing_options;
CREATE POLICY online_pricing_options_insert ON public.online_pricing_options
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_is_leadership(school_id));

DROP POLICY IF EXISTS online_pricing_options_update ON public.online_pricing_options;
CREATE POLICY online_pricing_options_update ON public.online_pricing_options
  FOR UPDATE TO authenticated
  USING (public.online_centre_is_leadership(school_id))
  WITH CHECK (public.online_centre_is_leadership(school_id));

-- -- online_teacher_engagements ------------------------------------------------
-- Teachers can ONLY see their own engagement record. No peer records visible.
DROP POLICY IF EXISTS online_teacher_engagements_read ON public.online_teacher_engagements;
CREATE POLICY online_teacher_engagements_read ON public.online_teacher_engagements
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_leadership(school_id)
    OR employee_id = public.current_employee_id_for_school(school_id)
  );

DROP POLICY IF EXISTS online_teacher_engagements_insert ON public.online_teacher_engagements;
CREATE POLICY online_teacher_engagements_insert ON public.online_teacher_engagements
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_is_leadership(school_id));

DROP POLICY IF EXISTS online_teacher_engagements_update ON public.online_teacher_engagements;
CREATE POLICY online_teacher_engagements_update ON public.online_teacher_engagements
  FOR UPDATE TO authenticated
  USING (public.online_centre_is_leadership(school_id))
  WITH CHECK (public.online_centre_is_leadership(school_id));

-- -- online_teaching_assignments ----------------------------------------------
DROP POLICY IF EXISTS online_teaching_assignments_read ON public.online_teaching_assignments;
CREATE POLICY online_teaching_assignments_read ON public.online_teaching_assignments
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_leadership(school_id)
    OR engagement_id IN (
      SELECT ote.id FROM public.online_teacher_engagements ote
      WHERE ote.school_id = online_teaching_assignments.school_id
        AND ote.employee_id = public.current_employee_id_for_school(online_teaching_assignments.school_id)
    )
  );

DROP POLICY IF EXISTS online_teaching_assignments_insert ON public.online_teaching_assignments;
CREATE POLICY online_teaching_assignments_insert ON public.online_teaching_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_is_leadership(school_id));

DROP POLICY IF EXISTS online_teaching_assignments_update ON public.online_teaching_assignments;
CREATE POLICY online_teaching_assignments_update ON public.online_teaching_assignments
  FOR UPDATE TO authenticated
  USING (public.online_centre_is_leadership(school_id))
  WITH CHECK (public.online_centre_is_leadership(school_id));

-- -- online_compensation_rules ------------------------------------------------
-- Teachers can ONLY see rules for their own teaching assignments. Peer pay is 0.
DROP POLICY IF EXISTS online_compensation_rules_read ON public.online_compensation_rules;
CREATE POLICY online_compensation_rules_read ON public.online_compensation_rules
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_leadership(public.online_centre_assignment_school(assignment_id))
    OR assignment_id IN (
      SELECT ota.id FROM public.online_teaching_assignments ota
      JOIN public.online_teacher_engagements ote ON ote.id = ota.engagement_id
      WHERE ota.id = online_compensation_rules.assignment_id
        AND ote.employee_id = public.current_employee_id_for_school(ota.school_id)
    )
  );

DROP POLICY IF EXISTS online_compensation_rules_insert ON public.online_compensation_rules;
CREATE POLICY online_compensation_rules_insert ON public.online_compensation_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.online_centre_is_leadership(public.online_centre_assignment_school(assignment_id))
  );

DROP POLICY IF EXISTS online_compensation_rules_update ON public.online_compensation_rules;
CREATE POLICY online_compensation_rules_update ON public.online_compensation_rules
  FOR UPDATE TO authenticated
  USING (
    public.online_centre_is_leadership(public.online_centre_assignment_school(assignment_id))
  )
  WITH CHECK (
    public.online_centre_is_leadership(public.online_centre_assignment_school(assignment_id))
  );

-- -- online_sessions -----------------------------------------------------------
-- Teachers only see sessions where they are the assigned teacher.
DROP POLICY IF EXISTS online_sessions_read ON public.online_sessions;
CREATE POLICY online_sessions_read ON public.online_sessions
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_leadership(school_id)
    OR teacher_id = public.current_employee_id_for_school(school_id)
    OR (
      public.online_centre_is_learner(school_id)
      AND public.online_centre_session_visible_to_learner(online_sessions.id)
    )
  );

DROP POLICY IF EXISTS online_sessions_insert ON public.online_sessions;
CREATE POLICY online_sessions_insert ON public.online_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.online_centre_is_leadership(school_id)
    OR (
      public.online_centre_can_write(school_id)
      AND teacher_id = public.current_employee_id_for_school(school_id)
    )
  );

DROP POLICY IF EXISTS online_sessions_update ON public.online_sessions;
CREATE POLICY online_sessions_update ON public.online_sessions
  FOR UPDATE TO authenticated
  USING (
    public.online_centre_is_leadership(school_id)
    OR teacher_id = public.current_employee_id_for_school(school_id)
  )
  WITH CHECK (
    public.online_centre_is_leadership(school_id)
    OR teacher_id = public.current_employee_id_for_school(school_id)
  );

-- -- online_session_participants -----------------------------------------------
DROP POLICY IF EXISTS online_session_participants_read ON public.online_session_participants;
CREATE POLICY online_session_participants_read ON public.online_session_participants
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_leadership(public.online_centre_session_school(session_id))
    OR EXISTS (
      SELECT 1 FROM public.online_sessions s
      WHERE s.id = online_session_participants.session_id
        AND s.teacher_id = public.current_employee_id_for_school(s.school_id)
    )
    OR student_id = public.online_centre_my_student_id_for_school(public.online_centre_session_school(session_id))
    OR student_id IN (
      SELECT public.current_guardian_student_ids_for_school(
        public.online_centre_session_school(online_session_participants.session_id)
      )
    )
  );

DROP POLICY IF EXISTS online_session_participants_insert ON public.online_session_participants;
CREATE POLICY online_session_participants_insert ON public.online_session_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.online_centre_is_leadership(public.online_centre_session_school(session_id))
    OR EXISTS (
      SELECT 1 FROM public.online_sessions s
      WHERE s.id = session_id
        AND s.teacher_id = public.current_employee_id_for_school(s.school_id)
    )
  );

DROP POLICY IF EXISTS online_session_participants_update ON public.online_session_participants;
CREATE POLICY online_session_participants_update ON public.online_session_participants
  FOR UPDATE TO authenticated
  USING (
    public.online_centre_is_leadership(public.online_centre_session_school(session_id))
    OR EXISTS (
      SELECT 1 FROM public.online_sessions s
      WHERE s.id = session_id
        AND s.teacher_id = public.current_employee_id_for_school(s.school_id)
    )
  )
  WITH CHECK (
    public.online_centre_is_leadership(public.online_centre_session_school(session_id))
    OR EXISTS (
      SELECT 1 FROM public.online_sessions s
      WHERE s.id = session_id
        AND s.teacher_id = public.current_employee_id_for_school(s.school_id)
    )
  );

-- -- online_bookings -----------------------------------------------------------
DROP POLICY IF EXISTS online_bookings_read ON public.online_bookings;
CREATE POLICY online_bookings_read ON public.online_bookings
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_leadership(school_id)
    OR student_id = public.online_centre_my_student_id_for_school(school_id)
    OR student_id IN (
      SELECT public.current_guardian_student_ids_for_school(online_bookings.school_id)
    )
  );

-- -- online_enrolments ---------------------------------------------------------
DROP POLICY IF EXISTS online_enrolments_read ON public.online_enrolments;
CREATE POLICY online_enrolments_read ON public.online_enrolments
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_leadership(school_id)
    OR student_id = public.online_centre_my_student_id_for_school(school_id)
    OR student_id IN (
      SELECT public.current_guardian_student_ids_for_school(online_enrolments.school_id)
    )
    OR offering_id IN (
      SELECT ota.offering_id FROM public.online_teaching_assignments ota
      JOIN public.online_teacher_engagements ote ON ote.id = ota.engagement_id
      WHERE ota.school_id = online_enrolments.school_id
        AND ote.employee_id = public.current_employee_id_for_school(online_enrolments.school_id)
    )
  );
