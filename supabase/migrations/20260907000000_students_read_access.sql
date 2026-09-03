-- ==============================================================================
-- SOMACAMPUS MIGRATION: STUDENT READ ACCESS
-- ==============================================================================
-- students had ENABLE RLS with zero policies (deny-by-default), so the
-- enrolments -> students -> people join chain resolved to null for
-- authenticated users (directory/detail/roster fallbacks). Reference tables
-- stay read-open; attendance writes keep their strict policies.
DROP POLICY IF EXISTS students_auth_read ON students;
CREATE POLICY students_auth_read ON students
  FOR SELECT TO authenticated USING (true);
