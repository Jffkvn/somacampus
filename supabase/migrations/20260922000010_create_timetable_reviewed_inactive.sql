-- ==============================================================================
-- SOMACAMPUS MIGRATION: REVIEWED TIMETABLES START INACTIVE
-- Migration ID: 20260922000010
-- ==============================================================================
-- Correction to create_timetable_with_entries: a 'reviewed' submission is a
-- draft for leadership approval and must NOT be the active timetable.
-- Activation belongs to publish_timetable_atomic (which activates the target
-- and archives all other active timetables in the term). Creating with
-- is_active = true produced two active timetables after the classic
-- "Submit for Review" flow, which would double teachers' lessons
-- (timetable_entries join filters on is_active) and break the single-row
-- active-timetable lookup in TimetableDraftPage.
--
-- Also drops the 4-arg overload from 20260922000008 so one canonical
-- 7-arg signature remains (4-arg callers resolve via parameter defaults).
-- Idempotent: CREATE OR REPLACE + DROP IF EXISTS.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_timetable_with_entries(
  p_school_id UUID,
  p_term_id UUID,
  p_name TEXT,
  p_entries JSONB,
  p_scorecard JSONB DEFAULT NULL,
  p_base_timetable_id UUID DEFAULT NULL,
  p_is_ai_generated BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timetable_id UUID;
  v_entry JSONB;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'create_timetable_with_entries: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Leadership check (same gate as approve/publish RPCs)
  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'create_timetable_with_entries: caller is not authorized leadership for school %',
      p_school_id USING ERRCODE = '42501';
  END IF;

  -- 3. School must exist
  IF NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = p_school_id) THEN
    RAISE EXCEPTION 'create_timetable_with_entries: school % not found', p_school_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Validate entries payload shape before inserting anything
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'create_timetable_with_entries: p_entries must be a JSON array'
      USING ERRCODE = '22023';
  END IF;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    IF (v_entry->>'class_id') IS NULL OR (v_entry->>'subject_id') IS NULL
       OR (v_entry->>'teacher_id') IS NULL OR (v_entry->>'day_of_week') IS NULL
       OR (v_entry->>'start_time') IS NULL OR (v_entry->>'end_time') IS NULL THEN
      RAISE EXCEPTION 'create_timetable_with_entries: entry missing required field: %', v_entry
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = (v_entry->>'class_id')::uuid)
       OR NOT EXISTS (SELECT 1 FROM public.subjects sub WHERE sub.id = (v_entry->>'subject_id')::uuid)
       OR NOT EXISTS (
         SELECT 1 FROM public.employees e
         WHERE e.id = (v_entry->>'teacher_id')::uuid AND e.school_id = p_school_id
       ) THEN
      RAISE EXCEPTION 'create_timetable_with_entries: entry references unknown class/subject/teacher: %',
        v_entry USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- 5. Create the timetable ('reviewed', NOT active) + entries atomically.
  --    publish_timetable_atomic owns activation and archives its predecessors.
  INSERT INTO public.timetables (
    school_id, term_id, name, status, is_active,
    constraint_scorecard, base_timetable_id, is_ai_generated
  )
  VALUES (
    p_school_id, p_term_id, p_name, 'reviewed', false,
    p_scorecard, p_base_timetable_id, p_is_ai_generated
  )
  RETURNING id INTO v_timetable_id;

  INSERT INTO public.timetable_entries (
    timetable_id, class_id, stream_id, subject_id, teacher_id, room_name,
    day_of_week, start_time, end_time
  )
  SELECT
    v_timetable_id,
    (e->>'class_id')::uuid,
    (e->>'stream_id')::uuid,
    (e->>'subject_id')::uuid,
    (e->>'teacher_id')::uuid,
    e->>'room_name',
    (e->>'day_of_week')::int,
    (e->>'start_time')::time,
    (e->>'end_time')::time
  FROM jsonb_array_elements(p_entries) AS e;

  RETURN v_timetable_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_timetable_with_entries(UUID, UUID, TEXT, JSONB, JSONB, UUID, BOOLEAN) TO authenticated;

-- One canonical signature: 4-arg callers resolve via the defaults above.
DROP FUNCTION IF EXISTS public.create_timetable_with_entries(UUID, UUID, TEXT, JSONB);
