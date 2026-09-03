-- ==============================================================================
-- PHASE 4 RLS & TRIGGER HARDENING
-- ==============================================================================
-- 1. Fix trigger employee lookup
CREATE OR REPLACE FUNCTION log_academic_score_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (OLD.score IS DISTINCT FROM NEW.score) AND (NEW.score IS NOT NULL) THEN
    INSERT INTO academic_assessment_audit_logs (
      school_id,
      submission_id,
      student_id,
      previous_score,
      new_score,
      changed_by_teacher_id,
      changed_at,
      reason
    ) VALUES (
      NEW.school_id,
      NEW.id,
      NEW.student_id,
      OLD.score,
      NEW.score,
      COALESCE(
        NEW.reviewed_by_teacher_id,
        (SELECT e.id FROM employees e JOIN people p ON p.id = e.person_id WHERE p.auth_user_id = auth.uid() LIMIT 1)
      ),
      now(),
      'Score adjusted by teacher'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Fix Admin / Principal check to match role ID ('admin', 'principal')
CREATE OR REPLACE FUNCTION is_authorised_assignment_creator(
  p_school_id UUID,
  p_class_id UUID,
  p_stream_id UUID,
  p_subject_id UUID,
  p_assigned_date DATE
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
  v_is_scheduled_teacher BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Check Admin / Principal role (match role.id e.g. 'admin', 'principal')
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
      AND st.effective_from <= p_assigned_date
      AND (st.effective_to IS NULL OR st.effective_to >= p_assigned_date)
  ) INTO v_is_subject_teacher;

  IF v_is_subject_teacher THEN
    RETURN true;
  END IF;

  -- 4. Check active timetable schedule
  SELECT EXISTS (
    SELECT 1 FROM timetable_entries te
    JOIN timetables t ON t.id = te.timetable_id
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
