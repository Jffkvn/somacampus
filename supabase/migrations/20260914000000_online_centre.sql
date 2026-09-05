-- ==============================================================================
-- SOMACAMPUS MIGRATION: ONLINE LEARNING CENTRE FOUNDATION
-- Migration ID: 20260914000000
-- ==============================================================================
-- Phase 9A Task 1 (schema only): greenfield online-learning-centre domain
-- alongside the physical school. Centre publishes slot templates; bookings
-- create concrete sessions; participation is per-session.
--
-- NEVER touches student_attendance_* tables: centre participation lives in
-- online_session_participants only (deliberate vocabulary split).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS before each CREATE / CREATE OR REPLACE helpers.
-- No USING(true) on school data: every policy is school-scoped via helpers.
-- Helpers are SECURITY DEFINER with SET search_path = public (repo
-- convention) so cross-table checks never recurse through RLS.
--
-- DELIBERATE DEVIATIONS / DECISIONS (documented):
-- 1. school_id is denormalised onto every centre table EXCEPT
--    online_session_participants and online_compensation_rules, which resolve
--    their school via DEFINER lookups (session -> school, assignment ->
--    school). Denormalisation keeps every policy school-scoped from the row
--    itself; parent-school match (e.g. pricing.school vs offering.school) is
--    enforced app-side, with the finance hook resolved in 9A-2.
-- 2. online_pricing_options.fee_category_id (nullable FK) IS included:
--    Phase 7 fee_categories is school-scoped (school_id, code UNIQUE), so the
--    hook fits. Charge/ledger wiring itself is deferred to 9A-2.
-- 3. online_slot_templates.default_teacher_id is NULLABLE: templates stay
--    teacher-agnostic by default; a value here is only a preferred teacher,
--    never the pool (pool = online_teaching_assignments below).
-- 4. online_bookings carries a NULLABLE slot_template_id provenance column:
--    bookings are offering + scheduled_date + start/end TIME (minimal core),
--    and 9B fills slot_template_id when templates generate bookings.
--    Capacity is enforced app-side for now (no DB count check); the row
--    carries only status + timestamps.
-- 5. online_pricing_options.recommended_sessions is ADVISORY ONLY: no CHECK
--    enforces it (spec requirement).
-- 6. online_sessions.session_type values
--    ('lesson','tutorial','assessment','make_up','trial') are a new local
--    enum; curriculum linkage is via learning_objectives(id), which is
--    curriculum-version scoped (no school_id) so school scope always comes
--    from the session row itself.
-- 7. Reschedule = cancel + replacement: replaced_by_session_id is a nullable
--    self-FK; history rows are never mutated (no trigger enforces this, it
--    is a write-path contract for 9B).
--    joined_at / left_at on participants are TECHNICAL signals only, never
--    participation truth (participation_status is truth).
-- 8. Teacher model is three layers (engagement -> assignment -> compensation).
--    Arrangement lives on the assignment; salaried-included work is
--    pay_model='none' with rate 0 (documented, not CHECK-forced, so a future
--    stipend does not need a model change).
-- 9. NO GiST exclusion constraints (unlike class_teachers): centre pool
--    semantics allow concurrent assignments/engagements, so only
--    effective_to >= effective_from CHECKs are enforced; scoped exclusions
--    (if wanted) arrive with 9B conflict checking.
-- 10. Writes (INSERT/UPDATE) are staff-only (admin/principal/teacher,
--     school-scoped). No learner self-booking and no DELETE policies yet:
--     self-service booking and delete flows arrive in 9B. Learners
--     (actively-enrolled students + guardians of enrolled children) get
--     SELECT on the catalogue; pricing rows are PUBLIC-only for learners
--     (INTERNAL/ENQUIRY_ONLY stay staff-only), and session rows are visible
--     to learners only via their own (or their child's) participant row.
-- 11. online_teacher_engagements.status uses
--     active|suspended|ended (not a bare boolean) to mirror assignment
--     lifecycle; online_teaching_assignments.status uses
--     active|paused|ended to mirror online_enrolments pausing.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. online_programmes
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) >= 2),
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

