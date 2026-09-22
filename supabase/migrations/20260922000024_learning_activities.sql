-- =============================================================================
-- Digital Learning Spine M2 — learning_activities (single new spine entity)
-- Charter: docs/plans/2026-09-22-digital-learning-spine.md §4
--
-- PLAN (schemes → MTP → sequences → objectives) stays authoritative.
-- DELIVERY (lessons, online_sessions) stays authoritative.
-- This table is what the learner is expected to DO.
--
-- P0 types only: ASSIGNMENT | RESOURCE | LIVE_SESSION
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.learning_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  -- Parent (at least one): sequence-backed plan or offering-backed programme
  teaching_sequence_id UUID REFERENCES public.teaching_sequences(id) ON DELETE SET NULL,
  online_offering_id UUID REFERENCES public.online_offerings(id) ON DELETE CASCADE,

  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('ASSIGNMENT', 'RESOURCE', 'LIVE_SESSION')),

  title TEXT NOT NULL CHECK (length(btrim(title)) >= 2),
  instructions TEXT,
  resource_url TEXT,
  resource_storage_path TEXT,

  sort_order INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,

  assigned_date DATE,
  due_date DATE,

  -- Delivery provenance only — never the academic owner of the activity
  online_session_id UUID,

  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT learning_activities_parent_present
    CHECK (num_nonnulls(teaching_sequence_id, online_offering_id) >= 1),

  -- LIVE_SESSION type should name a session when offering-scoped
  CONSTRAINT learning_activities_live_session_link
    CHECK (
      activity_type <> 'LIVE_SESSION'
      OR online_session_id IS NOT NULL
      OR teaching_sequence_id IS NOT NULL
    )
);

-- session ∈ offering when both provenance fields set
ALTER TABLE public.learning_activities
  DROP CONSTRAINT IF EXISTS learning_activities_session_in_offering;
ALTER TABLE public.learning_activities
  ADD CONSTRAINT learning_activities_session_in_offering
  FOREIGN KEY (online_session_id, online_offering_id)
  REFERENCES public.online_sessions(id, offering_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS learning_activities_school_idx
  ON public.learning_activities(school_id);
CREATE INDEX IF NOT EXISTS learning_activities_sequence_idx
  ON public.learning_activities(teaching_sequence_id)
  WHERE teaching_sequence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS learning_activities_offering_idx
  ON public.learning_activities(online_offering_id)
  WHERE online_offering_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS learning_activities_due_idx
  ON public.learning_activities(due_date)
  WHERE due_date IS NOT NULL;

-- Optional objective links (reuse learning_objectives — no duplicate standards)
CREATE TABLE IF NOT EXISTS public.learning_activity_objectives (
  activity_id UUID NOT NULL REFERENCES public.learning_activities(id) ON DELETE CASCADE,
  objective_id UUID NOT NULL REFERENCES public.learning_objectives(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, objective_id)
);

CREATE INDEX IF NOT EXISTS learning_activity_objectives_obj_idx
  ON public.learning_activity_objectives(objective_id);

ALTER TABLE public.learning_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_activity_objectives ENABLE ROW LEVEL SECURITY;

-- RLS: school staff manage; enrolled learners/guardians read published activities
DROP POLICY IF EXISTS learning_activities_staff_all ON public.learning_activities;
CREATE POLICY learning_activities_staff_all ON public.learning_activities
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  );

DROP POLICY IF EXISTS learning_activities_offering_read ON public.learning_activities;
CREATE POLICY learning_activities_offering_read ON public.learning_activities
  FOR SELECT TO authenticated
  USING (
    is_published
    AND online_offering_id IS NOT NULL
    AND online_offering_id IN (
      SELECT oe.offering_id FROM public.online_enrolments oe
      JOIN public.students st ON st.id = oe.student_id
      JOIN public.people pp ON pp.id = st.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_activities_guardian_read ON public.learning_activities;
CREATE POLICY learning_activities_guardian_read ON public.learning_activities
  FOR SELECT TO authenticated
  USING (
    is_published
    AND online_offering_id IS NOT NULL
    AND online_offering_id IN (
      SELECT oe.offering_id FROM public.online_enrolments oe
      JOIN public.student_guardians sg ON sg.student_id = oe.student_id
      JOIN public.people pp ON pp.id = sg.guardian_person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_activity_objectives_staff_all ON public.learning_activity_objectives;
CREATE POLICY learning_activity_objectives_staff_all ON public.learning_activity_objectives
  FOR ALL TO authenticated
  USING (
    activity_id IN (
      SELECT id FROM public.learning_activities la
      WHERE la.school_id IN (
        SELECT ur.school_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
      )
    )
  )
  WITH CHECK (
    activity_id IN (
      SELECT id FROM public.learning_activities la
      WHERE la.school_id IN (
        SELECT ur.school_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role_id IN ('admin', 'principal', 'teacher')
      )
    )
  );

DROP POLICY IF EXISTS learning_activity_objectives_read ON public.learning_activity_objectives;
CREATE POLICY learning_activity_objectives_read ON public.learning_activity_objectives
  FOR SELECT TO authenticated
  USING (
    activity_id IN (
      SELECT id FROM public.learning_activities la
      WHERE la.is_published
        AND la.online_offering_id IS NOT NULL
        AND la.online_offering_id IN (
          SELECT oe.offering_id FROM public.online_enrolments oe
          JOIN public.students st ON st.id = oe.student_id
          JOIN public.people pp ON pp.id = st.person_id
          WHERE pp.auth_user_id = auth.uid()
        )
    )
  );

COMMIT;
