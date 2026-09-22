-- =============================================================================
-- Digital Learning Spine P1 — provider recording → catch-up
-- Charter: docs/plans/2026-09-22-digital-learning-spine.md §12
--
-- External provider storage is OK (Meet / Zoom / Teams / custom).
-- Never native WebRTC/SFU. Recording is a LEARNING ARTIFACT under the
-- activity/lesson — not a bare MP4 library. Catch-up links the recording
-- to a learning_activities RESOURCE row when published.
-- =============================================================================

BEGIN;

-- 1. Recording rows (external URL is fine; no local media pipeline).
CREATE TABLE IF NOT EXISTS public.online_session_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.online_sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'custom'
    CHECK (provider IN ('meet', 'zoom', 'teams', 'custom')),
  provider_recording_id TEXT,
  url TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  -- Optional catch-up artifact link (learning_activities RESOURCE).
  catch_up_activity_id UUID REFERENCES public.learning_activities(id) ON DELETE SET NULL,
  ingested_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT online_session_recordings_span
    CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS online_session_recordings_session_idx
  ON public.online_session_recordings(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS online_session_recordings_school_idx
  ON public.online_session_recordings(school_id, created_at DESC);

-- One recording per provider artifact (webhook retries stay idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS online_session_recordings_provider_unique
  ON public.online_session_recordings(session_id, provider, provider_recording_id)
  WHERE provider_recording_id IS NOT NULL;

-- 2. RLS — staff manage; enrolled learners + guardians read recordings for
--    sessions in their offerings (catch-up permission: student/guardian/course).
ALTER TABLE public.online_session_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS online_session_recordings_staff_all ON public.online_session_recordings;
CREATE POLICY online_session_recordings_staff_all ON public.online_session_recordings
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  );

DROP POLICY IF EXISTS online_session_recordings_learner_read ON public.online_session_recordings;
CREATE POLICY online_session_recordings_learner_read ON public.online_session_recordings
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT s.id FROM public.online_sessions s
      JOIN public.online_enrolments oe ON oe.offering_id = s.offering_id
      JOIN public.students st ON st.id = oe.student_id
      JOIN public.people pp ON pp.id = st.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS online_session_recordings_guardian_read ON public.online_session_recordings;
CREATE POLICY online_session_recordings_guardian_read ON public.online_session_recordings
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT s.id FROM public.online_sessions s
      JOIN public.online_enrolments oe ON oe.offering_id = s.offering_id
      JOIN public.student_guardians sg ON sg.student_id = oe.student_id
      JOIN public.people pp ON pp.id = sg.guardian_person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

COMMIT;