-- ------------------------------------------------------------------------------
-- 2. online_offerings (programme FK nullable = standalone tutoring;
--    subject FK nullable = non-subject offering)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES public.online_programmes(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) >= 2),
  delivery_format TEXT NOT NULL
    CHECK (delivery_format IN ('one_to_one', 'small_group', 'group')),
  max_participants INT CHECK (max_participants IS NULL OR max_participants >= 1),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- max_participants NULL = 1-to-1 single (no separate flag; see header note 4
  -- for why no live count check is enforced at the DB layer yet).
);

-- ------------------------------------------------------------------------------
-- 3. online_pricing_options (finance hook: nullable fee_category_id; the
--    charge/ledger wiring is resolved in 9A-2)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_pricing_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.online_offerings(id) ON DELETE CASCADE,
  fee_category_id UUID REFERENCES public.fee_categories(id) ON DELETE SET NULL,
  billing_model TEXT NOT NULL
    CHECK (billing_model IN ('per_session', 'per_month', 'per_term', 'package', 'programme')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  display_mode TEXT NOT NULL DEFAULT 'PUBLIC'
    CHECK (display_mode IN ('PUBLIC', 'INTERNAL', 'ENQUIRY_ONLY')),
  recommended_sessions INT,
  effective_from DATE,
  effective_to DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
  -- recommended_sessions intentionally has NO range CHECK: advisory only.
);

-- ------------------------------------------------------------------------------
-- 4. online_slot_templates (teacher-agnostic; optional preferred teacher)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_slot_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.online_offerings(id) ON DELETE CASCADE,
  weekday INT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INT NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  default_teacher_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- ------------------------------------------------------------------------------
-- 5. online_bookings (minimal core; slot_template_id is nullable provenance
--    for 9B template-generated bookings; capacity enforced app-side)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.online_offerings(id) ON DELETE RESTRICT,
  slot_template_id UUID REFERENCES public.online_slot_templates(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'cancelled')),
  confirmed_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- ------------------------------------------------------------------------------
