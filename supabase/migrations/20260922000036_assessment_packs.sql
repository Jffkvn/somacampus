-- =============================================================================
-- P2A-4 — assessment packs + objective rollup
-- Plan: docs/plans/2026-09-22-digital-learning-spine-P2.md
-- Student → Subject → Curriculum → Objectives → Evidence → Result
-- =============================================================================

BEGIN;

-- 1. Assessment pack (kind: baseline | diagnostic | unit | midterm | end_of_term | project | practical | oral)
CREATE TABLE IF NOT EXISTS public.learning_assessment_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  pack_kind TEXT NOT NULL
    CHECK (pack_kind IN ('baseline', 'diagnostic', 'unit', 'midterm', 'end_of_term', 'project', 'practical', 'oral')),
  title TEXT NOT NULL,
  description TEXT,
  teaching_sequence_id UUID REFERENCES public.teaching_sequences(id) ON DELETE SET NULL,
  online_offering_id UUID REFERENCES public.online_offerings(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_assessment_pack_parent
    CHECK (num_nonnulls(teaching_sequence_id, online_offering_id) >= 1)
);

CREATE INDEX IF NOT EXISTS learning_assessment_packs_school_idx
  ON public.learning_assessment_packs(school_id, pack_kind) WHERE is_published;

-- 2. Pack items → quizzes and/or learning activities, each mapped to objectives
CREATE TABLE IF NOT EXISTS public.learning_assessment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.learning_assessment_packs(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  item_title TEXT NOT NULL,
  quiz_id UUID REFERENCES public.learning_quizzes(id) ON DELETE SET NULL,
  learning_activity_id UUID REFERENCES public.learning_activities(id) ON DELETE SET NULL,
  -- [{"objective_code":"F1","objective_title":"Fractions"}]
  objective_map JSONB NOT NULL DEFAULT '[]'::jsonb,
  weight NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  CONSTRAINT learning_assessment_item_target
    CHECK (num_nonnulls(quiz_id, learning_activity_id) >= 1)
);

CREATE INDEX IF NOT EXISTS learning_assessment_items_pack_idx
  ON public.learning_assessment_items(pack_id, sort_order);

-- 3. Objective rollup view material (computed in service; this documents the chain).
--    Result rows already carry learning_activity_id / quiz_id / assignment_id.

ALTER TABLE public.learning_assessment_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_assessment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_assessment_packs_staff_all ON public.learning_assessment_packs;
CREATE POLICY learning_assessment_packs_staff_all ON public.learning_assessment_packs
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

DROP POLICY IF EXISTS learning_assessment_packs_learner_read ON public.learning_assessment_packs;
CREATE POLICY learning_assessment_packs_learner_read ON public.learning_assessment_packs
  FOR SELECT TO authenticated
  USING (
    is_published
    AND online_offering_id IN (
      SELECT oe.offering_id FROM public.online_enrolments oe
      JOIN public.students st ON st.id = oe.student_id
      JOIN public.people pp ON pp.id = st.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_assessment_items_staff_all ON public.learning_assessment_items;
CREATE POLICY learning_assessment_items_staff_all ON public.learning_assessment_items
  FOR ALL TO authenticated
  USING (
    pack_id IN (
      SELECT id FROM public.learning_assessment_packs p
      WHERE p.school_id IN (
        SELECT ur.school_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
      )
    )
  )
  WITH CHECK (
    pack_id IN (
      SELECT id FROM public.learning_assessment_packs p
      WHERE p.school_id IN (
        SELECT ur.school_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
      )
    )
  );

DROP POLICY IF EXISTS learning_assessment_items_learner_read ON public.learning_assessment_items;
CREATE POLICY learning_assessment_items_learner_read ON public.learning_assessment_items
  FOR SELECT TO authenticated
  USING (
    pack_id IN (
      SELECT id FROM public.learning_assessment_packs p
      WHERE p.is_published
        AND p.online_offering_id IN (
          SELECT oe.offering_id FROM public.online_enrolments oe
          JOIN public.students st ON st.id = oe.student_id
          JOIN public.people pp ON pp.id = st.person_id
          WHERE pp.auth_user_id = auth.uid()
        )
    )
  );

COMMIT;
