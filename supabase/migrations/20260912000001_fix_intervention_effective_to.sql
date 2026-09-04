-- ============================================================================
-- SomaCampus Hardening Part C: Intervention creator uses effective_to
-- Migration: 20260912000001_fix_intervention_effective_to.sql
-- ============================================================================
-- Live class_teachers shape has effective_to (NO effective_until column), so the
-- Phase 5 definition referencing ct.effective_until fails at runtime. Redefine
-- is_authorised_intervention_creator identically except for the column fix.
-- NOTE: the sibling file 20260908000001_phase4_rls_hardening.sql was checked and
-- does NOT define is_authorised_intervention_creator (it defines only
-- is_authorised_assignment_creator, which already uses effective_to correctly),
-- so no sibling fix is needed. Idempotent: CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION is_authorised_intervention_creator(
  p_school_id UUID,
  p_class_id UUID,
  p_stream_id UUID,
  p_subject_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_employee_id UUID;
  v_is_admin_or_principal BOOLEAN := false;
  v_is_subject_teacher BOOLEAN := false;
  v_is_class_teacher BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Check Admin / Principal role
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id
      AND ur.school_id = p_school_id
      AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
  ) INTO v_is_admin_or_principal;

  IF v_is_admin_or_principal THEN
    RETURN true;
  END IF;

  -- 2. Find Employee ID
  SELECT e.id INTO v_employee_id
  FROM employees e
  JOIN people p ON p.id = e.person_id
  WHERE p.auth_user_id = v_user_id
    AND e.school_id = p_school_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN false;
  END IF;

  -- 3. Check Subject Teacher assignment
  SELECT EXISTS (
    SELECT 1 FROM subject_teachers st
    WHERE st.school_id = p_school_id
      AND st.teacher_id = v_employee_id
      AND st.class_id = p_class_id
      AND (p_stream_id IS NULL OR st.stream_id IS NULL OR st.stream_id = p_stream_id)
      AND st.subject_id = p_subject_id
      AND st.effective_from <= CURRENT_DATE
      AND (st.effective_to IS NULL OR st.effective_to >= CURRENT_DATE)
  ) INTO v_is_subject_teacher;

  IF v_is_subject_teacher THEN
    RETURN true;
  END IF;

  -- 4. Check Class Teacher assignment (FIX: effective_to, not effective_until)
  SELECT EXISTS (
    SELECT 1 FROM class_teachers ct
    WHERE ct.school_id = p_school_id
      AND ct.teacher_id = v_employee_id
      AND ct.class_id = p_class_id
      AND (p_stream_id IS NULL OR ct.stream_id IS NULL OR ct.stream_id = p_stream_id)
      AND (ct.effective_to IS NULL OR ct.effective_to >= CURRENT_DATE)
  ) INTO v_is_class_teacher;

  RETURN v_is_class_teacher;
END;
$$;
