-- =============================================================================
-- Digital Learning Spine P2A-1 — deterministic quizzes
-- Plan: docs/plans/2026-09-22-digital-learning-spine-P2.md
--
-- Types (v1): MCQ | true_false | matching | short_answer (key).
-- Score = deterministic key sum. AI never writes score/grade/marks.
-- Results land in learning_results with result_source = 'quiz'.
-- =============================================================================

BEGIN;

-- 1. Question bank (school-scoped, reusable)
CREATE TABLE IF NOT EXISTS public.learning_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL
    CHECK (question_type IN ('mcq', 'true_false', 'matching', 'short_answer')),
  prompt TEXT NOT NULL,
  -- MCQ / TF: [{ "id": "a", "text": "..." }]
  -- matching: { "pairs": [{ "left": "...", "right": "..." }] }
  -- short_answer: null
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- mcq: { "correct_option_id": "b" }
  -- true_false: { "correct": true }
  -- matching: { "correct_pairs": [{ "left": "...", "right": "..." }] }
  -- short_answer: { "accepted": ["56", "fifty six"], "case_sensitive": false }
  answer_key JSONB NOT NULL,
  default_marks NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (default_marks > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_quiz_questions_school_idx
  ON public.learning_quiz_questions(school_id) WHERE is_active;

-- 2. Quiz (assessment artifact; parent law matches learning_activities)
CREATE TABLE IF NOT EXISTS public.learning_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teaching_sequence_id UUID REFERENCES public.teaching_sequences(id) ON DELETE SET NULL,
  online_offering_id UUID REFERENCES public.online_offerings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  pass_mark NUMERIC(6,2) CHECK (pass_mark IS NULL OR pass_mark >= 0),
  max_attempts INT NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_quiz_parent_present
    CHECK (num_nonnulls(teaching_sequence_id, online_offering_id) >= 1)
);

CREATE INDEX IF NOT EXISTS learning_quizzes_offering_idx
  ON public.learning_quizzes(online_offering_id) WHERE is_published;
CREATE INDEX IF NOT EXISTS learning_quizzes_sequence_idx
  ON public.learning_quizzes(teaching_sequence_id) WHERE is_published;

-- 3. Quiz items (ordered)
CREATE TABLE IF NOT EXISTS public.learning_quiz_items (
  quiz_id UUID NOT NULL REFERENCES public.learning_quizzes(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.learning_quiz_questions(id) ON DELETE RESTRICT,
  sort_order INT NOT NULL DEFAULT 0,
  marks NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (marks > 0),
  PRIMARY KEY (quiz_id, question_id)
);

-- 4. Attempts (draft autosave → submitted; history never destroyed)
CREATE TABLE IF NOT EXISTS public.learning_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.learning_quizzes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL CHECK (attempt_no >= 1),
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'submitted', 'scored')),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- question_id -> { points, max_points, correct }
  auto_score_breakdown JSONB,
  score NUMERIC(6,2),
  max_score NUMERIC(6,2),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, student_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS learning_quiz_attempts_student_idx
  ON public.learning_quiz_attempts(student_id, quiz_id, attempt_no DESC);
CREATE INDEX IF NOT EXISTS learning_quiz_attempts_draft_idx
  ON public.learning_quiz_attempts(student_id) WHERE state = 'draft';

-- 5. Deterministic scoring (SQL mirror of app scorer for RPC re-check)
CREATE OR REPLACE FUNCTION public.score_quiz_answers(
  p_items JSONB,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_item JSONB;
  v_qid TEXT;
  v_type TEXT;
  v_key JSONB;
  v_marks NUMERIC;
  v_ans JSONB;
  v_points NUMERIC := 0;
  v_max NUMERIC := 0;
  v_break JSONB := '{}'::jsonb;
  v_ok BOOLEAN;
  v_acc TEXT;
  v_norm TEXT;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_qid := v_item->>'question_id';
    v_type := v_item->>'question_type';
    v_key := v_item->'answer_key';
    v_marks := COALESCE((v_item->>'marks')::numeric, 1);
    v_ans := p_answers->v_qid;
    v_max := v_max + v_marks;
    v_ok := false;

    IF v_type = 'mcq' THEN
      v_ok := (v_ans->>'option_id') IS NOT NULL
        AND (v_ans->>'option_id') = (v_key->>'correct_option_id');
    ELSIF v_type = 'true_false' THEN
      v_ok := (v_ans->>'value') IS NOT NULL
        AND (v_ans->>'value')::boolean = (v_key->>'correct')::boolean;
    ELSIF v_type = 'short_answer' THEN
      v_norm := lower(btrim(COALESCE(v_ans->>'text', '')));
      FOR v_acc IN SELECT jsonb_array_elements_text(COALESCE(v_key->'accepted', '[]'::jsonb))
      LOOP
        IF v_key->>'case_sensitive' = 'true' THEN
          IF btrim(COALESCE(v_ans->>'text', '')) = v_acc THEN v_ok := true; END IF;
        ELSE
          IF v_norm = lower(v_acc) THEN v_ok := true; END IF;
        END IF;
      END LOOP;
    ELSIF v_type = 'matching' THEN
      -- answers: [{left,right}] must match correct_pairs as a set
      v_ok := (
        SELECT COALESCE(bool_and(
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(v_key->'correct_pairs', '[]'::jsonb)) cp
            WHERE cp->>'left' = a->>'left' AND cp->>'right' = a->>'right'
          )
        ), false)
        FROM jsonb_array_elements(COALESCE(v_ans->'pairs', '[]'::jsonb)) a
      ) AND (SELECT count(*) FROM jsonb_array_elements(COALESCE(v_ans->'pairs', '[]'::jsonb))) =
           (SELECT count(*) FROM jsonb_array_elements(COALESCE(v_key->'correct_pairs', '[]'::jsonb)));
    END IF;

    IF v_ok THEN v_points := v_points + v_marks; END IF;
    v_break := v_break || jsonb_build_object(
      v_qid, jsonb_build_object('points', CASE WHEN v_ok THEN v_marks ELSE 0 END, 'max_points', v_marks, 'correct', v_ok)
    );
  END LOOP;

  RETURN jsonb_build_object('score', v_points, 'max_score', v_max, 'breakdown', v_break);
