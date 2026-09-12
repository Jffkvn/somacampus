-- ==============================================================================
-- SOMACAMPUS MIGRATION: SCORECARD ATTESTATION RULE (bypass must be explicit)
-- Migration ID: 20260922000015
-- ==============================================================================
-- Implements the adopted governance rule from the round-3 review: a timetable
-- submitted WITHOUT its own solver run must not silently pass approval on a
-- trivially-true gate. approve_timetable_atomic now requires, when the
-- timetable has NO constraint_scorecard, an explicit non-empty leadership
-- bypass note (p_note) which is stored on the row (approval_note). A recorded
-- scorecard with hardViolationsCount > 0 remains a hard block - the bypass
-- covers MISSING evidence, never recorded violations.
--
-- Also adds timetables.approval_note for the stored bypass reason.
--
-- Idempotent: conditional ALTER, CREATE OR REPLACE.
-- ==============================================================================

ALTER TABLE public.timetables
  ADD COLUMN IF NOT EXISTS approval_note TEXT;

CREATE OR REPLACE FUNCTION public.approve_timetable_atomic(
  p_timetable_id UUID,
  p_approved_by UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tt public.timetables%ROWTYPE;
  v_hard_violations INT;
  v_approver_person UUID;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'approve_timetable_atomic: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Fetch and lock timetable
  SELECT * INTO v_tt FROM public.timetables WHERE id = p_timetable_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timetable % not found', p_timetable_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Leadership check
  IF NOT public.is_leadership_in_school(v_tt.school_id) THEN
    RAISE EXCEPTION 'approve_timetable_atomic: caller is not authorized leadership for school %', v_tt.school_id
      USING ERRCODE = '42501';
  END IF;

  -- 4. Invariant check: zero hard constraint violations (hard block - the
  --    bypass below covers a MISSING scorecard, never recorded violations).
  v_hard_violations := COALESCE((v_tt.constraint_scorecard->>'hardViolationsCount')::int, 0);
  IF v_hard_violations > 0 THEN
    RAISE EXCEPTION 'Timetable % has % hard constraint violations; cannot approve', p_timetable_id, v_hard_violations
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Approver employee verification
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_approved_by AND e.school_id = v_tt.school_id
  ) THEN
    RAISE EXCEPTION 'Approver employee % does not belong to school %', p_approved_by, v_tt.school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Attestation rule: a timetable with NO scorecard may only be approved
  --    with an explicit leadership bypass note (stored for audit). Recorded
  --    hard violations are never bypassable (checked above).
  IF v_tt.constraint_scorecard IS NULL THEN
    IF p_note IS NULL OR btrim(p_note) = '' THEN
      RAISE EXCEPTION 'approve_timetable_atomic: timetable % has no solver scorecard - a leadership bypass note is required to approve it', p_timetable_id
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT p.id INTO v_approver_person
  FROM public.people p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  -- 7. Transition status
  UPDATE public.timetables
  SET status = 'approved',
      approved_by = p_approved_by,
      approved_at = now(),
      updated_at = now(),
      approval_note = CASE
        WHEN v_tt.constraint_scorecard IS NULL
        THEN 'Scorecard bypass approved: ' || btrim(p_note)
        ELSE v_tt.approval_note
      END
  WHERE id = p_timetable_id;

  RETURN jsonb_build_object(
    'success', true,
    'timetable_id', p_timetable_id,
    'status', 'approved',
    'approved_by', p_approved_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_timetable_atomic(UUID, UUID, TEXT) TO authenticated;

-- One canonical signature: the 2-arg overload predates the attestation rule
-- and allowed a silent NULL-scorecard pass; 2-arg callers resolve via the
-- p_note default.
DROP FUNCTION IF EXISTS public.approve_timetable_atomic(UUID, UUID);
