-- =============================================================================
-- P2A-1 fix — learners can read quiz stems for published quizzes.
-- Answer keys stay teacher-scoped (students must never receive keys).
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS learning_quiz_questions_learner_read ON public.learning_quiz_questions;
CREATE POLICY learning_quiz_questions_learner_read ON public.learning_quiz_questions
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT qi.question_id FROM public.learning_quiz_items qi
      JOIN public.learning_quizzes q ON q.id = qi.quiz_id
      WHERE q.is_published
        AND q.online_offering_id IN (
          SELECT oe.offering_id FROM public.online_enrolments oe
          JOIN public.students st ON st.id = oe.student_id
          JOIN public.people pp ON pp.id = st.person_id
          WHERE pp.auth_user_id = auth.uid()
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

COMMIT;

BEGIN;
-- Column-level: students (and any authenticated client) must never SELECT answer_key.
-- Staff read keys via SECURITY DEFINER RPC only.
REVOKE SELECT ON public.learning_quiz_questions FROM PUBLIC;
REVOKE SELECT ON public.learning_quiz_questions FROM authenticated;
GRANT SELECT (id, school_id, question_type, prompt, options, default_marks, is_active, created_by, created_at, updated_at)
  ON public.learning_quiz_questions TO authenticated;

CREATE OR REPLACE FUNCTION public.get_quiz_answer_keys(p_quiz_id UUID)
RETURNS TABLE (question_id UUID, answer_key JSONB)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT qi.question_id, q.answer_key
  FROM public.learning_quiz_items qi
  JOIN public.learning_quiz_questions q ON q.id = qi.question_id
  WHERE qi.quiz_id = p_quiz_id
    AND q.school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher')
    );
$$;

REVOKE ALL ON FUNCTION public.get_quiz_answer_keys(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quiz_answer_keys(UUID) TO authenticated;

COMMIT;
