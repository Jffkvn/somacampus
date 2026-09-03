-- ==============================================================================
-- SOMACAMPUS MIGRATION: LESSON SUBMIT HARDENING
-- ==============================================================================
-- Links lessons to the daily attendance session; allows owner-or-leadership
-- corrections (INSERT was strict-owner since 00001; UPDATE was denied for all).
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS attendance_session_id UUID REFERENCES student_attendance_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lessons_timetable_date ON lessons (timetable_entry_id, submitted_at DESC);

DROP POLICY IF EXISTS lessons_auth_update ON lessons;
CREATE POLICY lessons_auth_update ON lessons
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees e JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id)
    OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.id IN ('admin','principal'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM employees e JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id)
    OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.id IN ('admin','principal'))
  );
