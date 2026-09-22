-- =============================================================================
-- P2A-1 fix — quiz item PK is (quiz_id, question_id); there is no qi.id.
-- Also make attempt numbering race-safe via RPC.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_learning_quiz_attempt(
  p_attempt_id UUID,
  p_answers JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.learning_quiz_attempts%ROWTYPE;
  v_quiz public.learning_quizzes%ROWTYPE;
  v_items JSONB;
  v_result JSONB;
  v_result_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'submit_learning_quiz_attempt: authentication required';
  END IF;

  SELECT * INTO v_attempt
  FROM public.learning_quiz_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'submit_learning_quiz_attempt: attempt not found';
  END IF;
  IF v_attempt.state <> 'draft' THEN
    RAISE EXCEPTION 'submit_learning_quiz_attempt: attempt already submitted';
  END IF;

  SELECT * INTO v_quiz FROM public.learning_quizzes WHERE id = v_attempt.quiz_id;
  IF v_quiz.learning_activity_id IS NULL THEN
    RAISE EXCEPTION 'submit_learning_quiz_attempt: quiz is not linked to a learning_activity';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id', qi.question_id::text,
    'question_type', q.question_type,
    'answer_key', q.answer_key,
    'marks', qi.marks
  )), '[]'::jsonb) INTO v_items
  FROM public.learning_quiz_items qi
  JOIN public.learning_quiz_questions q ON q.id = qi.question_id
  WHERE qi.quiz_id = v_attempt.quiz_id;

  v_result := public.score_quiz_answers(v_items, COALESCE(p_answers, v_attempt.answers));

  UPDATE public.learning_quiz_attempts
  SET answers = COALESCE(p_answers, answers),
      state = 'scored',
      auto_score_breakdown = v_result->'breakdown',
      score = (v_result->>'score')::numeric,
      max_score = (v_result->>'max_score')::numeric,
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_attempt_id;

  INSERT INTO public.learning_results (
    school_id, student_id, learning_activity_id, quiz_id, result_source,
    score, max_score, feedback, rubric_marks, marked_by, marked_at
  ) VALUES (
    v_attempt.school_id,
    v_attempt.student_id,
    v_quiz.learning_activity_id,
    v_attempt.quiz_id,
    'quiz',
    (v_result->>'score')::numeric,
    (v_result->>'max_score')::numeric,
    'Auto-scored quiz attempt #' || v_attempt.attempt_no || ' (deterministic key).',
    v_result->'breakdown',
    COALESCE(v_quiz.created_by, (SELECT person_id FROM public.students WHERE id = v_attempt.student_id)),
    now()
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_learning_quiz_attempt(
  p_school_id UUID,
  p_quiz_id UUID,
  p_student_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_no INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'start_learning_quiz_attempt: authentication required';
  END IF;

  SELECT id INTO v_id FROM public.learning_quiz_attempts
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id AND state = 'draft'
  ORDER BY attempt_no DESC LIMIT 1;
  IF FOUND THEN RETURN v_id; END IF;

  SELECT COALESCE(MAX(attempt_no), 0) + 1 INTO v_no
  FROM public.learning_quiz_attempts
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id;

  INSERT INTO public.learning_quiz_attempts (
    school_id, quiz_id, student_id, attempt_no, state, answers
  ) VALUES (p_school_id, p_quiz_id, p_student_id, v_no, 'draft', '{}'::jsonb)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_learning_quiz_attempt(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_learning_quiz_attempt(UUID, UUID, UUID) TO authenticated;

COMMIT;
