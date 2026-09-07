-- ==============================================================================
-- Migration: 20260917000003_daily_operations.sql
-- Module: SomaCampus Core School Operations — Slice 2
--
-- Purpose:
--   1. Add capacity column to classes and streams (defaults to 40).
--   2. Atomic RPC assign_class_teacher: closes active assignment on class/stream
--      and creates new assignment starting CURRENT_DATE.
--   3. Leadership RLS policies for classes, streams, leave_types, and leave_entitlements.
-- ==============================================================================

-- 1. ADD CAPACITY COLUMNS
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 40;

ALTER TABLE public.streams
  ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 40;

-- 2. READ & WRITE POLICIES FOR STREAMS & CLASSES
DROP POLICY IF EXISTS streams_auth_read ON public.streams;
CREATE POLICY streams_auth_read ON public.streams
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS classes_leadership_write ON public.classes;
CREATE POLICY classes_leadership_write ON public.classes
  FOR ALL TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

DROP POLICY IF EXISTS streams_leadership_write ON public.streams;
CREATE POLICY streams_leadership_write ON public.streams
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = streams.class_id
        AND public.is_leadership_in_school(c.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = streams.class_id
        AND public.is_leadership_in_school(c.school_id)
    )
  );

-- 3. LEADERSHIP WRITE POLICIES FOR HR LEAVE POLICIES & ENTITLEMENTS
DROP POLICY IF EXISTS leave_types_leadership_write ON public.leave_types;
CREATE POLICY leave_types_leadership_write ON public.leave_types
  FOR ALL TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

DROP POLICY IF EXISTS leave_entitlements_leadership_write ON public.leave_entitlements;
CREATE POLICY leave_entitlements_leadership_write ON public.leave_entitlements
  FOR ALL TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

-- ------------------------------------------------------------------------------
-- 4. RPC: assign_class_teacher
-- Atomically closes any active class teacher assignment for the given class/stream
-- and inserts the new active assignment starting p_effective_date.
-- ------------------------------------------------------------------------------
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

  -- Close any active class_teachers assignment for this class/stream
  -- Since GiST exclusion is [effective_from, effective_to], set effective_to = v_effective_date - 1
  -- if assignment started before today, or set effective_to = effective_from.
  IF p_stream_id IS NOT NULL THEN
    UPDATE public.class_teachers
    SET effective_to = GREATEST(effective_from, v_effective_date - 1)
    WHERE stream_id = p_stream_id
      AND (effective_to IS NULL OR effective_to >= v_effective_date);
  ELSE
    UPDATE public.class_teachers
    SET effective_to = GREATEST(effective_from, v_effective_date - 1)
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

REVOKE ALL ON FUNCTION public.assign_class_teacher(UUID, UUID, UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_class_teacher(UUID, UUID, UUID, UUID, DATE) TO authenticated;
