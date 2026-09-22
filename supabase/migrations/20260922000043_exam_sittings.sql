-- =============================================================================
-- P3-B — thin exam sitting + human mark entry
-- Plan: docs/plans/2026-09-22-digital-learning-spine-P3.md
-- Sitting container + marks. NOT an exam hall / proctor / timer.
-- Marks → learning_results (result_source='exam'). AI never writes marks.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_sittings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  term_label TEXT NOT NULL,
  title TEXT NOT NULL,
  exam_date DATE,
  max_marks NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
  venue_note TEXT,
  delivery TEXT NOT NULL DEFAULT 'in_person_only'
    CHECK (delivery IN ('in_person_only', 'pdf_allowed')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'marks_entered', 'finalised')),
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  sitting_id UUID NOT NULL REFERENCES public.exam_sittings(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  score NUMERIC(6,2) CHECK (score IS NULL OR score >= 0),
  note TEXT,
  learning_result_id UUID REFERENCES public.learning_results(id) ON DELETE SET NULL,
  entered_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sitting_id, student_id)
);

CREATE INDEX IF NOT EXISTS exam_sittings_school_idx ON public.exam_sittings(school_id, exam_date DESC);
CREATE INDEX IF NOT EXISTS exam_marks_sitting_idx ON public.exam_marks(sitting_id);

CREATE OR REPLACE FUNCTION public.record_exam_mark(
  p_sitting_id UUID,
  p_student_id UUID,
  p_score NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sitting public.exam_sittings%ROWTYPE;
  v_person UUID;
  v_result_id UUID;
  v_mark_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_exam_mark: authentication required';
  END IF;
  IF p_score IS NULL THEN
    RAISE EXCEPTION 'record_exam_mark: score is required (human mark)';
  END IF;

  SELECT * INTO v_sitting FROM public.exam_sittings WHERE id = p_sitting_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_exam_mark: sitting not found';
  END IF;
  IF p_score < 0 OR p_score > v_sitting.max_marks THEN
    RAISE EXCEPTION 'record_exam_mark: score must be between 0 and max_marks';
  END IF;

  SELECT id INTO v_person FROM public.people WHERE auth_user_id = auth.uid() LIMIT 1;

  INSERT INTO public.learning_results (
    school_id, student_id, assignment_id, result_source, score, max_score, feedback, marked_by, marked_at
  ) VALUES (
    v_sitting.school_id,
    p_student_id,
    NULL,
    'exam',
    p_score,
    v_sitting.max_marks,
    COALESCE(p_note, 'Exam: ' || v_sitting.title),
    COALESCE(v_person, (SELECT person_id FROM public.students WHERE id = p_student_id)),
    now()
  )
  RETURNING id INTO v_result_id;

  INSERT INTO public.exam_marks (
    school_id, sitting_id, student_id, score, note, learning_result_id, entered_by
  ) VALUES (
    v_sitting.school_id, p_sitting_id, p_student_id, p_score, p_note, v_result_id, v_person
  )
  ON CONFLICT (sitting_id, student_id) DO UPDATE
    SET score = EXCLUDED.score,
        note = EXCLUDED.note,
        learning_result_id = EXCLUDED.learning_result_id,
        entered_by = EXCLUDED.entered_by,
        updated_at = now()
  RETURNING id INTO v_mark_id;

  RETURN v_mark_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_exam_mark(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_exam_mark(UUID, UUID, NUMERIC, TEXT) TO authenticated;

ALTER TABLE public.exam_sittings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_sittings_staff ON public.exam_sittings;
CREATE POLICY exam_sittings_staff ON public.exam_sittings
  FOR ALL TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'));

DROP POLICY IF EXISTS exam_marks_staff ON public.exam_marks;
CREATE POLICY exam_marks_staff ON public.exam_marks
  FOR ALL TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'));

COMMIT;
