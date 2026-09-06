-- ==============================================================================
-- SOMACAMPUS MIGRATION: ONLINE CROSS-TENANT RELATIONSHIP INTEGRITY
-- Migration ID: 20260915000000
-- ==============================================================================
-- Phase 9 Hardening: Database-level enforcement of tenant isolation.
-- RLS alone is insufficient; a malicious client bypassing RLS must never be
-- able to link a School A row to a School B entity.
--
-- This trigger enforces tenant matching on:
--  1. online_offerings -> online_programmes
--  2. online_pricing_options -> online_offerings
--  3. online_slot_templates -> online_offerings
--  4. online_enrolments -> students
--  5. online_enrolments -> online_offerings
--  6. online_teacher_engagements -> employees
--  7. online_teaching_assignments -> online_teacher_engagements
--  8. online_teaching_assignments -> online_offerings
--  9. online_sessions -> employees (teacher)
-- 10. online_sessions -> online_offerings
-- 11. online_session_participants -> students
-- 12. online_bookings -> students
-- 13. online_bookings -> online_offerings
-- ==============================================================================

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
    SELECT school_id INTO v_ref_school_id FROM public.students WHERE id = NEW.student_id;
    IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
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
        v_student_school_id UUID;
      BEGIN
        SELECT school_id INTO v_student_school_id FROM public.students WHERE id = NEW.student_id;
        IF v_student_school_id IS NOT NULL AND v_student_school_id <> v_ref_school_id THEN
          RAISE EXCEPTION 'Cross-tenant violation: participant student does not belong to session school %', v_ref_school_id;
        END IF;
      END;
    END IF;

  -- 9. online_bookings
  ELSIF TG_TABLE_NAME = 'online_bookings' THEN
    SELECT school_id INTO v_ref_school_id FROM public.students WHERE id = NEW.student_id;
    IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
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

-- Attach triggers to all relevant tables
DROP TRIGGER IF EXISTS trg_online_offerings_cross_tenant ON public.online_offerings;
CREATE TRIGGER trg_online_offerings_cross_tenant
  BEFORE INSERT OR UPDATE ON public.online_offerings
  FOR EACH ROW EXECUTE FUNCTION public.check_online_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_online_pricing_options_cross_tenant ON public.online_pricing_options;
CREATE TRIGGER trg_online_pricing_options_cross_tenant
  BEFORE INSERT OR UPDATE ON public.online_pricing_options
  FOR EACH ROW EXECUTE FUNCTION public.check_online_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_online_slot_templates_cross_tenant ON public.online_slot_templates;
CREATE TRIGGER trg_online_slot_templates_cross_tenant
  BEFORE INSERT OR UPDATE ON public.online_slot_templates
  FOR EACH ROW EXECUTE FUNCTION public.check_online_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_online_enrolments_cross_tenant ON public.online_enrolments;
CREATE TRIGGER trg_online_enrolments_cross_tenant
  BEFORE INSERT OR UPDATE ON public.online_enrolments
  FOR EACH ROW EXECUTE FUNCTION public.check_online_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_online_teacher_engagements_cross_tenant ON public.online_teacher_engagements;
CREATE TRIGGER trg_online_teacher_engagements_cross_tenant
  BEFORE INSERT OR UPDATE ON public.online_teacher_engagements
  FOR EACH ROW EXECUTE FUNCTION public.check_online_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_online_teaching_assignments_cross_tenant ON public.online_teaching_assignments;
CREATE TRIGGER trg_online_teaching_assignments_cross_tenant
  BEFORE INSERT OR UPDATE ON public.online_teaching_assignments
  FOR EACH ROW EXECUTE FUNCTION public.check_online_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_online_sessions_cross_tenant ON public.online_sessions;
CREATE TRIGGER trg_online_sessions_cross_tenant
  BEFORE INSERT OR UPDATE ON public.online_sessions
  FOR EACH ROW EXECUTE FUNCTION public.check_online_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_online_session_participants_cross_tenant ON public.online_session_participants;
CREATE TRIGGER trg_online_session_participants_cross_tenant
  BEFORE INSERT OR UPDATE ON public.online_session_participants
  FOR EACH ROW EXECUTE FUNCTION public.check_online_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_online_bookings_cross_tenant ON public.online_bookings;
CREATE TRIGGER trg_online_bookings_cross_tenant
  BEFORE INSERT OR UPDATE ON public.online_bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_online_cross_tenant_integrity();
