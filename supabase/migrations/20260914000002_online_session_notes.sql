-- ==============================================================================
-- SOMACAMPUS MIGRATION: ONLINE SESSION NOTES + LIFECYCLE TIMESTAMPS
-- Migration ID: 20260914000002
-- ==============================================================================
-- Phase 9C follow-up (schema only): closes the session_note gap on
-- public.online_sessions. The 9C-1 teaching service requires a non-empty
-- completion note to COMPLETE a session and surfaces the latest COMPLETED
-- same-offering note as continuity context in the session cockpit; until
-- this migration that note was a validated gate echoed in the response only.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS (safe to re-run; existing data
-- untouched, new columns NULL for history — no backfill: a NULL note on a
-- COMPLETED row honestly means "completed before notes existed").
--
-- DELIBERATE DECISIONS (documented):
-- 1. session_note is NULLABLE TEXT with no NOT NULL / CHECK: history rows
--    predate the feature, and the non-empty rule is enforced app-side by
--    onlineTeachingService.completeSession (validated before any DB call).
--    Keep the DB dumb.
-- 2. started_at / completed_at are NULLABLE TIMESTAMPTZ set app-side on the
--    SCHEDULED/CONFIRMED → IN_PROGRESS and IN_PROGRESS → COMPLETED
--    transitions (verified absent from 20260914000000 before adding).
--    No DB trigger and no updated_at auto-trigger (9B-1 convention:
--    timestamps are app-maintained).
-- 3. No RLS changes: the existing online_sessions_update policy is
--    row-level (USING/WITH CHECK on school_id via online_centre_can_write),
--    not column-restrictive, so staff writers already cover the new columns.
--    Learner visibility of notes is governed by the existing
--    online_sessions_read policy + session_visible_to_learner helper.
-- 4. No index on session_note: notes are fetched by (offering_id, teacher_id,
--    status, scheduled_start) — already covered by
--    online_sessions_offering_time_idx / online_sessions_teacher_time_idx /
--    online_sessions_school_status_idx.

ALTER TABLE public.online_sessions
  ADD COLUMN IF NOT EXISTS session_note TEXT;

ALTER TABLE public.online_sessions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE public.online_sessions
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
