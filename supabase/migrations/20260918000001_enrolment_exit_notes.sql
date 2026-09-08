-- ==============================================================================
-- 20260918000001_enrolment_exit_notes.sql
--
-- Adds exit_notes column to student_enrolments table and updates withdraw_student
-- RPC to accept and persist p_exit_notes for full institutional audit integrity.
-- ==============================================================================

-- 1. Schema modification: add exit_notes to student_enrolments
ALTER TABLE public.student_enrolments
  ADD COLUMN IF NOT EXISTS exit_notes TEXT;

-- 2. Replace withdraw_student RPC with 5th parameter for exit_notes
DROP FUNCTION IF EXISTS public.withdraw_student(UUID, DATE, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.withdraw_student(
  p_student_id UUID,
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_exit_reason TEXT DEFAULT 'withdrawn',
  p_final_status TEXT DEFAULT 'withdrawn',
  p_exit_notes TEXT DEFAULT NULL
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

  -- Close active enrolment and record exit reason + notes
  UPDATE public.student_enrolments
  SET
    status = 'withdrawn',
    end_date = v_effective_date,
    exit_reason = COALESCE(p_exit_reason, 'withdrawn'),
    exit_notes = p_exit_notes
  WHERE id = v_active_enrolment.id;

  -- Update student status
  UPDATE public.students
  SET status = COALESCE(p_final_status, 'withdrawn')
  WHERE id = p_student_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.withdraw_student(UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;
