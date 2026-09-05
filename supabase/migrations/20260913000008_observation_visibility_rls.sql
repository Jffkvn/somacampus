-- ==============================================================================
-- SOMACAMPUS MIGRATION: OBSERVATION VISIBILITY RLS
-- ==============================================================================
-- teacher_observations_auth_read was USING(true): any authenticated user
-- (incl. parents) could read internal_only observations via direct API.
-- App code filtered parent_visible, but the boundary must hold at the data
-- layer. Matrix: academic_team → school staff; internal_only → author +
-- admin/principal; parent_visible → author + staff + guardians of student.
DROP POLICY IF EXISTS teacher_observations_auth_read ON public.teacher_observations;
CREATE POLICY teacher_observations_visibility_read ON public.teacher_observations
  FOR SELECT TO authenticated
  USING (
    -- author always sees own rows
    EXISTS (SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_observations.teacher_id)
    -- admin / principal see all
    OR EXISTS (SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal'))
    -- school staff see academic_team + parent_visible
    OR (teacher_observations.visibility IN ('academic_team', 'parent_visible') AND EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.school_id = teacher_observations.school_id
        AND e.status = 'active' AND e.is_teacher
    ))
    -- guardians see parent_visible rows for their children
    OR (teacher_observations.visibility = 'parent_visible' AND EXISTS (
      SELECT 1 FROM public.student_guardians sg
      JOIN public.people p ON p.id = sg.guardian_person_id
      JOIN public.student_enrolments se ON se.student_id = sg.student_id
      WHERE p.auth_user_id = auth.uid()
        AND sg.student_id = teacher_observations.student_id
        AND se.school_id = teacher_observations.school_id AND se.status = 'active'
    ))
  );
