-- =============================================================================
-- P2B-2 + P2B-3 — gap detection & pacing suggestions (RECOMMEND ONLY)
-- AI/rules suggest. Humans decide. Never auto-assign or auto-grade.
-- Every suggestion stores evidence links + rationale.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.learning_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  suggestion_kind TEXT NOT NULL
    CHECK (suggestion_kind IN ('gap', 'pacing', 'intervention')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  -- [{ "kind": "learning_result", "id": "…", "label": "…" }]
  evidence_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_activity_id UUID REFERENCES public.learning_activities(id) ON DELETE SET NULL,
  suggested_activity_label TEXT,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'accepted', 'dismissed')),
  decided_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_suggestions_student_idx
  ON public.learning_suggestions(student_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS learning_suggestions_school_idx
  ON public.learning_suggestions(school_id, status);

-- Human decide: accept/dismiss (never silent auto-apply).
CREATE OR REPLACE FUNCTION public.decide_learning_suggestion(
  p_suggestion_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'decide_learning_suggestion: authentication required';
  END IF;
  IF p_status NOT IN ('accepted', 'dismissed') THEN
    RAISE EXCEPTION 'decide_learning_suggestion: status must be accepted or dismissed';
  END IF;

  SELECT id INTO v_person FROM public.people WHERE auth_user_id = auth.uid() LIMIT 1;

  UPDATE public.learning_suggestions
  SET status = p_status,
      decided_by = v_person,
      decided_at = now(),
      decision_note = p_note,
      updated_at = now()
  WHERE id = p_suggestion_id
    AND school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decide_learning_suggestion: not permitted or missing row';
  END IF;

  RETURN p_suggestion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_learning_suggestion(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_learning_suggestion(UUID, TEXT, TEXT) TO authenticated;

ALTER TABLE public.learning_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_suggestions_staff_all ON public.learning_suggestions;
CREATE POLICY learning_suggestions_staff_all ON public.learning_suggestions
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

DROP POLICY IF EXISTS learning_suggestions_guardian_read ON public.learning_suggestions;
CREATE POLICY learning_suggestions_guardian_read ON public.learning_suggestions
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.people pp ON pp.id = s.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
    OR student_id IN (
      SELECT sg.student_id FROM public.student_guardians sg
      JOIN public.people pp ON pp.id = sg.guardian_person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

COMMIT;
