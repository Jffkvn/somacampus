-- ============================================================================
-- SOMACAMPUS MIGRATION: ALLOCATION UNIQUENESS (Session 10 follow-up)
-- Migration ID: 20260922000018
-- ============================================================================
-- Every wizard save inserted fresh teaching_allocations rows (~150 live for
-- 9 pairs), leaving lineage ambiguous. Repair + guard:
--   1. Archive all but the latest non-archived row per
--      (school, academic_year, class, subject) — history preserved.
--   2. Partial unique index: exactly one live row per pair.
-- Idempotent (re-runnable; repair is a no-op once clean).
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY school_id, academic_year_id, class_id,
                            COALESCE(stream_id, '00000000-0000-0000-0000-000000000000')
               ORDER BY
                 CASE status WHEN 'approved' THEN 0 WHEN 'reviewed' THEN 1 ELSE 2 END,
                 updated_at DESC NULLS LAST,
                 created_at DESC NULLS LAST,
                 id DESC
             ) AS rn
      FROM public.teaching_allocations
      WHERE status <> 'archived'
    ) ranked
    WHERE rn > 1
  LOOP
    UPDATE public.teaching_allocations
    SET status = 'archived', updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;

DROP INDEX IF EXISTS teaching_allocations_pair_unique;
CREATE UNIQUE INDEX teaching_allocations_pair_unique
  ON public.teaching_allocations (
    school_id, academic_year_id, class_id,
    COALESCE(stream_id, '00000000-0000-0000-0000-000000000000'),
    subject_id
  )
  WHERE status <> 'archived';