-- 6. online_enrolments (no class/stream required; offering + pricing optional)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.online_offerings(id) ON DELETE SET NULL,
  pricing_option_id UUID REFERENCES public.online_pricing_options(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- One active enrolment per student+offering (offering NULL rows stay distinct).
CREATE UNIQUE INDEX IF NOT EXISTS online_enrolments_one_active_idx
  ON public.online_enrolments (student_id, offering_id)
  WHERE status = 'active' AND offering_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 7. online_sessions (real timestamps for conflict checking; reschedule =
--    cancel + replacement via replaced_by_session_id, never mutate history)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.online_offerings(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.online_bookings(id) ON DELETE SET NULL,
  teacher_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'lesson'
    CHECK (session_type IN ('lesson', 'tutorial', 'assessment', 'make_up', 'trial')),
  status TEXT NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  replaced_by_session_id UUID REFERENCES public.online_sessions(id) ON DELETE SET NULL,
  join_url TEXT,
  curriculum_objective_id UUID REFERENCES public.learning_objectives(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (scheduled_end > scheduled_start),
  CHECK (replaced_by_session_id IS NULL OR replaced_by_session_id <> id)
);

-- One concrete session per booking (bookings that split into multiples are
-- modelled as separate sessions sharing the offering, not the booking).
CREATE UNIQUE INDEX IF NOT EXISTS online_sessions_one_per_booking_idx
  ON public.online_sessions (booking_id)
  WHERE booking_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 8. online_session_participants (per-session participation, NOT attendance)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.online_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  participation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (participation_status IN ('pending', 'present', 'absent', 'late', 'partial', 'excused')),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  recorded_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

-- ------------------------------------------------------------------------------
-- 9. Teacher three layers: engagements -> assignments -> compensation rules
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_teacher_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  engagement_type TEXT NOT NULL
    CHECK (engagement_type IN ('full_time', 'part_time', 'contract', 'sessional')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (employee_id, engagement_type, effective_from)
);

CREATE TABLE IF NOT EXISTS public.online_teaching_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES public.online_teacher_engagements(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.online_offerings(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS public.online_compensation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.online_teaching_assignments(id) ON DELETE CASCADE,
  pay_model TEXT NOT NULL
    CHECK (pay_model IN ('per_session', 'monthly', 'none')),
  rate NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (assignment_id, effective_from)
  -- Arrangement lives on the assignment; salaried-included work is
  -- pay_model='none' with rate 0 (see header note 8).
);

-- ------------------------------------------------------------------------------
-- Indexes on actual query paths
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS online_programmes_school_idx
  ON public.online_programmes (school_id);
CREATE INDEX IF NOT EXISTS online_programmes_school_active_idx
  ON public.online_programmes (school_id, active);

CREATE INDEX IF NOT EXISTS online_offerings_school_idx
  ON public.online_offerings (school_id);
CREATE INDEX IF NOT EXISTS online_offerings_programme_idx
  ON public.online_offerings (programme_id);
CREATE INDEX IF NOT EXISTS online_offerings_subject_idx
  ON public.online_offerings (subject_id) WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS online_pricing_options_school_idx
  ON public.online_pricing_options (school_id);
CREATE INDEX IF NOT EXISTS online_pricing_options_offering_idx
  ON public.online_pricing_options (offering_id);
CREATE INDEX IF NOT EXISTS online_pricing_options_offering_active_idx
  ON public.online_pricing_options (offering_id, active);

CREATE INDEX IF NOT EXISTS online_slot_templates_school_idx
  ON public.online_slot_templates (school_id);
CREATE INDEX IF NOT EXISTS online_slot_templates_offering_idx
  ON public.online_slot_templates (offering_id);
CREATE INDEX IF NOT EXISTS online_slot_templates_offering_weekday_idx
  ON public.online_slot_templates (offering_id, weekday);

CREATE INDEX IF NOT EXISTS online_bookings_school_idx
  ON public.online_bookings (school_id);
CREATE INDEX IF NOT EXISTS online_bookings_student_idx
  ON public.online_bookings (student_id);
CREATE INDEX IF NOT EXISTS online_bookings_offering_date_idx
  ON public.online_bookings (offering_id, scheduled_date);
CREATE INDEX IF NOT EXISTS online_bookings_school_status_idx
  ON public.online_bookings (school_id, status);

CREATE INDEX IF NOT EXISTS online_enrolments_school_idx
  ON public.online_enrolments (school_id);
CREATE INDEX IF NOT EXISTS online_enrolments_student_idx
  ON public.online_enrolments (student_id);
CREATE INDEX IF NOT EXISTS online_enrolments_school_status_idx
  ON public.online_enrolments (school_id, status);

CREATE INDEX IF NOT EXISTS online_sessions_school_idx
  ON public.online_sessions (school_id);
CREATE INDEX IF NOT EXISTS online_sessions_teacher_time_idx
  ON public.online_sessions (teacher_id, scheduled_start);
CREATE INDEX IF NOT EXISTS online_sessions_offering_time_idx
  ON public.online_sessions (offering_id, scheduled_start);
CREATE INDEX IF NOT EXISTS online_sessions_school_status_idx
  ON public.online_sessions (school_id, status);
CREATE INDEX IF NOT EXISTS online_sessions_school_start_idx
  ON public.online_sessions (school_id, scheduled_start);

CREATE INDEX IF NOT EXISTS online_session_participants_session_idx
  ON public.online_session_participants (session_id);
CREATE INDEX IF NOT EXISTS online_session_participants_student_idx
  ON public.online_session_participants (student_id);

CREATE INDEX IF NOT EXISTS online_teacher_engagements_school_idx
  ON public.online_teacher_engagements (school_id);
CREATE INDEX IF NOT EXISTS online_teacher_engagements_employee_idx
  ON public.online_teacher_engagements (employee_id);

CREATE INDEX IF NOT EXISTS online_teaching_assignments_school_idx
  ON public.online_teaching_assignments (school_id);
CREATE INDEX IF NOT EXISTS online_teaching_assignments_engagement_idx
  ON public.online_teaching_assignments (engagement_id);
CREATE INDEX IF NOT EXISTS online_teaching_assignments_offering_idx
  ON public.online_teaching_assignments (offering_id)
  WHERE offering_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS online_compensation_rules_assignment_idx
  ON public.online_compensation_rules (assignment_id);

-- ------------------------------------------------------------------------------
-- DEFINER helpers (SET search_path = public; no RLS recursion)
-- ------------------------------------------------------------------------------

-- Staff of the school: teaching/admin roles OR an active employee row.
-- (Bursar included for reads: finance hook in 9A-2; writes stay narrower.)
CREATE OR REPLACE FUNCTION public.online_centre_is_staff(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = p_school_id
      AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
  )
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.people p ON p.id = e.person_id
    WHERE p.auth_user_id = auth.uid()
      AND e.school_id = p_school_id
      AND e.status = 'active'
  );
$$;

-- Staff writers: admin / principal / centre teachers (bursar excluded).
CREATE OR REPLACE FUNCTION public.online_centre_can_write(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = p_school_id
      AND ur.role_id IN ('admin', 'principal', 'teacher')
  );
$$;

-- Learner relationship to the school: actively enrolled (physical school)
-- student, holder of an ACTIVE online_enrolments row (centre-only learners
-- with no physical enrolment), or guardian of either. Catalogue visibility
-- key, not a data grant.
CREATE OR REPLACE FUNCTION public.online_centre_is_learner(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_enrolments se
    JOIN public.students s ON s.id = se.student_id
    JOIN public.people p ON p.id = s.person_id
    WHERE se.school_id = p_school_id
      AND se.status = 'active'
      AND p.auth_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.student_enrolments se
    WHERE se.school_id = p_school_id
      AND se.status = 'active'
      AND se.student_id IN (
        SELECT public.current_guardian_student_ids_for_school(p_school_id)
      )
  )
  -- Centre-only learners: ACTIVE online enrolment, no physical enrolment
  -- required. Guardian branch joins student_guardians directly (the shared
  -- guardian helper above requires a physical enrolment, so it cannot see
  -- pure centre families).
  OR EXISTS (
    SELECT 1
    FROM public.online_enrolments oe
    JOIN public.students s ON s.id = oe.student_id
    JOIN public.people p ON p.id = s.person_id
    WHERE oe.school_id = p_school_id
      AND oe.status = 'active'
      AND p.auth_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.online_enrolments oe
    JOIN public.student_guardians sg ON sg.student_id = oe.student_id
    JOIN public.people p ON p.id = sg.guardian_person_id
    WHERE oe.school_id = p_school_id
      AND oe.status = 'active'
      AND p.auth_user_id = auth.uid()
  );
$$;

-- Own student id for the caller (NULL when the caller is not a student).
CREATE OR REPLACE FUNCTION public.online_centre_my_student_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.people p ON p.id = s.person_id
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- School of a session (participants / learner-visibility lookups).
CREATE OR REPLACE FUNCTION public.online_centre_session_school(p_session_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.school_id FROM public.online_sessions s WHERE s.id = p_session_id;
$$;

-- School of an assignment (compensation-rule policies).
CREATE OR REPLACE FUNCTION public.online_centre_assignment_school(p_assignment_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.school_id FROM public.online_teaching_assignments a WHERE a.id = p_assignment_id;
$$;

-- Learner visibility into a session: own participant row or guardian of a
-- participant (caller must still hold a learner relationship; enforced by
-- the policy joining this with online_centre_is_learner).
CREATE OR REPLACE FUNCTION public.online_centre_session_visible_to_learner(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.online_session_participants sp
    JOIN public.online_sessions s ON s.id = sp.session_id
    WHERE sp.session_id = p_session_id
      AND (
        sp.student_id = public.online_centre_my_student_id()
        OR sp.student_id IN (
          SELECT public.current_guardian_student_ids_for_school(s.school_id)
        )
      )
  );
$$;

-- ------------------------------------------------------------------------------
-- RLS: ENABLE + school-scoped policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.online_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_pricing_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_slot_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_teacher_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_teaching_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_compensation_rules ENABLE ROW LEVEL SECURITY;

-- -- online_programmes ----------------------------------------------------------
DROP POLICY IF EXISTS online_programmes_read ON public.online_programmes;
CREATE POLICY online_programmes_read ON public.online_programmes
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(school_id)
    OR public.online_centre_is_learner(school_id)
  );

DROP POLICY IF EXISTS online_programmes_insert ON public.online_programmes;
CREATE POLICY online_programmes_insert ON public.online_programmes
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_programmes_update ON public.online_programmes;
CREATE POLICY online_programmes_update ON public.online_programmes
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_offerings -----------------------------------------------------------
DROP POLICY IF EXISTS online_offerings_read ON public.online_offerings;
CREATE POLICY online_offerings_read ON public.online_offerings
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(school_id)
    OR public.online_centre_is_learner(school_id)
  );

DROP POLICY IF EXISTS online_offerings_insert ON public.online_offerings;
CREATE POLICY online_offerings_insert ON public.online_offerings
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_offerings_update ON public.online_offerings;
CREATE POLICY online_offerings_update ON public.online_offerings
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_pricing_options (learners see PUBLIC rows only) --------------------
DROP POLICY IF EXISTS online_pricing_options_read ON public.online_pricing_options;
CREATE POLICY online_pricing_options_read ON public.online_pricing_options
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(school_id)
    OR (
      display_mode = 'PUBLIC'
      AND public.online_centre_is_learner(school_id)
    )
  );

DROP POLICY IF EXISTS online_pricing_options_insert ON public.online_pricing_options;
CREATE POLICY online_pricing_options_insert ON public.online_pricing_options
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_pricing_options_update ON public.online_pricing_options;
CREATE POLICY online_pricing_options_update ON public.online_pricing_options
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_slot_templates ------------------------------------------------------
DROP POLICY IF EXISTS online_slot_templates_read ON public.online_slot_templates;
CREATE POLICY online_slot_templates_read ON public.online_slot_templates
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(school_id)
    OR public.online_centre_is_learner(school_id)
  );

