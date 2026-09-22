-- =============================================================================
-- P2A-2 — quiz behaviour polish
-- Timers · shuffle · retake policy · delayed release · objective links.
-- Plan: docs/plans/2026-09-22-digital-learning-spine-P2.md
-- =============================================================================

BEGIN;

ALTER TABLE public.learning_quizzes
  ADD COLUMN IF NOT EXISTS time_limit_seconds INT CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
  ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_retakes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS release_results_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS objective_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.learning_quiz_attempts
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Deadline: expired draft attempts can still submit until expires_at + grace.
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
  IF v_quiz.allow_retakes IS FALSE AND v_attempt.attempt_no > 1 THEN
    RAISE EXCEPTION 'submit_learning_quiz_attempt: retakes are not allowed';
  END IF;
  -- 5-minute grace after timer expiry (weak network).
  IF v_attempt.expires_at IS NOT NULL AND now() > v_attempt.expires_at + interval '5 minutes' THEN
    RAISE EXCEPTION 'submit_learning_quiz_attempt: time limit exceeded';
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
    CASE
      WHEN v_quiz.release_results_at IS NOT NULL AND now() < v_quiz.release_results_at
        THEN 'Submitted — results release at ' || v_quiz.release_results_at
      ELSE 'Auto-scored quiz attempt #' || v_attempt.attempt_no || ' (deterministic key).'
    END,
    CASE
      WHEN v_quiz.release_results_at IS NOT NULL AND now() < v_quiz.release_results_at THEN NULL
      ELSE v_result->'breakdown'
    END,
    COALESCE(v_quiz.created_by, (SELECT person_id FROM public.students WHERE id = v_attempt.student_id)),
    now()
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

-- Start attempt: set expiry from quiz timer; honour allow_retakes + max_attempts.
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
  v_quiz public.learning_quizzes%ROWTYPE;
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'start_learning_quiz_attempt: authentication required';
  END IF;

  SELECT id INTO v_id FROM public.learning_quiz_attempts
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id AND state = 'draft'
  ORDER BY attempt_no DESC LIMIT 1;
  IF FOUND THEN RETURN v_id; END IF;

  SELECT * INTO v_quiz FROM public.learning_quizzes WHERE id = p_quiz_id;
  SELECT COUNT(*) INTO v_count FROM public.learning_quiz_attempts
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id;

  IF v_quiz.allow_retakes IS FALSE AND v_count >= 1 THEN
    RAISE EXCEPTION 'start_learning_quiz_attempt: retakes are not allowed';
  END IF;
  IF v_count >= v_quiz.max_attempts THEN
    RAISE EXCEPTION 'start_learning_quiz_attempt: max attempts reached';
  END IF;

  SELECT COALESCE(MAX(attempt_no), 0) + 1 INTO v_no
  FROM public.learning_quiz_attempts
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id;

  INSERT INTO public.learning_quiz_attempts (
    school_id, quiz_id, student_id, attempt_no, state, answers,
    started_at, expires_at
  ) VALUES (
    p_school_id, p_quiz_id, p_student_id, v_no, 'draft', '{}'::jsonb,
    now(),
    CASE WHEN v_quiz.time_limit_seconds IS NOT NULL
      THEN now() + make_interval(secs => v_quiz.time_limit_seconds)
      ELSE NULL
    END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMIT;
