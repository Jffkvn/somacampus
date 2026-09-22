-- =============================================================================
-- Digital Learning Spine P1 — Office hours on the existing booking spine
-- Charter: docs/plans/2026-09-22-digital-learning-spine.md §13
--
-- Office hours / 1:1 reuse online_slot_templates + online_bookings.
-- NO second scheduler. slot_kind/booking_purpose only labels the same rows.
-- Office hours are 1:1 → capacity forced to 1 via trigger.
-- =============================================================================

BEGIN;

-- 1. Label existing templates (default remains class/group teaching).
ALTER TABLE public.online_slot_templates
  ADD COLUMN IF NOT EXISTS slot_kind TEXT NOT NULL DEFAULT 'class'
    CHECK (slot_kind IN ('class', 'office_hours'));

-- 2. Label bookings the same way (provenance of how the 1:1 was requested).
ALTER TABLE public.online_bookings
  ADD COLUMN IF NOT EXISTS booking_purpose TEXT NOT NULL DEFAULT 'class'
    CHECK (booking_purpose IN ('class', 'office_hours'));

-- 3. Office hours are strictly 1:1 (charter: office hours / 1:1).
CREATE OR REPLACE FUNCTION public.enforce_office_hours_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slot_kind = 'office_hours' THEN
    NEW.capacity := 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS online_slot_templates_office_hours_capacity
  ON public.online_slot_templates;
CREATE TRIGGER online_slot_templates_office_hours_capacity
  BEFORE INSERT OR UPDATE OF slot_kind, capacity ON public.online_slot_templates
  FOR EACH ROW
  WHEN (NEW.slot_kind = 'office_hours')
  EXECUTE FUNCTION public.enforce_office_hours_capacity();

CREATE INDEX IF NOT EXISTS online_slot_templates_kind_idx
  ON public.online_slot_templates (school_id, slot_kind)
  WHERE active;

CREATE INDEX IF NOT EXISTS online_bookings_purpose_idx
  ON public.online_bookings (school_id, booking_purpose, scheduled_date DESC);

COMMIT;