DROP POLICY IF EXISTS online_slot_templates_insert ON public.online_slot_templates;
CREATE POLICY online_slot_templates_insert ON public.online_slot_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_slot_templates_update ON public.online_slot_templates;
CREATE POLICY online_slot_templates_update ON public.online_slot_templates
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_bookings (staff all; students own; guardians own children) ---------
DROP POLICY IF EXISTS online_bookings_read ON public.online_bookings;
CREATE POLICY online_bookings_read ON public.online_bookings
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(school_id)
    OR student_id = public.online_centre_my_student_id()
    OR student_id IN (
      SELECT public.current_guardian_student_ids_for_school(online_bookings.school_id)
    )
  );

DROP POLICY IF EXISTS online_bookings_insert ON public.online_bookings;
CREATE POLICY online_bookings_insert ON public.online_bookings
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_bookings_update ON public.online_bookings;
CREATE POLICY online_bookings_update ON public.online_bookings
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_enrolments (same ownership shape as bookings) -----------------------
DROP POLICY IF EXISTS online_enrolments_read ON public.online_enrolments;
CREATE POLICY online_enrolments_read ON public.online_enrolments
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(school_id)
    OR student_id = public.online_centre_my_student_id()
    OR student_id IN (
      SELECT public.current_guardian_student_ids_for_school(online_enrolments.school_id)
    )
  );

