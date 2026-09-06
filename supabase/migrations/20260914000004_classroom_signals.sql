-- ==============================================================================
-- SOMACAMPUS MIGRATION: ONLINE CLASSROOM SIGNALS (TECHNICAL EVIDENCE)
-- Migration ID: 20260914000004
-- ==============================================================================
-- Phase 9H Task 1 (schema only): provider-agnostic classroom abstraction at
-- the DB layer is the join_url column on public.online_sessions (plain link
-- field, verified in 20260914000000 -- no provider columns, no credentials,
-- no SDK state). This migration adds the technical-signals table only:
-- public.online_session_signals stores joined/left/connection/recording
-- events per participant per session as EVIDENCE for the teacher. Signals
-- NEVER drive participation: participation truth stays
-- online_session_participants.participation_status, confirmed manually via
-- the existing recordParticipation flow (no trigger, no backfill, no
-- generated column touches participants).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS before each CREATE / CREATE OR REPLACE helpers.
-- No USING(true) on school data: every policy is school-scoped via the
-- 9A DEFINER helpers (SET search_path = public, no RLS recursion).
--
-- DELIBERATE DECISIONS (documented):
-- 1. No school_id on the signals table (9A convention for session-child
--    tables): school resolves via the DEFINER lookup
--    public.online_centre_session_school(session_id), mirroring
--    online_session_participants exactly.
-- 2. student_id is NULLABLE with ON DELETE CASCADE: system events (e.g. a
--    recording-started marker) have no student; deleting a student removes
--    their signal rows with them. joined/left rows REQUIRE a student
--    (CHECK below); connection/recording rows may be system-wide (NULL) or
--    per-student. Membership (signal student must be a session participant)
--    is enforced app-side by onlineClassroomService.recordSignal, not by a
--    DB FK into participants (keeps the DB dumb, 9B-1 convention).
-- 3. signal_type is joined|left|connection|recording only. Duration is NOT
--    a stored column: it derives app-side from joined/left pairs
--    (computePresenceDurations) or rides metadata.duration_seconds for
--    provider-reported totals. No dual-source drift.
-- 4. metadata is JSONB NOT NULL DEFAULT '{}' (provider payloads, device
--    info, duration_seconds); recorded_source is manual|provider
--    (DEFAULT manual -- honest provenance on every row).
-- 5. Writes are admin/principal + the ASSIGNED teacher only (new narrow
--    helper online_classroom_signal_can_write): any staff teacher must not
--    inject signals into another teacher's session. Reads mirror the
--    participants policy: school staff + own-student + guardian-of-child.
--    RLS is the backstop; the service re-verifies ownership app-side.
-- 6. No DELETE policies (9A convention -- delete flows arrive later).
-- 7. No index on signal_type alone: reads are by (session_id, occurred_at);
--    the student index serves per-learner lookups.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. online_session_signals (technical evidence; never participation truth)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_session_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.online_sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL
    CHECK (signal_type IN ('joined', 'left', 'connection', 'recording')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}',
  recorded_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (recorded_source IN ('manual', 'provider')),
  recorded_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- joined/left are per-student events (system rows use connection/recording).
  CHECK (signal_type NOT IN ('joined', 'left') OR student_id IS NOT NULL)
);

-- ------------------------------------------------------------------------------
-- Indexes on actual query paths
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS online_session_signals_session_time_idx
  ON public.online_session_signals (session_id, occurred_at);

CREATE INDEX IF NOT EXISTS online_session_signals_student_idx
  ON public.online_session_signals (student_id)
  WHERE student_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- DEFINER helpers (SET search_path = public; no RLS recursion)
-- ------------------------------------------------------------------------------

-- Narrow writers: admin/principal of the session's school, or the teacher
-- the session is assigned to (matched via employees -> people auth link).
CREATE OR REPLACE FUNCTION public.online_classroom_signal_can_write(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.online_sessions s
    JOIN public.user_roles ur ON ur.school_id = s.school_id
    WHERE s.id = p_session_id
      AND ur.user_id = auth.uid()
      AND ur.role_id IN ('admin', 'principal')
  )
  OR EXISTS (
    SELECT 1
    FROM public.online_sessions s
    JOIN public.employees e ON e.id = s.teacher_id
    JOIN public.people p ON p.id = e.person_id
    WHERE s.id = p_session_id
      AND p.auth_user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------------------------
-- RLS: ENABLE + school-scoped policies (mirrors session participants)
-- ------------------------------------------------------------------------------
ALTER TABLE public.online_session_signals ENABLE ROW LEVEL SECURITY;

-- -- online_session_signals -------------------------------------------------------
DROP POLICY IF EXISTS online_session_signals_read ON public.online_session_signals;
CREATE POLICY online_session_signals_read ON public.online_session_signals
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(public.online_centre_session_school(session_id))
    OR student_id = public.online_centre_my_student_id()
    OR student_id IN (
      SELECT public.current_guardian_student_ids_for_school(
        public.online_centre_session_school(online_session_signals.session_id)
      )
    )
  );

DROP POLICY IF EXISTS online_session_signals_insert ON public.online_session_signals;
CREATE POLICY online_session_signals_insert ON public.online_session_signals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.online_classroom_signal_can_write(session_id)
  );

DROP POLICY IF EXISTS online_session_signals_update ON public.online_session_signals;
CREATE POLICY online_session_signals_update ON public.online_session_signals
  FOR UPDATE TO authenticated
  USING (
    public.online_classroom_signal_can_write(session_id)
  )
  WITH CHECK (
    public.online_classroom_signal_can_write(session_id)
  );
