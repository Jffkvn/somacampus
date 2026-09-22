-- =============================================================================
-- P3-D — exam paper production
-- Plan: docs/plans/2026-09-22-digital-learning-spine-P3.md
-- Past-paper structure template + teacher brief → backend AI DRAFT →
-- teacher edit/approve → PRINT. AI never writes marks/grades.
-- =============================================================================

BEGIN;

-- 1. Past-paper structure templates (heuristics from uploaded papers)
CREATE TABLE IF NOT EXISTS public.exam_paper_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_label TEXT,
  -- { "sections": [{ "code":"A", "title":"Short questions", "n":10, "marksEach":2 }], "timeMinutes": 90, "totalMarks": 50, "stems": ["Calculate…"] }
  structure JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Papers (draft → approved → printed); versions keep history
CREATE TABLE IF NOT EXISTS public.exam_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.exam_paper_templates(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  term_label TEXT NOT NULL,
  -- Teacher brief (control input for AI draft)
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'printed')),
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Paper content versions (AI draft vs teacher edit) — printable payload
CREATE TABLE IF NOT EXISTS public.exam_paper_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES public.exam_papers(id) ON DELETE CASCADE,
  version INT NOT NULL,
  -- { "header": {...}, "sections": [{ "code", "title", "questions": [{ "n", "text", "marks", "topic" }] }] }
  content JSONB NOT NULL,
  origin TEXT NOT NULL DEFAULT 'ai_draft'
    CHECK (origin IN ('ai_draft', 'teacher_edit', 'approved')),
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (paper_id, version)
);

CREATE INDEX IF NOT EXISTS exam_papers_school_idx ON public.exam_papers(school_id, status);
CREATE INDEX IF NOT EXISTS exam_paper_versions_paper_idx ON public.exam_paper_versions(paper_id, version DESC);

-- Approve = teacher-owned. AI never finalises.
CREATE OR REPLACE FUNCTION public.approve_exam_paper(
  p_paper_id UUID,
  p_content JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paper public.exam_papers%ROWTYPE;
  v_ver INT;
  v_id UUID;
  v_person UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'approve_exam_paper: authentication required';
  END IF;
  SELECT id INTO v_person FROM public.people WHERE auth_user_id = auth.uid() LIMIT 1;

  SELECT * INTO v_paper FROM public.exam_papers WHERE id = p_paper_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_exam_paper: paper not found';
  END IF;
  IF NOT public.is_school_staff_role(v_paper.school_id, 'admin', 'principal', 'teacher') THEN
    RAISE EXCEPTION 'approve_exam_paper: not permitted';
  END IF;
  IF p_content IS NULL THEN
    RAISE EXCEPTION 'approve_exam_paper: approved content is required (teacher owns the paper)';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_ver
  FROM public.exam_paper_versions WHERE paper_id = p_paper_id;

  INSERT INTO public.exam_paper_versions (paper_id, version, content, origin, created_by)
  VALUES (p_paper_id, v_ver, p_content, 'approved', v_person)
  RETURNING id INTO v_id;

  UPDATE public.exam_papers
  SET status = 'approved', version = v_ver, updated_at = now()
  WHERE id = p_paper_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_exam_paper(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_exam_paper(UUID, JSONB) TO authenticated;

ALTER TABLE public.exam_paper_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_paper_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_paper_templates_staff ON public.exam_paper_templates;
CREATE POLICY exam_paper_templates_staff ON public.exam_paper_templates
  FOR ALL TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'));

DROP POLICY IF EXISTS exam_papers_staff ON public.exam_papers;
CREATE POLICY exam_papers_staff ON public.exam_papers
  FOR ALL TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'));

DROP POLICY IF EXISTS exam_paper_versions_staff ON public.exam_paper_versions;
CREATE POLICY exam_paper_versions_staff ON public.exam_paper_versions
  FOR ALL TO authenticated
  USING (
    paper_id IN (
      SELECT id FROM public.exam_papers p
      WHERE public.is_school_staff_role(p.school_id, 'admin', 'principal', 'teacher')
    )
  )
  WITH CHECK (
    paper_id IN (
      SELECT id FROM public.exam_papers p
      WHERE public.is_school_staff_role(p.school_id, 'admin', 'principal', 'teacher')
    )
  );

COMMIT;
