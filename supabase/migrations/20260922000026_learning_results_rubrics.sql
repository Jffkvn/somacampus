-- =============================================================================
-- Digital Learning Spine M5 — rubric marking + minimal gradebook
-- Charter: docs/plans/2026-09-22-digital-learning-spine.md §10
-- AI never writes score/grade/marks. Teacher owns every human-marked result.
-- Deterministic total = sum of selected criterion level points.
-- =============================================================================

BEGIN;

-- 1. Rubric definitions (criteria × levels). JSONB keeps P0 lean; criteria
--    shape: [{ "id": "...", "title": "...", "levels": [{ "value": 0..n, "label": "...", "points": number }] }]
CREATE TABLE IF NOT EXISTS public.learning_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_rubrics_school_idx ON public.learning_rubrics(school_id);

-- 2. Gradebook — one row per student × activity/assignment result
CREATE TABLE IF NOT EXISTS public.learning_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  learning_activity_id UUID REFERENCES public.learning_activities(id) ON DELETE SET NULL,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES public.learning_submissions(id) ON DELETE SET NULL,
  learning_rubric_id UUID REFERENCES public.learning_rubrics(id) ON DELETE SET NULL,
  result_source TEXT NOT NULL DEFAULT 'rubric'
    CHECK (result_source IN ('rubric', 'score', 'observation')),
  score NUMERIC,
  max_score NUMERIC,
  feedback TEXT,
  -- [{ "criterionId": "...", "criterionTitle": "...", "level": n, "label": "...", "points": n }]
  rubric_marks JSONB,
  marked_by UUID NOT NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_results_target_present
    CHECK (num_nonnulls(learning_activity_id, assignment_id) >= 1),
  CONSTRAINT learning_results_score_sane
    CHECK (score IS NULL OR max_score IS NULL OR (score >= 0 AND score <= max_score))
);

CREATE INDEX IF NOT EXISTS learning_results_student_idx ON public.learning_results(student_id);
CREATE INDEX IF NOT EXISTS learning_results_activity_idx ON public.learning_results(learning_activity_id);
CREATE INDEX IF NOT EXISTS learning_results_assignment_idx ON public.learning_results(assignment_id);
CREATE INDEX IF NOT EXISTS learning_results_marked_idx ON public.learning_results(marked_at DESC);
-- Latest result per student×target is selected in the service (NULLs make
-- partial unique indexes unreliable across activity vs assignment targets).

-- 3. Deterministic rubric total (teacher taps levels; system sums points)
CREATE OR REPLACE FUNCTION public.compute_rubric_total(p_marks JSONB)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(SUM((m->>'points')::numeric), 0)
  FROM jsonb_array_elements(COALESCE(p_marks, '[]'::jsonb)) AS m
$$;

REVOKE ALL ON FUNCTION public.compute_rubric_total(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_rubric_total(JSONB) TO authenticated;

-- 4. Teacher mark RPC — writes score from rubric marks only (never AI)
CREATE OR REPLACE FUNCTION public.record_learning_result(
  p_school_id UUID,
  p_student_id UUID,
  p_marked_by UUID,
  p_learning_activity_id UUID DEFAULT NULL,
  p_assignment_id UUID DEFAULT NULL,
  p_submission_id UUID DEFAULT NULL,
  p_learning_rubric_id UUID DEFAULT NULL,
  p_result_source TEXT DEFAULT 'rubric',
  p_score NUMERIC DEFAULT NULL,
  p_max_score NUMERIC DEFAULT NULL,
  p_feedback TEXT DEFAULT NULL,
  p_rubric_marks JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score NUMERIC;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_learning_result: authentication required';
  END IF;
  IF p_learning_activity_id IS NULL AND p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'record_learning_result: learning_activity_id or assignment_id is required';
  END IF;
  IF p_result_source = 'rubric' THEN
    v_score := public.compute_rubric_total(p_rubric_marks);
  ELSE
    v_score := p_score;
  END IF;

  INSERT INTO public.learning_results (
    school_id, student_id, learning_activity_id, assignment_id, submission_id,
    learning_rubric_id, result_source, score, max_score, feedback, rubric_marks,
    marked_by, marked_at
  ) VALUES (
    p_school_id, p_student_id, p_learning_activity_id, p_assignment_id, p_submission_id,
    p_learning_rubric_id, p_result_source, v_score, p_max_score, p_feedback, p_rubric_marks,
    p_marked_by, now()
  )
  RETURNING id INTO v_id;

  -- Mirror human mark onto the assignment roster row when present
  IF p_assignment_id IS NOT NULL THEN
    UPDATE public.student_submissions
    SET score = v_score,
        teacher_feedback = p_feedback,
        teacher_review_status = 'reviewed'
    WHERE assignment_id = p_assignment_id AND student_id = p_student_id;
  END IF;

  -- Close the photo submission state
  IF p_submission_id IS NOT NULL THEN
    UPDATE public.learning_submissions
    SET state = 'reviewed', reviewed_at = now(), updated_at = now()
    WHERE id = p_submission_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_learning_result(UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_learning_result(UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated;

-- 5. RLS
ALTER TABLE public.learning_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_rubrics_staff_all ON public.learning_rubrics;
CREATE POLICY learning_rubrics_staff_all ON public.learning_rubrics
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );

DROP POLICY IF EXISTS learning_results_staff_all ON public.learning_results;
CREATE POLICY learning_results_staff_all ON public.learning_results
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );

DROP POLICY IF EXISTS learning_results_student_read ON public.learning_results;
CREATE POLICY learning_results_student_read ON public.learning_results
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT st.id FROM public.students st
      JOIN public.people p ON p.id = st.person_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_results_guardian_read ON public.learning_results;
CREATE POLICY learning_results_guardian_read ON public.learning_results
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT sg.student_id FROM public.student_guardians sg
      JOIN public.people p ON p.id = sg.guardian_person_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

COMMIT;
