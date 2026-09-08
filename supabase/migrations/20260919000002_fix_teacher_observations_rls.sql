-- 20260919000002_fix_teacher_observations_rls.sql
-- Fixes RLS policies on teacher_observations to support role ID and role name checks for admin/principal/teacher.
-- Previous policy strictly checked r.name IN ('admin', 'principal') whereas roles table stores id='admin', name='Administrator'.

DROP POLICY IF EXISTS teacher_observations_auth_insert ON teacher_observations;
CREATE POLICY teacher_observations_auth_insert ON teacher_observations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher', 'Administrator', 'Principal / Director', 'Teacher'))
    )
  );

DROP POLICY IF EXISTS teacher_observations_auth_update ON teacher_observations;
CREATE POLICY teacher_observations_auth_update ON teacher_observations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher', 'Administrator', 'Principal / Director', 'Teacher'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher', 'Administrator', 'Principal / Director', 'Teacher'))
    )
  );
