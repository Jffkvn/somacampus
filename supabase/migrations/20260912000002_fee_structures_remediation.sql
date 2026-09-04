-- ============================================================================
-- SomaCampus Hardening Part C: fee_structures converges to category shape
-- Migration: 20260912000002_fee_structures_remediation.sql
-- ============================================================================
-- Live fee_structures is the CORE shape (id, school_id, academic_year_id,
-- term_id, class_id, title, amount, created_at) — NO fee_category_id. The Phase 7
-- file's CREATE TABLE IF NOT EXISTS was a no-op live (table already existed), so
-- live never gained the category shape. Converge WITHOUT data loss:
--   1. Ensure fee_categories exists (no-op where Phase 7 already created it).
--   2. Add fee_category_id as NULLABLE with NO FK / NOT NULL yet.
-- Every statement is guarded (IF NOT EXISTS / information_schema DO blocks) so
-- fresh DBs (core -> Phase7-noop -> this) and live converge identically.
-- FOLLOW-UP (separate migration, only after per-school backfill of existing
-- rows): backfill fee_category_id, then add FK -> fee_categories(id)
-- ON DELETE RESTRICT plus NOT NULL.
-- 1. Ensure fee_categories exists (same shape as Phase 7 definition).
CREATE TABLE IF NOT EXISTS public.fee_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, code)
);

-- 2. Converge fee_structures: add nullable fee_category_id (no constraint yet).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fee_structures'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fee_structures'
      AND column_name = 'fee_category_id'
  ) THEN
    ALTER TABLE public.fee_structures ADD COLUMN fee_category_id UUID;
  END IF;
END $$;

-- 3. Document the nullable-during-backfill contract (guarded: no-op if absent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fee_structures'
      AND column_name = 'fee_category_id'
  ) THEN
    COMMENT ON COLUMN public.fee_structures.fee_category_id IS
      'Phase 7 convergence: nullable during backfill. Follow-up: backfill per school, then add FK to fee_categories(id) ON DELETE RESTRICT + NOT NULL.';
  END IF;
END $$;

-- 4. Lookup index for post-backfill category queries (builds lazily, NULL-safe).
CREATE INDEX IF NOT EXISTS fee_structures_category_idx
  ON public.fee_structures(fee_category_id) WHERE fee_category_id IS NOT NULL;
