-- =============================================================================
-- P3-A — grading scales + school result formula
-- Plan: docs/plans/2026-09-22-digital-learning-spine-P3.md
-- mean | total | aggregate_division (configurable; UG preset is data, not law)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  formula TEXT NOT NULL DEFAULT 'mean'
    CHECK (formula IN ('mean', 'total', 'aggregate_division')),
  -- [{ "minPct": 80, "maxPct": 100, "grade": "A", "points": 1 }]
  bands JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- [{ "maxAggregate": 4, "label": "Division 1" }, …]
  divisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  rounding TEXT NOT NULL DEFAULT 'half_up'
    CHECK (rounding IN ('half_up', 'floor', 'none')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grading_scales_school_idx ON public.grading_scales(school_id);

ALTER TABLE public.grading_scales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grading_scales_staff ON public.grading_scales;
CREATE POLICY grading_scales_staff ON public.grading_scales
  FOR ALL TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher', 'bursar'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal'));

COMMIT;
