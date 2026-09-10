-- ============================================================================
-- Calendar writes were dead: no INSERT/UPDATE/DELETE policies existed on
-- school_calendars / calendar_events (SELECT-only), and the client sent
-- target_class_id, a column that did not exist. This migration:
--   1. Adds calendar_events.target_class_id (nullable FK) so audience='class'
--      events can scope to a class.
--   2. Adds leadership write policies on both tables (tenant-scoped via
--      is_leadership_in_school; events resolve the tenant through the parent
--      calendar).
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS). No data changes.
-- ============================================================================

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS target_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calendar_events_target_class_idx
  ON public.calendar_events(target_class_id) WHERE target_class_id IS NOT NULL;

DROP POLICY IF EXISTS school_calendars_leadership_write ON public.school_calendars;
CREATE POLICY school_calendars_leadership_write ON public.school_calendars
  FOR ALL TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

DROP POLICY IF EXISTS calendar_events_leadership_write ON public.calendar_events;
CREATE POLICY calendar_events_leadership_write ON public.calendar_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.school_calendars c
      WHERE c.id = calendar_events.school_calendar_id
        AND public.is_leadership_in_school(c.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.school_calendars c
      WHERE c.id = calendar_events.school_calendar_id
        AND public.is_leadership_in_school(c.school_id)
    )
  );