END;
$$;

REVOKE ALL ON FUNCTION public.score_quiz_answers(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.score_quiz_answers(JSONB, JSONB) TO authenticated;

-- 6. Submit + score + write learning_results in one RPC
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id', qi.id,
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
    school_id, student_id, assignment_id, result_source, score, max_score,
    feedback, rubric_marks, marked_by, marked_at
  )
  SELECT
    v_attempt.school_id,
    v_attempt.student_id,
    NULL,
    'quiz',
    (v_result->>'score')::numeric,
    (v_result->>'max_score')::numeric,
    'Auto-scored quiz attempt #' || v_attempt.attempt_no || ' (deterministic key).',
    v_result->'breakdown',
    COALESCE(q.created_by, v_attempt.student_id),
    now()
  FROM public.learning_quizzes q
  WHERE q.id = v_attempt.quiz_id
  RETURNING id INTO v_result_id;

  -- learning_results target must be activity OR assignment; attach activity if quiz has one later.
  -- For P2A-1 quizzes without a dedicated activity row we still need a target —
  -- mirror score onto a synthetic-free path: require activity link on quiz create.
  IF v_result_id IS NULL THEN
    RAISE EXCEPTION 'submit_learning_quiz_attempt: failed to write learning_results';
  END IF;

  RETURN v_result_id;
END;
$$;

-- Fix: learning_results requires learning_activity_id OR assignment_id (CHECK).
-- Add quiz_id column so quiz results can target the quiz's linked activity.
ALTER TABLE public.learning_quizzes
  ADD COLUMN IF NOT EXISTS learning_activity_id UUID REFERENCES public.learning_activities(id) ON DELETE SET NULL;

ALTER TABLE public.learning_results
  ADD COLUMN IF NOT EXISTS quiz_id UUID REFERENCES public.learning_quizzes(id) ON DELETE SET NULL;

-- result_source must accept deterministic quiz scores (one gradebook).
ALTER TABLE public.learning_results DROP CONSTRAINT IF EXISTS learning_results_result_source_check;
ALTER TABLE public.learning_results
  ADD CONSTRAINT learning_results_result_source_check
  CHECK (result_source IN ('rubric', 'score', 'observation', 'quiz'));

-- Redefine insert in submit RPC to use quiz.learning_activity_id
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
    'question_id', qi.id::text,
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

-- 7. RLS
ALTER TABLE public.learning_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quiz_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_quiz_questions_staff_all ON public.learning_quiz_questions;
CREATE POLICY learning_quiz_questions_staff_all ON public.learning_quiz_questions
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  );

DROP POLICY IF EXISTS learning_quizzes_staff_all ON public.learning_quizzes;
CREATE POLICY learning_quizzes_staff_all ON public.learning_quizzes
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  );

DROP POLICY IF EXISTS learning_quizzes_learner_read ON public.learning_quizzes;
CREATE POLICY learning_quizzes_learner_read ON public.learning_quizzes
  FOR SELECT TO authenticated
  USING (
    is_published
    AND (
      online_offering_id IN (
        SELECT oe.offering_id FROM public.online_enrolments oe
        JOIN public.students st ON st.id = oe.student_id
        JOIN public.people pp ON pp.id = st.person_id
        WHERE pp.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS learning_quiz_items_staff_all ON public.learning_quiz_items;
CREATE POLICY learning_quiz_items_staff_all ON public.learning_quiz_items
  FOR ALL TO authenticated
  USING (
    quiz_id IN (
      SELECT id FROM public.learning_quizzes q
      WHERE q.school_id IN (
        SELECT ur.school_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
      )
    )
  )
  WITH CHECK (
    quiz_id IN (
      SELECT id FROM public.learning_quizzes q
      WHERE q.school_id IN (
        SELECT ur.school_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
      )
    )
  );

DROP POLICY IF EXISTS learning_quiz_items_learner_read ON public.learning_quiz_items;
CREATE POLICY learning_quiz_items_learner_read ON public.learning_quiz_items
  FOR SELECT TO authenticated
  USING (
    quiz_id IN (
      SELECT id FROM public.learning_quizzes q
      WHERE q.is_published
        AND q.online_offering_id IN (
          SELECT oe.offering_id FROM public.online_enrolments oe
          JOIN public.students st ON st.id = oe.student_id
          JOIN public.people pp ON pp.id = st.person_id
          WHERE pp.auth_user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS learning_quiz_attempts_student_rw ON public.learning_quiz_attempts;
CREATE POLICY learning_quiz_attempts_student_rw ON public.learning_quiz_attempts
  FOR ALL TO authenticated
  USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.people pp ON pp.id = s.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    state = 'draft'
    AND student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.people pp ON pp.id = s.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_quiz_attempts_staff_read ON public.learning_quiz_attempts;
CREATE POLICY learning_quiz_attempts_staff_read ON public.learning_quiz_attempts
  FOR SELECT TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );

COMMIT;
