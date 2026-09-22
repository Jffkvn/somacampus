-- =============================================================================
-- Digital Learning Spine P1 fix — learning_coach_settings uniqueness
-- UNIQUE (school_id, stage_key) does not constrain NULL stage_key (SQL NULL
-- distinct). School-default policy must be single-row. Use '' for default.
-- =============================================================================

BEGIN;

-- 1. Normalize: collapse NULL stage_key to '' and keep the newest row.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY school_id, COALESCE(stage_key, '')
           ORDER BY updated_at DESC, created_at DESC
         ) AS rn
  FROM public.learning_coach_settings
)
DELETE FROM public.learning_coach_settings s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

UPDATE public.learning_coach_settings
SET stage_key = ''
WHERE stage_key IS NULL;

ALTER TABLE public.learning_coach_settings
  ALTER COLUMN stage_key SET DEFAULT '';

ALTER TABLE public.learning_coach_settings
  DROP CONSTRAINT IF EXISTS learning_coach_settings_school_id_stage_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS learning_coach_settings_school_stage_unique
  ON public.learning_coach_settings (school_id, stage_key);

COMMIT;
