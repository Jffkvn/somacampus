-- ==============================================================================
-- SOMACAMPUS MIGRATION: ENROLMENT READ ACCESS
-- Migration ID: 20260905000000
-- ==============================================================================
-- student_enrolments has RLS enabled with zero policies (deny-by-default),
-- so authenticated class-size reads from getTeacherToday were denied.
-- Read is open like other reference tables so teachers can derive class
-- sizes from enrolment rows.
-- NOTE: class-teacher write paths are unchanged — student_attendance_sessions
-- and student_attendance_records keep their strict insert/update policies.

-- ------------------------------------------------------------------------------
-- student_enrolments authenticated read policy (idempotent)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS student_enrolments_auth_read ON student_enrolments;
CREATE POLICY student_enrolments_auth_read ON student_enrolments
  FOR SELECT TO authenticated USING (true);