DROP POLICY IF EXISTS online_enrolments_insert ON public.online_enrolments;
CREATE POLICY online_enrolments_insert ON public.online_enrolments
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_enrolments_update ON public.online_enrolments;
CREATE POLICY online_enrolments_update ON public.online_enrolments
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_sessions (staff all; learners via own participant row) --------------
DROP POLICY IF EXISTS online_sessions_read ON public.online_sessions;
CREATE POLICY online_sessions_read ON public.online_sessions
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(school_id)
    OR (
      public.online_centre_is_learner(school_id)
      AND public.online_centre_session_visible_to_learner(online_sessions.id)
    )
  );

DROP POLICY IF EXISTS online_sessions_insert ON public.online_sessions;
CREATE POLICY online_sessions_insert ON public.online_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_sessions_update ON public.online_sessions;
CREATE POLICY online_sessions_update ON public.online_sessions
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_session_participants (school resolved via DEFINER lookup) -----------
DROP POLICY IF EXISTS online_session_participants_read ON public.online_session_participants;
CREATE POLICY online_session_participants_read ON public.online_session_participants
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(public.online_centre_session_school(session_id))
    OR student_id = public.online_centre_my_student_id()
    OR student_id IN (
      SELECT public.current_guardian_student_ids_for_school(
        public.online_centre_session_school(online_session_participants.session_id)
      )
    )
  );

