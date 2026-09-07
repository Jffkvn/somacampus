-- ==============================================================================
-- Migration: 20260917000001_enrolment_interval_history.sql
-- Module: SomaCampus Core School Operations — Slice 1 Task 3
--
-- Purpose:
--   1. Add interval-based history columns to student_enrolments:
--      start_date (NOT NULL DEFAULT CURRENT_DATE), end_date, exit_reason.
--   2. Replace single-row (student_id, academic_year_id) UNIQUE constraint with
--      a partial unique index on (student_id) WHERE status = 'active'.
--      This guarantees a student is enrolled in exactly ONE active class/stream
--      at a time, while preserving all historical enrolment intervals.
--   3. RPC transfer_student_enrolment: Atomically closes the active enrolment
--      and opens a new active enrolment in the target class/stream.
--   4. RPC withdraw_student: Atomically closes active enrolment with exit reason
--      and updates students.status ('withdrawn' or 'graduated').
-- ==============================================================================

-- 1. ADD INTERVAL COLUMNS TO student_enrolments
ALTER TABLE public.student_enrolments
  ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS exit_reason TEXT
    CHECK (exit_reason IS NULL OR exit_reason IN ('promoted', 'transferred_class', 'transferred_stream', 'withdrawn', 'graduated', 'other'));

-- 2. REPLACE HARD UNIQUE CONSTRAINT WITH PARTIAL UNIQUE INDEX
-- Drop the single-record-per-year constraint to support intra-year stream/class transfers.
ALTER TABLE public.student_enrolments
  DROP CONSTRAINT IF EXISTS student_enrolments_student_id_academic_year_id_key;

-- Ensure exactly one active enrolment per student at any moment
CREATE UNIQUE INDEX IF NOT EXISTS student_enrolments_single_active_idx
  ON public.student_enrolments (student_id)
  WHERE status = 'active';

-- Index for historical timeline lookups
CREATE INDEX IF NOT EXISTS student_enrolments_student_timeline_idx
  ON public.student_enrolments (student_id, start_date DESC);

-- ------------------------------------------------------------------------------
-- 3. RPC: transfer_student_enrolment
-- Atomically closes current active enrolment and creates the new active enrolment.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_student_enrolment(
  p_student_id UUID,
  p_target_class_id UUID,
  p_target_stream_id UUID DEFAULT NULL,
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_reason TEXT DEFAULT 'transferred_class'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_active_enrolment RECORD;
  v_school_id UUID;
  v_academic_year_id UUID;
  v_new_enrolment_id UUID;
  v_effective_date DATE;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'transfer_student_enrolment: caller must be authenticated';
  END IF;

  v_effective_date := COALESCE(p_effective_date, CURRENT_DATE);

  -- Fetch current active enrolment with lock
  SELECT *
  INTO v_active_enrolment
  FROM public.student_enrolments
  WHERE student_id = p_student_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_student_enrolment: no active enrolment found for student %', p_student_id;
  END IF;

  v_school_id := v_active_enrolment.school_id;
  v_academic_year_id := v_active_enrolment.academic_year_id;

  -- Caller must be leadership in the school
  IF NOT public.is_leadership_in_school(v_school_id) THEN
    RAISE EXCEPTION 'transfer_student_enrolment: caller lacks leadership privileges in school %', v_school_id;
  END IF;

  -- Validate target class belongs to the school
  IF NOT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_target_class_id AND school_id = v_school_id
  ) THEN
    RAISE EXCEPTION 'transfer_student_enrolment: target class % does not belong to school %', p_target_class_id, v_school_id;
  END IF;

  -- Validate target stream if provided
  IF p_target_stream_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.streams
    WHERE id = p_target_stream_id AND class_id = p_target_class_id
  ) THEN
    RAISE EXCEPTION 'transfer_student_enrolment: target stream % does not belong to class %', p_target_stream_id, p_target_class_id;
  END IF;

  -- Close active enrolment
  UPDATE public.student_enrolments
  SET
    status = 'completed',
    end_date = v_effective_date,
    exit_reason = COALESCE(p_reason, 'transferred_class')
  WHERE id = v_active_enrolment.id;

  -- Insert new active enrolment
  INSERT INTO public.student_enrolments (
    student_id,
    school_id,
    class_id,
    stream_id,
    academic_year_id,
    status,
    start_date,
    created_at
  ) VALUES (
    p_student_id,
    v_school_id,
    p_target_class_id,
    p_target_stream_id,
    v_academic_year_id,
    'active',
    v_effective_date,
    now()
  )
  RETURNING id INTO v_new_enrolment_id;

  RETURN v_new_enrolment_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. RPC: withdraw_student
-- Atomically closes current active enrolment with exit reason and updates student status.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_student(
  p_student_id UUID,
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_exit_reason TEXT DEFAULT 'withdrawn',
  p_final_status TEXT DEFAULT 'withdrawn'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_active_enrolment RECORD;
  v_effective_date DATE;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'withdraw_student: caller must be authenticated';
  END IF;

  v_effective_date := COALESCE(p_effective_date, CURRENT_DATE);

  -- Fetch active enrolment
  SELECT *
  INTO v_active_enrolment
  FROM public.student_enrolments
  WHERE student_id = p_student_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdraw_student: no active enrolment found for student %', p_student_id;
  END IF;

  -- Verify leadership in student school
  IF NOT public.is_leadership_in_school(v_active_enrolment.school_id) THEN
    RAISE EXCEPTION 'withdraw_student: caller lacks leadership privileges in school %', v_active_enrolment.school_id;
  END IF;

  -- Close active enrolment
  UPDATE public.student_enrolments
  SET
    status = 'withdrawn',
    end_date = v_effective_date,
    exit_reason = COALESCE(p_exit_reason, 'withdrawn')
  WHERE id = v_active_enrolment.id;

  -- Update student status
  UPDATE public.students
  SET status = COALESCE(p_final_status, 'withdrawn')
  WHERE id = p_student_id;

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- Grants on RPCs
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.transfer_student_enrolment(UUID, UUID, UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_student_enrolment(UUID, UUID, UUID, DATE, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.withdraw_student(UUID, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_student(UUID, DATE, TEXT, TEXT) TO authenticated;
