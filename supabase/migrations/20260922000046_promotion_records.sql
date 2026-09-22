-- =============================================================================
-- P3-G — promotion / progression record (THIN)
-- Plan: docs/plans/2026-09-22-digital-learning-spine-P3.md
-- One decision per learner-year. No fees-clearance or committee engine.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.promotion_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  from_label TEXT NOT NULL,
  to_label TEXT NOT NULL,
  decision TEXT NOT NULL
    CHECK (decision IN ('promoted', 'repeating', 'transferred', 'other')),
  reason TEXT,
  decided_by UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  decided_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promotion_records_student_idx
  ON public.promotion_records(student_id, academic_year);
CREATE INDEX IF NOT EXISTS promotion_records_school_idx
  ON public.promotion_records(school_id, academic_year);

ALTER TABLE public.promotion_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_records_staff ON public.promotion_records;
CREATE POLICY promotion_records_staff ON public.promotion_records
  FOR ALL TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal'));

DROP POLICY IF EXISTS promotion_records_family_read ON public.promotion_records;
CREATE POLICY promotion_records_family_read ON public.promotion_records
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
