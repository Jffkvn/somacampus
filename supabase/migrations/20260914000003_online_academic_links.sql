-- ==============================================================================
-- SOMACAMPUS MIGRATION: ONLINE ACADEMIC LINKS (SESSION PROVENANCE)
-- Migration ID: 20260914000003
-- ==============================================================================
-- Phase 9E schema gap (schema only): assignments carries a lesson_id FK only
-- and teacher_observations carries lesson_id / assignment_id only (verified in
-- 20260908000000_phase4_learning_evidence); no session FK exists anywhere.
-- Online work therefore has no session provenance. This migration adds a
-- NULLABLE online_session_id FK to both tables so online assignments and
-- observations can point at the public.online_sessions row they came from.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS (safe to
-- re-run; existing data untouched, new columns NULL for history — no
-- backfill: a NULL online_session_id honestly means "created before session
-- provenance existed" or "physical-school work, not online").
--
-- DELIBERATE DECISIONS (documented):
-- 1. online_session_id is NULLABLE with ON DELETE SET NULL: physical-school
--    assignments/observations legitimately have no session, and deleting a
--    session must not delete academic history.
-- 2. FK target is public.online_sessions(id) (created in 20260914000000).
-- 3. Partial indexes (WHERE online_session_id IS NOT NULL): the NULL-heavy
--    physical rows are never queried by session; only online rows are.
-- 4. No RLS changes: the existing assignments_* / teacher_observations_*
--    policies are row-level (school-scoped), not column-restrictive, so the
--    new columns inherit coverage.
-- ==============================================================================

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS online_session_id UUID
    REFERENCES public.online_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_online_session
  ON public.assignments (online_session_id)
  WHERE online_session_id IS NOT NULL;

ALTER TABLE public.teacher_observations
  ADD COLUMN IF NOT EXISTS online_session_id UUID
    REFERENCES public.online_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_observations_online_session
  ON public.teacher_observations (online_session_id)
  WHERE online_session_id IS NOT NULL;
