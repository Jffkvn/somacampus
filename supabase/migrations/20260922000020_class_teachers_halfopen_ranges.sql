-- Migration: Change class_teachers exclusion constraints to half-open '[)'
-- Solves same-day class teacher reassignment exclusion violations.

BEGIN;

-- 1. Drop existing closed-range exclusion constraints
ALTER TABLE public.class_teachers
  DROP CONSTRAINT IF EXISTS no_overlapping_stream_class_teachers,
  DROP CONSTRAINT IF EXISTS no_overlapping_class_class_teachers;

-- 2. Recreate with half-open '[)' bounds
ALTER TABLE public.class_teachers
  ADD CONSTRAINT no_overlapping_stream_class_teachers
    EXCLUDE USING gist (
      stream_id WITH =,
      daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)') WITH &&
    ) WHERE (stream_id IS NOT NULL),
  ADD CONSTRAINT no_overlapping_class_class_teachers
    EXCLUDE USING gist (
      class_id WITH =,
      daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)') WITH &&
    ) WHERE (stream_id IS NULL);

-- 3. Update the dual-assignment guard trigger to use '[)' bounds
CREATE OR REPLACE FUNCTION prevent_dual_class_stream_assignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stream_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.class_teachers ct
      WHERE ct.class_id = NEW.class_id
        AND ct.stream_id IS NULL
        AND ct.id IS DISTINCT FROM NEW.id
        AND daterange(ct.effective_from, COALESCE(ct.effective_to, 'infinity'::date), '[)')
            && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[)')
    ) THEN
      RAISE EXCEPTION 'Cannot assign a stream-level class teacher when a class-level assignment overlaps the same date range.';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.class_teachers ct
      WHERE ct.class_id = NEW.class_id
        AND ct.stream_id IS NOT NULL
        AND ct.id IS DISTINCT FROM NEW.id
        AND daterange(ct.effective_from, COALESCE(ct.effective_to, 'infinity'::date), '[)')
            && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[)')
    ) THEN
      RAISE EXCEPTION 'Cannot assign a class-level class teacher when stream-level assignments overlap the same date range.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Update assign_class_teacher RPC to close prior interval with GREATEST(effective_from, v_effective_date)
CREATE OR REPLACE FUNCTION public.assign_class_teacher(
  p_school_id UUID,
  p_class_id UUID,
  p_stream_id UUID,
  p_teacher_id UUID,
  p_effective_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_effective_date DATE;
  v_new_id UUID;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'assign_class_teacher: caller must be authenticated';
  END IF;

  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'assign_class_teacher: caller lacks leadership privileges in school %', p_school_id;
  END IF;

  v_effective_date := COALESCE(p_effective_date, CURRENT_DATE);

  -- Validate class belongs to school
  IF NOT EXISTS (
    SELECT 1 FROM public.classes WHERE id = p_class_id AND school_id = p_school_id
  ) THEN
    RAISE EXCEPTION 'assign_class_teacher: class % does not belong to school %', p_class_id, p_school_id;
  END IF;

  -- Validate stream if provided
  IF p_stream_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.streams WHERE id = p_stream_id AND class_id = p_class_id
  ) THEN
    RAISE EXCEPTION 'assign_class_teacher: stream % does not belong to class %', p_stream_id, p_class_id;
  END IF;

  -- Validate teacher belongs to school and is active
  IF NOT EXISTS (
    SELECT 1 FROM public.employees WHERE id = p_teacher_id AND school_id = p_school_id
  ) THEN
    RAISE EXCEPTION 'assign_class_teacher: teacher % does not belong to school %', p_teacher_id, p_school_id;
  END IF;

  -- Close any active class_teachers assignment for this class/stream using half-open bounds
  IF p_stream_id IS NOT NULL THEN
    UPDATE public.class_teachers
    SET effective_to = GREATEST(effective_from, v_effective_date)
    WHERE stream_id = p_stream_id
      AND (effective_to IS NULL OR effective_to >= v_effective_date);
  ELSE
    UPDATE public.class_teachers
    SET effective_to = GREATEST(effective_from, v_effective_date)
    WHERE class_id = p_class_id
      AND stream_id IS NULL
      AND (effective_to IS NULL OR effective_to >= v_effective_date);
  END IF;

  -- Insert new active class_teachers assignment
  INSERT INTO public.class_teachers (
    school_id,
    class_id,
    stream_id,
    teacher_id,
    effective_from,
    effective_to
  ) VALUES (
    p_school_id,
    p_class_id,
    p_stream_id,
    p_teacher_id,
    v_effective_date,
    NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMIT;