DROP POLICY IF EXISTS online_session_participants_insert ON public.online_session_participants;
CREATE POLICY online_session_participants_insert ON public.online_session_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.online_centre_can_write(public.online_centre_session_school(session_id))
  );

DROP POLICY IF EXISTS online_session_participants_update ON public.online_session_participants;
CREATE POLICY online_session_participants_update ON public.online_session_participants
  FOR UPDATE TO authenticated
  USING (
    public.online_centre_can_write(public.online_centre_session_school(session_id))
  )
  WITH CHECK (
    public.online_centre_can_write(public.online_centre_session_school(session_id))
  );

-- -- online_teacher_engagements (staff-only reads; teachers see own via staff) --
DROP POLICY IF EXISTS online_teacher_engagements_read ON public.online_teacher_engagements;
CREATE POLICY online_teacher_engagements_read ON public.online_teacher_engagements
  FOR SELECT TO authenticated
  USING (public.online_centre_is_staff(school_id));

DROP POLICY IF EXISTS online_teacher_engagements_insert ON public.online_teacher_engagements;
CREATE POLICY online_teacher_engagements_insert ON public.online_teacher_engagements
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_teacher_engagements_update ON public.online_teacher_engagements;
CREATE POLICY online_teacher_engagements_update ON public.online_teacher_engagements
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_teaching_assignments (staff-only reads) ------------------------------
DROP POLICY IF EXISTS online_teaching_assignments_read ON public.online_teaching_assignments;
CREATE POLICY online_teaching_assignments_read ON public.online_teaching_assignments
  FOR SELECT TO authenticated
  USING (public.online_centre_is_staff(school_id));

DROP POLICY IF EXISTS online_teaching_assignments_insert ON public.online_teaching_assignments;
CREATE POLICY online_teaching_assignments_insert ON public.online_teaching_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_teaching_assignments_update ON public.online_teaching_assignments;
CREATE POLICY online_teaching_assignments_update ON public.online_teaching_assignments
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_compensation_rules (school resolved via DEFINER lookup) --------------
DROP POLICY IF EXISTS online_compensation_rules_read ON public.online_compensation_rules;
CREATE POLICY online_compensation_rules_read ON public.online_compensation_rules
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_staff(public.online_centre_assignment_school(assignment_id))
  );

DROP POLICY IF EXISTS online_compensation_rules_insert ON public.online_compensation_rules;
CREATE POLICY online_compensation_rules_insert ON public.online_compensation_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.online_centre_can_write(public.online_centre_assignment_school(assignment_id))
  );

DROP POLICY IF EXISTS online_compensation_rules_update ON public.online_compensation_rules;
CREATE POLICY online_compensation_rules_update ON public.online_compensation_rules
  FOR UPDATE TO authenticated
  USING (
    public.online_centre_can_write(public.online_centre_assignment_school(assignment_id))
  )
  WITH CHECK (
    public.online_centre_can_write(public.online_centre_assignment_school(assignment_id))
  );
