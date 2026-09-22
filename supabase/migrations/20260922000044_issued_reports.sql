-- =============================================================================
-- P3-C — issued term reports (immutable historical documents)
-- Plan: docs/plans/2026-09-22-digital-learning-spine-P3.md
--
-- Live academic data ≠ issued historical document.
-- Issue stores a JSON snapshot; later gradebook edits never mutate it.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.issued_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_label TEXT NOT NULL,
  report_kind TEXT NOT NULL DEFAULT 'term_report'
    CHECK (report_kind IN ('term_report', 'results_slip')),
  snapshot JSONB NOT NULL,
  formula TEXT NOT NULL
    CHECK (formula IN ('mean', 'total', 'aggregate_division')),
  overall_value NUMERIC,
  overall_label TEXT,
  division_label TEXT,
  issued_by UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS issued_reports_student_idx
  ON public.issued_reports(student_id, term_label, issued_at DESC);
CREATE INDEX IF NOT EXISTS issued_reports_school_idx
  ON public.issued_reports(school_id, issued_at DESC);

-- Immutable: no UPDATE/DELETE on issued documents.
CREATE OR REPLACE FUNCTION public.prevent_issued_report_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'issued_reports: issued documents are immutable';
END;
$$;

DROP TRIGGER IF EXISTS issued_reports_no_update ON public.issued_reports;
CREATE TRIGGER issued_reports_no_update
  BEFORE UPDATE OR DELETE ON public.issued_reports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_issued_report_mutation();

CREATE OR REPLACE FUNCTION public.issue_term_report(
  p_school_id UUID,
  p_student_id UUID,
  p_term_label TEXT,
  p_report_kind TEXT,
  p_snapshot JSONB,
  p_formula TEXT,
  p_overall_value NUMERIC DEFAULT NULL,
  p_overall_label TEXT DEFAULT NULL,
  p_division_label TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person UUID;
  v_ver INT;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'issue_term_report: authentication required';
  END IF;
  IF p_snapshot IS NULL OR p_snapshot = '{}'::jsonb THEN
    RAISE EXCEPTION 'issue_term_report: snapshot is required';
  END IF;

  SELECT id INTO v_person FROM public.people WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'issue_term_report: no institutional identity';
  END IF;
  IF NOT public.is_school_staff_role(p_school_id, 'admin', 'principal', 'teacher') THEN
    RAISE EXCEPTION 'issue_term_report: not permitted';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_ver
  FROM public.issued_reports
  WHERE student_id = p_student_id
    AND term_label = p_term_label
    AND report_kind = p_report_kind;

  INSERT INTO public.issued_reports (
    school_id, student_id, term_label, report_kind, snapshot, formula,
    overall_value, overall_label, division_label, issued_by, version
  ) VALUES (
    p_school_id, p_student_id, p_term_label, p_report_kind, p_snapshot, p_formula,
    p_overall_value, p_overall_label, p_division_label, v_person, v_ver
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_term_report(UUID, UUID, TEXT, TEXT, JSONB, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_term_report(UUID, UUID, TEXT, TEXT, JSONB, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

ALTER TABLE public.issued_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS issued_reports_staff_read ON public.issued_reports;
CREATE POLICY issued_reports_staff_read ON public.issued_reports
  FOR SELECT TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher', 'bursar'));

DROP POLICY IF EXISTS issued_reports_family_read ON public.issued_reports;
CREATE POLICY issued_reports_family_read ON public.issued_reports
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
