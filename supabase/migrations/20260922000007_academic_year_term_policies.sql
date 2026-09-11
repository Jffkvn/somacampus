-- ============================================================================
-- Academic years + terms were unreadable: RLS enabled with zero policies,
-- so every authenticated read returned [] and the timetable builder could
-- never resolve an academicYearId (allocations unsavable with a misleading
-- "complete all fields" error). Adds school-member read on both tables and
-- leadership write. Terms resolve tenancy directly; academic_years directly.
-- Idempotent. No data changes.
-- ============================================================================

DROP POLICY IF EXISTS academic_years_school_read ON public.academic_years;
CREATE POLICY academic_years_school_read ON public.academic_years
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.school_id = academic_years.school_id
    )
    OR EXISTS (
      SELECT 1 FROM public.student_enrolments se
      JOIN public.students s ON s.id = se.student_id
      JOIN public.people p ON p.id = s.person_id
      WHERE p.auth_user_id = auth.uid() AND se.school_id = academic_years.school_id
    )
  );

DROP POLICY IF EXISTS academic_years_leadership_write ON public.academic_years;
CREATE POLICY academic_years_leadership_write ON public.academic_years
  FOR ALL TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

DROP POLICY IF EXISTS terms_school_read ON public.terms;
CREATE POLICY terms_school_read ON public.terms
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_years ay
      JOIN public.user_roles ur ON ur.school_id = ay.school_id
      WHERE ay.id = terms.academic_year_id AND ur.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.academic_years ay
      JOIN public.student_enrolments se ON se.school_id = ay.school_id
      JOIN public.students s ON s.id = se.student_id
      JOIN public.people p ON p.id = s.person_id
      WHERE ay.id = terms.academic_year_id AND p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS terms_leadership_write ON public.terms;
CREATE POLICY terms_leadership_write ON public.terms
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_years ay
      WHERE ay.id = terms.academic_year_id
        AND public.is_leadership_in_school(ay.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.academic_years ay
      WHERE ay.id = terms.academic_year_id
        AND public.is_leadership_in_school(ay.school_id)
    )
  );
