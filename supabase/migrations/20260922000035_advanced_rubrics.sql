-- =============================================================================
-- P2A-3 — advanced rubrics (weights · comments · evidence · moderation)
-- Total stays a deterministic function of teacher taps (explicit weights).
-- =============================================================================

BEGIN;

ALTER TABLE public.learning_rubrics
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS objective_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.learning_results
  ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'not_required'
    CHECK (moderation_state IN ('not_required', 'pending', 'approved', 'changes_requested')),
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_note TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.learning_results(id) ON DELETE SET NULL;

-- Weighted deterministic total (weight defaults to 1).
CREATE OR REPLACE FUNCTION public.compute_rubric_total(p_marks JSONB)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(SUM((m->>'points')::numeric * COALESCE((m->>'weight')::numeric, 1)), 0)
  FROM jsonb_array_elements(COALESCE(p_marks, '[]'::jsonb)) AS m
$$;

-- Teacher revise: new result row supersedes old (history kept, never silent overwrite).
CREATE OR REPLACE FUNCTION public.revise_learning_result(
  p_result_id UUID,
  p_score NUMERIC DEFAULT NULL,
  p_feedback TEXT DEFAULT NULL,
  p_rubric_marks JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.learning_results%ROWTYPE;
  v_new_id UUID;
  v_score NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'revise_learning_result: authentication required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'revise_learning_result: override reason is required';
  END IF;

  SELECT * INTO v_old FROM public.learning_results WHERE id = p_result_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revise_learning_result: result not found';
  END IF;

  v_score := COALESCE(p_score, public.compute_rubric_total(p_rubric_marks), v_old.score);

  INSERT INTO public.learning_results (
    school_id, student_id, learning_activity_id, assignment_id, submission_id,
    learning_rubric_id, quiz_id, result_source, score, max_score, feedback, rubric_marks,
    marked_by, marked_at
  ) VALUES (
    v_old.school_id, v_old.student_id, v_old.learning_activity_id, v_old.assignment_id, v_old.submission_id,
    v_old.learning_rubric_id, v_old.quiz_id, v_old.result_source,
    v_score, v_old.max_score,
    COALESCE(p_feedback, v_old.feedback),
    COALESCE(p_rubric_marks, v_old.rubric_marks),
    (SELECT id FROM public.people WHERE auth_user_id = auth.uid() LIMIT 1),
    now()
  )
  RETURNING id INTO v_new_id;

  UPDATE public.learning_results
  SET superseded_by = v_new_id
  WHERE id = p_result_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revise_learning_result(UUID, NUMERIC, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_learning_result(UUID, NUMERIC, TEXT, JSONB, TEXT) TO authenticated;

-- Moderation: second teacher approves / requests changes (never auto).
CREATE OR REPLACE FUNCTION public.moderate_learning_result(
  p_result_id UUID,
  p_state TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moderator UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'moderate_learning_result: authentication required';
  END IF;
  IF p_state NOT IN ('approved', 'changes_requested') THEN
    RAISE EXCEPTION 'moderate_learning_result: state must be approved or changes_requested';
  END IF;

  SELECT id INTO v_moderator FROM public.people WHERE auth_user_id = auth.uid() LIMIT 1;

  UPDATE public.learning_results
  SET moderation_state = p_state,
      moderated_by = v_moderator,
      moderation_note = p_note,
      updated_at = now()
  WHERE id = p_result_id
    AND school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'moderate_learning_result: not permitted or missing row';
  END IF;

  RETURN p_result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_learning_result(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_learning_result(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
