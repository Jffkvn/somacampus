-- =============================================================================
-- Digital Learning Spine P1 — Learning Coach (configurable)
-- Charter: docs/plans/2026-09-22-digital-learning-spine.md §13
--
-- Learning Coach (parent/guardian) is configurable per school/stage —
-- never hard-coded US hours. Capabilities are feature flags. Hours sign-off
-- and offline-work verify are first-class confirmations (engagement is
-- multi-signal; physical attendance ≠ online participation).
-- =============================================================================

BEGIN;

-- 1. School-level coach policy (configurable; not baked-in hours)
CREATE TABLE IF NOT EXISTS public.learning_coach_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Which stage/key this policy applies to (null = school default).
  stage_key TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  -- IANA timezone for coach hours display (e.g. Africa/Kampala).
  timezone TEXT NOT NULL DEFAULT 'Africa/Kampala',
  -- Soft weekly coaching hours target (0 = not used). Sign-off is via
  -- learning_coach_confirmations, not a clock-in system.
  weekly_hours_target NUMERIC(4,1) CHECK (weekly_hours_target IS NULL OR weekly_hours_target >= 0),
  -- Capability flags (LOCKED list in charter §13). Default all on when enabled.
  can_schedule BOOLEAN NOT NULL DEFAULT true,
  can_view_assignments BOOLEAN NOT NULL DEFAULT true,
  can_view_overdue BOOLEAN NOT NULL DEFAULT true,
  can_view_progress BOOLEAN NOT NULL DEFAULT true,
  can_view_grades BOOLEAN NOT NULL DEFAULT true,
  can_view_feedback BOOLEAN NOT NULL DEFAULT true,
  can_receive_alerts BOOLEAN NOT NULL DEFAULT true,
  can_verify_offline_work BOOLEAN NOT NULL DEFAULT true,
  can_sign_off_hours BOOLEAN NOT NULL DEFAULT true,
  can_chat_teachers BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, stage_key)
);

CREATE INDEX IF NOT EXISTS learning_coach_settings_school_idx
  ON public.learning_coach_settings(school_id);

-- 2. Coach ↔ learner assignment (institutional people, never auth UIDs as FK)
CREATE TABLE IF NOT EXISTS public.learning_coach_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  coach_person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  coach_role TEXT NOT NULL DEFAULT 'guardian'
    CHECK (coach_role IN ('parent', 'guardian', 'staff_coach')),
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_coach_assignment_dates
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS learning_coach_assignment_active_unique
  ON public.learning_coach_assignments(student_id, coach_person_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS learning_coach_assignment_student_idx
  ON public.learning_coach_assignments(student_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS learning_coach_assignment_coach_idx
  ON public.learning_coach_assignments(coach_person_id) WHERE is_active;

-- 3. Coach confirmations — hours sign-off + offline-work verify + engagement
CREATE TABLE IF NOT EXISTS public.learning_coach_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.learning_coach_assignments(id) ON DELETE SET NULL,
  confirmation_kind TEXT NOT NULL
    CHECK (confirmation_kind IN ('hours_sign_off', 'offline_work_verify', 'engagement_confirm')),
  confirmed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  hours NUMERIC(4,1) CHECK (hours IS NULL OR hours >= 0),
  note TEXT,
  learning_activity_id UUID REFERENCES public.learning_activities(id) ON DELETE SET NULL,
  confirmed_by UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_coach_hours_when_sign_off
    CHECK (confirmation_kind <> 'hours_sign_off' OR hours IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS learning_coach_confirmations_student_idx
  ON public.learning_coach_confirmations(student_id, confirmed_on DESC);
CREATE INDEX IF NOT EXISTS learning_coach_confirmations_kind_idx
  ON public.learning_coach_confirmations(confirmation_kind, confirmed_on DESC);

-- 4. RLS — mirrors learning_activities: staff manage via user_roles;
--    people.auth_user_id links the signed-in auth user to institutional identity.
ALTER TABLE public.learning_coach_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_coach_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_coach_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_coach_settings_staff_read ON public.learning_coach_settings;
CREATE POLICY learning_coach_settings_staff_read ON public.learning_coach_settings
  FOR SELECT TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_coach_settings_staff_write ON public.learning_coach_settings;
CREATE POLICY learning_coach_settings_staff_write ON public.learning_coach_settings
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  );

DROP POLICY IF EXISTS learning_coach_assignments_staff_all ON public.learning_coach_assignments;
CREATE POLICY learning_coach_assignments_staff_all ON public.learning_coach_assignments
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

-- Coach / learner / guardian read own assignments.
DROP POLICY IF EXISTS learning_coach_assignments_party_read ON public.learning_coach_assignments;
CREATE POLICY learning_coach_assignments_party_read ON public.learning_coach_assignments
  FOR SELECT TO authenticated
  USING (
    is_active
    AND (
      coach_person_id IN (
        SELECT pp.id FROM public.people pp WHERE pp.auth_user_id = auth.uid()
      )
      OR student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.people pp ON pp.id = s.person_id
        WHERE pp.auth_user_id = auth.uid()
      )
      OR student_id IN (
        SELECT sg.student_id FROM public.student_guardians sg
        JOIN public.people pp ON pp.id = sg.guardian_person_id
        WHERE pp.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS learning_coach_confirmations_staff_read ON public.learning_coach_confirmations;
CREATE POLICY learning_coach_confirmations_staff_read ON public.learning_coach_confirmations
  FOR SELECT TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );

-- Coach inserts confirmations only for own active assignments.
DROP POLICY IF EXISTS learning_coach_confirmations_coach_insert ON public.learning_coach_confirmations;
CREATE POLICY learning_coach_confirmations_coach_insert ON public.learning_coach_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (
    confirmed_by IN (
      SELECT pp.id FROM public.people pp WHERE pp.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.learning_coach_assignments a
      WHERE a.id = assignment_id
        AND a.is_active
        AND a.student_id = learning_coach_confirmations.student_id
        AND a.coach_person_id = learning_coach_confirmations.confirmed_by
    )
  );

DROP POLICY IF EXISTS learning_coach_confirmations_party_read ON public.learning_coach_confirmations;
CREATE POLICY learning_coach_confirmations_party_read ON public.learning_coach_confirmations
  FOR SELECT TO authenticated
  USING (
    confirmed_by IN (
      SELECT pp.id FROM public.people pp WHERE pp.auth_user_id = auth.uid()
    )
    OR student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.people pp ON pp.id = s.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
    OR student_id IN (
      SELECT sg.student_id FROM public.student_guardians sg
      JOIN public.people pp ON pp.id = sg.guardian_person_id
      WHERE pp.auth_user_id = auth.uid()
    )
    OR student_id IN (
      SELECT a.student_id FROM public.learning_coach_assignments a
      JOIN public.people pp ON pp.id = a.coach_person_id
      WHERE pp.auth_user_id = auth.uid() AND a.is_active
    )
  );

COMMIT;
