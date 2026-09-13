-- Migration: Add write RLS policy for subjects table
-- Pattern: matches classes_leadership_write, school_calendars_leadership_write
-- Authorization: is_leadership_in_school (admin, principal, bursar)

DROP POLICY IF EXISTS subjects_leadership_write ON public.subjects;
CREATE POLICY subjects_leadership_write ON public.subjects
  FOR ALL TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));
