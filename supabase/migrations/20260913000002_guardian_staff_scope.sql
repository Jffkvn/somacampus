-- ==============================================================================
-- SOMACAMPUS MIGRATION: GUARDIAN STAFF READ ROLE SCOPE
-- ==============================================================================
-- student_guardians_staff_read matched ANY user_roles row for the school,
-- so parent/student accounts could enumerate every guardian link. Restrict
-- to staff roles; parents keep self_read, staff keep school-scoped access.
DROP POLICY IF EXISTS student_guardians_staff_read ON public.student_guardians;
CREATE POLICY student_guardians_staff_read ON public.student_guardians
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_enrolments se
      JOIN user_roles ur ON ur.school_id = se.school_id
      WHERE se.student_id = student_guardians.student_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );
