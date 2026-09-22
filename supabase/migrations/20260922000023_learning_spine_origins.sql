-- =============================================================================
-- Digital Learning Spine M1 — Academic origin + offering context
-- Charter: docs/plans/2026-09-22-digital-learning-spine.md §5–§7
--
-- Unlocks asynchronous online work: assignment/observation may be bound to an
-- online offering WITHOUT a live session. Session remains optional provenance.
--
-- Origin law (LOCKED):
--   Physical:  class_id NOT NULL, offering NULL, session NULL
--   Online:    class_id NULL, offering NOT NULL, session NULL | NOT NULL
--   If session set: session MUST belong to the same offering.
-- =============================================================================

BEGIN;

-- 1. online_offerings: optional academic plan + delivery pace (charter §5)
ALTER TABLE public.online_offerings
  ADD COLUMN IF NOT EXISTS scheme_of_work_id UUID
    REFERENCES public.schemes_of_work(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_pace TEXT NOT NULL DEFAULT 'term_paced'
    CHECK (delivery_pace IN ('term_paced', 'self_paced', 'sessional'));

CREATE INDEX IF NOT EXISTS online_offerings_scheme_idx
  ON public.online_offerings(scheme_of_work_id)
  WHERE scheme_of_work_id IS NOT NULL;

-- 2. Composite uniqueness so (session_id, offering_id) can be FK targets
--    (session ∈ offering for provenance links).
ALTER TABLE public.online_sessions
  DROP CONSTRAINT IF EXISTS online_sessions_id_offering_uq;
ALTER TABLE public.online_sessions
  ADD CONSTRAINT online_sessions_id_offering_uq UNIQUE (id, offering_id);

-- 3. assignments: online_offering_id + exclusive origin
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS online_offering_id UUID
    REFERENCES public.online_offerings(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS assignments_offering_idx
  ON public.assignments(online_offering_id)
  WHERE online_offering_id IS NOT NULL;

-- Provenance only: if both session and offering present, session must be in offering.
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_session_in_offering;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_session_in_offering
  FOREIGN KEY (online_session_id, online_offering_id)
  REFERENCES public.online_sessions(id, offering_id)
  ON DELETE RESTRICT;

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_origin_check;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_origin_check
  CHECK (
    (
      class_id IS NOT NULL
      AND online_offering_id IS NULL
      AND online_session_id IS NULL
    )
    OR (
      class_id IS NULL
      AND online_offering_id IS NOT NULL
    )
  );

-- 4. teacher_observations: same law (charter §10)
ALTER TABLE public.teacher_observations
  ADD COLUMN IF NOT EXISTS online_offering_id UUID
    REFERENCES public.online_offerings(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS teacher_observations_offering_idx
  ON public.teacher_observations(online_offering_id)
  WHERE online_offering_id IS NOT NULL;

ALTER TABLE public.teacher_observations
  DROP CONSTRAINT IF EXISTS teacher_observations_session_in_offering;
ALTER TABLE public.teacher_observations
  ADD CONSTRAINT teacher_observations_session_in_offering
  FOREIGN KEY (online_session_id, online_offering_id)
  REFERENCES public.online_sessions(id, offering_id)
  ON DELETE RESTRICT;

ALTER TABLE public.teacher_observations
  DROP CONSTRAINT IF EXISTS teacher_observations_origin_check;
ALTER TABLE public.teacher_observations
  ADD CONSTRAINT teacher_observations_origin_check
  CHECK (
    (
      class_id IS NOT NULL
      AND online_offering_id IS NULL
      AND online_session_id IS NULL
    )
    OR (
      class_id IS NULL
      AND online_offering_id IS NOT NULL
    )
  );

-- 5. Authorization: offering teachers may create online-origin work
CREATE OR REPLACE FUNCTION public.is_authorised_assignment_creator(
  p_school_id UUID,
  p_class_id UUID,
  p_stream_id UUID,
  p_subject_id UUID,
  p_assigned_date DATE,
  p_online_session_id UUID DEFAULT NULL,
  p_online_offering_id UUID DEFAULT NULL
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
  v_is_offering_teacher BOOLEAN := false;
  v_is_subject_teacher BOOLEAN := false;
  v_is_scheduled_teacher BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

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

  SELECT e.id INTO v_employee_id
  FROM public.employees e
  JOIN public.people p ON p.id = e.person_id
  WHERE p.auth_user_id = v_user_id
    AND e.school_id = p_school_id
  ORDER BY e.hire_date DESC NULLS LAST
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN false;
  END IF;

  -- Online session teacher (live delivery owner)
  IF p_online_session_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.online_sessions s
      WHERE s.id = p_online_session_id
        AND s.school_id = p_school_id
        AND s.teacher_id = v_employee_id
    ) INTO v_is_session_teacher;
    IF v_is_session_teacher THEN
      RETURN true;
    END IF;
  END IF;

  -- Online offering teaching engagement (async / course owner)
  IF p_online_offering_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.online_teaching_assignments ta
      JOIN public.online_teacher_engagements te ON te.id = ta.engagement_id
      WHERE ta.offering_id = p_online_offering_id
        AND te.school_id = p_school_id
        AND te.employee_id = v_employee_id
        AND te.status = 'active'
        AND ta.status = 'active'
    ) INTO v_is_offering_teacher;
    IF v_is_offering_teacher THEN
      RETURN true;
    END IF;
  END IF;

  -- Official subject appointment (fallback for physical / shared subjects)
  IF p_subject_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.teacher_official_subjects tos
      WHERE tos.school_id = p_school_id
        AND tos.teacher_id = v_employee_id
        AND tos.subject_id = p_subject_id
    ) INTO v_is_subject_teacher;
  END IF;

  IF v_is_subject_teacher THEN
    RETURN true;
  END IF;

  -- Timetable-scheduled teacher for that class/subject/date (physical)
  IF p_class_id IS NOT NULL AND p_subject_id IS NOT NULL AND p_assigned_date IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.timetable_entries te
      JOIN public.timetables t ON t.id = te.timetable_id
      WHERE t.school_id = p_school_id
        AND te.class_id = p_class_id
        AND te.subject_id = p_subject_id
        AND te.teacher_id = v_employee_id
        AND (p_stream_id IS NULL OR te.stream_id = p_stream_id OR te.stream_id IS NULL)
    ) INTO v_is_scheduled_teacher;
  END IF;

  RETURN COALESCE(v_is_scheduled_teacher, false);
END;
$$;

REVOKE ALL ON FUNCTION public.is_authorised_assignment_creator(UUID, UUID, UUID, UUID, DATE, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_authorised_assignment_creator(UUID, UUID, UUID, UUID, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_authorised_assignment_creator(UUID, UUID, UUID, UUID, DATE, UUID, UUID) TO authenticated;

-- 6. RLS callers: pass offering_id when present (drop old 6-arg overload usage).
DROP POLICY IF EXISTS assignments_insert ON public.assignments;
CREATE POLICY assignments_insert ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_authorised_assignment_creator(
      school_id, class_id, stream_id, subject_id, assigned_date,
      online_session_id, online_offering_id
    )
  );

DROP POLICY IF EXISTS assignments_update ON public.assignments;
CREATE POLICY assignments_update ON public.assignments
  FOR UPDATE TO authenticated
  USING (
    public.is_authorised_assignment_creator(
      school_id, class_id, stream_id, subject_id, assigned_date,
      online_session_id, online_offering_id
    )
  )
  WITH CHECK (
    public.is_authorised_assignment_creator(
      school_id, class_id, stream_id, subject_id, assigned_date,
      online_session_id, online_offering_id
    )
  );

COMMIT;
