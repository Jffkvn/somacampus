-- ==============================================================================
-- SOMACAMPUS MIGRATION: TEACHER LOOP HARDENING
-- Migration ID: 20260904000000
-- ==============================================================================
-- Part A: Guard against dual class/stream assignment on class_teachers.
--   Canonical rule: when streams exist for a class, responsibility MUST be
--   stream-level. A class-level row (stream_id IS NULL) must not coexist with
--   stream-level rows for the same class over an overlapping date range.
-- Part B: RLS policies for teacher_attendance (RLS was enabled with zero
--   policies, so authenticated live clock-in select/insert was denied).
--   Read is open like other reference tables; payroll sensitivity is a
--   Phase-later concern.

-- ------------------------------------------------------------------------------
-- Part A: Dual-assignment guard trigger on class_teachers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_dual_class_stream_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.stream_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.class_id = NEW.class_id
        AND ct.stream_id IS NOT NULL
        AND daterange(ct.effective_from, COALESCE(ct.effective_to, 'infinity'::date), '[]')
            && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
        AND (TG_OP = 'INSERT' OR ct.id <> NEW.id)
    ) THEN
      RAISE EXCEPTION 'Class-level assignment blocked: stream-level assignments exist for this class/date range';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_dual_class_stream_assignment ON class_teachers;
CREATE TRIGGER trg_prevent_dual_class_stream_assignment
  BEFORE INSERT OR UPDATE ON class_teachers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_dual_class_stream_assignment();

-- ------------------------------------------------------------------------------
-- Part B: teacher_attendance RLS policies
-- ------------------------------------------------------------------------------
-- Read-open like other reference tables (payroll sensitivity is Phase-later concern).
DROP POLICY IF EXISTS teacher_attendance_auth_read ON teacher_attendance;
CREATE POLICY teacher_attendance_auth_read ON teacher_attendance
  FOR SELECT TO authenticated USING (true);

-- Insert: own-employee-row or leadership (admin/principal) — mirrors lessons_insert_policy.
DROP POLICY IF EXISTS teacher_attendance_auth_insert ON teacher_attendance;
CREATE POLICY teacher_attendance_auth_insert ON teacher_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = employee_id
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.id IN ('admin', 'principal')
    )
  );

-- Update: same condition for USING + WITH CHECK (allows clock-out edit by owner or admin/principal).
DROP POLICY IF EXISTS teacher_attendance_auth_update ON teacher_attendance;
CREATE POLICY teacher_attendance_auth_update ON teacher_attendance
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = employee_id
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.id IN ('admin', 'principal')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = employee_id
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.id IN ('admin', 'principal')
    )
  );
