-- ==============================================================================
-- Migration: 20260916000002_online_school_resolution.sql
-- Description:
--   Corrective, idempotent (CREATE OR REPLACE, no edits to existing files):
--   students has NO school_id column (verified in
--   20260903000000_somacampus_core_schema.sql); school resolves via
--   student_enrolments.school_id. Two functions selected a non-existent
--   students.school_id, so they created fine but failed at execution:
--   1. check_online_cross_tenant_integrity (20260915000000): three student
--      blocks (online_enrolments, online_session_participants, online_bookings)
--      redefined on active student_enrolments. All other branches byte-identical.
--   2. online_centre_my_student_id_for_school (20260915000001): redefined to
--      filter by the passed p_school_id via an active student_enrolments join.
--   Multi-enrolment ambiguity choice (documented): ANY-match, fail-closed for
--   the integrity trigger -- raise only when the student HAS enrolment rows but
--   NONE matches the row's school, so unenrolled prospects are not blocked
--   (same convention as accept_online_offer_atomic in 20260916000001). The
--   helper filters by the passed school param with the same active-enrolment
--   predicate. SECURITY DEFINER + SET search_path preserved on both.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. REDEFINE: check_online_cross_tenant_integrity (student school via
-- active student_enrolments; every other branch unchanged).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_online_cross_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref_school_id UUID;
BEGIN
  -- 1. online_offerings
  IF TG_TABLE_NAME = 'online_offerings' THEN
    IF NEW.programme_id IS NOT NULL THEN
      SELECT school_id INTO v_ref_school_id FROM public.online_programmes WHERE id = NEW.programme_id;
      IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Cross-tenant violation: programme does not belong to school %', NEW.school_id;
      END IF;
    END IF;

  -- 2. online_pricing_options
  ELSIF TG_TABLE_NAME = 'online_pricing_options' THEN
    SELECT school_id INTO v_ref_school_id FROM public.online_offerings WHERE id = NEW.offering_id;
    IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Cross-tenant violation: offering does not belong to school %', NEW.school_id;
    END IF;

  -- 3. online_slot_templates
  ELSIF TG_TABLE_NAME = 'online_slot_templates' THEN
    SELECT school_id INTO v_ref_school_id FROM public.online_offerings WHERE id = NEW.offering_id;
    IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Cross-tenant violation: offering does not belong to school %', NEW.school_id;
    END IF;
    IF NEW.default_teacher_id IS NOT NULL THEN
      SELECT school_id INTO v_ref_school_id FROM public.employees WHERE id = NEW.default_teacher_id;
      IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Cross-tenant violation: teacher employee does not belong to school %', NEW.school_id;
      END IF;
    END IF;

  -- 4. online_enrolments
  ELSIF TG_TABLE_NAME = 'online_enrolments' THEN
    -- students has no school_id: resolve via active student_enrolments.
    -- Fail-closed ANY-match: raise only when the student has enrolment rows
    -- but none matches this row's school (unenrolled prospects pass).
    IF EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = NEW.student_id
    ) AND NOT EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = NEW.student_id
        AND se.school_id = NEW.school_id
        AND se.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Cross-tenant violation: student does not belong to school %', NEW.school_id;
    END IF;
    IF NEW.offering_id IS NOT NULL THEN
      SELECT school_id INTO v_ref_school_id FROM public.online_offerings WHERE id = NEW.offering_id;
      IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Cross-tenant violation: offering does not belong to school %', NEW.school_id;
      END IF;
    END IF;

  -- 5. online_teacher_engagements
  ELSIF TG_TABLE_NAME = 'online_teacher_engagements' THEN
    SELECT school_id INTO v_ref_school_id FROM public.employees WHERE id = NEW.employee_id;
    IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Cross-tenant violation: employee does not belong to school %', NEW.school_id;
    END IF;

  -- 6. online_teaching_assignments
  ELSIF TG_TABLE_NAME = 'online_teaching_assignments' THEN
    SELECT school_id INTO v_ref_school_id FROM public.online_teacher_engagements WHERE id = NEW.engagement_id;
    IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Cross-tenant violation: engagement does not belong to school %', NEW.school_id;
    END IF;
    IF NEW.offering_id IS NOT NULL THEN
      SELECT school_id INTO v_ref_school_id FROM public.online_offerings WHERE id = NEW.offering_id;
      IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Cross-tenant violation: offering does not belong to school %', NEW.school_id;
      END IF;
    END IF;

  -- 7. online_sessions
  ELSIF TG_TABLE_NAME = 'online_sessions' THEN
    SELECT school_id INTO v_ref_school_id FROM public.employees WHERE id = NEW.teacher_id;
    IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Cross-tenant violation: teacher employee does not belong to school %', NEW.school_id;
    END IF;
    IF NEW.offering_id IS NOT NULL THEN
      SELECT school_id INTO v_ref_school_id FROM public.online_offerings WHERE id = NEW.offering_id;
      IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Cross-tenant violation: offering does not belong to school %', NEW.school_id;
      END IF;
    END IF;

  -- 8. online_session_participants
  ELSIF TG_TABLE_NAME = 'online_session_participants' THEN
    SELECT school_id INTO v_ref_school_id FROM public.online_sessions WHERE id = NEW.session_id;
    IF v_ref_school_id IS NOT NULL THEN
      DECLARE
        v_has_matching_enrolment BOOLEAN;
        v_has_any_enrolment BOOLEAN;
      BEGIN
        -- students has no school_id: resolve via active student_enrolments.
        SELECT EXISTS (
          SELECT 1 FROM public.student_enrolments se
          WHERE se.student_id = NEW.student_id
            AND se.school_id = v_ref_school_id
            AND se.status = 'active'
        ) INTO v_has_matching_enrolment;
        SELECT EXISTS (
          SELECT 1 FROM public.student_enrolments se
          WHERE se.student_id = NEW.student_id
        ) INTO v_has_any_enrolment;
        IF v_has_any_enrolment AND NOT v_has_matching_enrolment THEN
          RAISE EXCEPTION 'Cross-tenant violation: participant student does not belong to session school %', v_ref_school_id;
        END IF;
      END;
    END IF;

  -- 9. online_bookings
  ELSIF TG_TABLE_NAME = 'online_bookings' THEN
    -- students has no school_id: resolve via active student_enrolments.
    -- Fail-closed ANY-match: raise only when the student has enrolment rows
    -- but none matches this row's school (unenrolled prospects pass).
    IF EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = NEW.student_id
    ) AND NOT EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = NEW.student_id
        AND se.school_id = NEW.school_id
        AND se.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Cross-tenant violation: student does not belong to school %', NEW.school_id;
    END IF;
    IF NEW.offering_id IS NOT NULL THEN
      SELECT school_id INTO v_ref_school_id FROM public.online_offerings WHERE id = NEW.offering_id;
      IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Cross-tenant violation: offering does not belong to school %', NEW.school_id;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. REDEFINE: online_centre_my_student_id_for_school (school scoped via the
-- passed p_school_id through active student_enrolments; students has no
-- school_id). Signature, language, volatility, and security attributes
-- unchanged.
-- ------------------------------------------------------------------------------
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
    AND EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = s.id
        AND se.school_id = p_school_id
        AND se.status = 'active'
    )
  ORDER BY s.id
  LIMIT 1;
$$;
