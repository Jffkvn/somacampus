-- ==============================================================================
-- Migration: 20260916000000_official_teaching_subjects_and_allocations.sql
-- Description: 
--   1. Official Teaching Subjects (authoritative staff qualifications/appointments)
--   2. Teaching Allocations (management class-subject assignments for academic periods)
--   3. approve_teaching_allocations_atomic RPC (transactional derived sync to subject_teachers)
--   4. approve_timetable_atomic RPC (leadership-only, zero hard violations check)
--   5. Hardened accept_online_offer_atomic (parent/student/leadership caller authorization)
--   6. Hardened confirm_online_booking_atomic (explicit offering assignment check)
--   7. Corrected record_online_session_payroll_claim (session date effective rate evaluation)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. OFFICIAL TEACHING SUBJECTS TABLE
-- Authoritative staff record of subjects a teacher is trained, qualified, and appointed to teach.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teacher_official_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  appointed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, teacher_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_official_subjects_school_teacher
  ON public.teacher_official_subjects (school_id, teacher_id);

CREATE INDEX IF NOT EXISTS idx_official_subjects_school_subject
  ON public.teacher_official_subjects (school_id, subject_id);

-- Cross-tenant integrity check for official teaching subjects
CREATE OR REPLACE FUNCTION public.check_official_subject_tenant_integrity()
RETURNS TRIGGER AS $$
BEGIN
  -- Verify teacher belongs to the same school
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = NEW.teacher_id AND e.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Teacher % does not belong to school %', NEW.teacher_id, NEW.school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Verify subject belongs to the same school
  IF NOT EXISTS (
    SELECT 1 FROM public.subjects s
    WHERE s.id = NEW.subject_id AND s.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Subject % does not belong to school %', NEW.subject_id, NEW.school_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_official_subject_tenant_integrity ON public.teacher_official_subjects;
CREATE TRIGGER trg_official_subject_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.teacher_official_subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.check_official_subject_tenant_integrity();

-- RLS for teacher_official_subjects
ALTER TABLE public.teacher_official_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_official_subjects_read ON public.teacher_official_subjects;
CREATE POLICY teacher_official_subjects_read ON public.teacher_official_subjects
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff_in_school(school_id)
    OR public.is_leadership_in_school(school_id)
  );

DROP POLICY IF EXISTS teacher_official_subjects_write ON public.teacher_official_subjects;
CREATE POLICY teacher_official_subjects_write ON public.teacher_official_subjects
  FOR ALL
  TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

-- ------------------------------------------------------------------------------
-- 2. TEACHING ALLOCATIONS TABLE
-- Management-approved decision regarding which class/year group a teacher will teach
-- for a specific subject during an academic period.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teaching_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  stream_id UUID REFERENCES public.streams(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  periods_per_week INT NOT NULL DEFAULT 1 CHECK (periods_per_week > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'archived')),
  allocation_source TEXT NOT NULL DEFAULT 'human' CHECK (allocation_source IN ('human', 'ai_draft')),
  proposal_reason TEXT,
  approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_teaching_allocations_lookup
  ON public.teaching_allocations (school_id, academic_year_id, class_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_teaching_allocations_teacher
  ON public.teaching_allocations (school_id, teacher_id, status);

-- Enforce teacher subject qualification before allocation
CREATE OR REPLACE FUNCTION public.check_teaching_allocation_subject_eligibility()
RETURNS TRIGGER AS $$
BEGIN
  -- Verify teacher is appointed to this official subject in this school
  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_official_subjects tos
    WHERE tos.school_id = NEW.school_id
      AND tos.teacher_id = NEW.teacher_id
      AND tos.subject_id = NEW.subject_id
  ) THEN
    RAISE EXCEPTION 'Teacher % is not officially appointed to teach subject % in school %',
      NEW.teacher_id, NEW.subject_id, NEW.school_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_teaching_allocation_subject_eligibility ON public.teaching_allocations;
CREATE TRIGGER trg_teaching_allocation_subject_eligibility
  BEFORE INSERT OR UPDATE ON public.teaching_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_teaching_allocation_subject_eligibility();

-- RLS for teaching_allocations
ALTER TABLE public.teaching_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teaching_allocations_read ON public.teaching_allocations;
CREATE POLICY teaching_allocations_read ON public.teaching_allocations
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff_in_school(school_id)
    OR public.is_leadership_in_school(school_id)
  );

DROP POLICY IF EXISTS teaching_allocations_write ON public.teaching_allocations;
CREATE POLICY teaching_allocations_write ON public.teaching_allocations
  FOR ALL
  TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

-- ------------------------------------------------------------------------------
-- 3. ATOMIC RPC: approve_teaching_allocations_atomic
-- Approves a batch of teaching allocations and transactionally syncs to subject_teachers
-- as a derived compatibility projection for legacy Phase 3/4/5/8/9 RLS.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_teaching_allocations_atomic(
  p_allocation_ids UUID[],
  p_approved_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc RECORD;
  v_school_id UUID;
  v_approved_count INT := 0;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'approve_teaching_allocations_atomic: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Verify approver employee and leadership permissions
  SELECT school_id INTO v_school_id
  FROM public.employees
  WHERE id = p_approved_by;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Approver employee % not found', p_approved_by
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_leadership_in_school(v_school_id) THEN
    RAISE EXCEPTION 'approve_teaching_allocations_atomic: caller is not authorized leadership for school %', v_school_id
      USING ERRCODE = '42501';
  END IF;

  -- 3. Loop over allocations, verify school match, subject eligibility, and approve
  FOR v_alloc IN
    SELECT * FROM public.teaching_allocations
    WHERE id = ANY(p_allocation_ids)
    FOR UPDATE
  LOOP
    IF v_alloc.school_id <> v_school_id THEN
      RAISE EXCEPTION 'Allocation % does not belong to school %', v_alloc.id, v_school_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Verify official subject qualification
    IF NOT EXISTS (
      SELECT 1 FROM public.teacher_official_subjects tos
      WHERE tos.school_id = v_alloc.school_id
        AND tos.teacher_id = v_alloc.teacher_id
        AND tos.subject_id = v_alloc.subject_id
    ) THEN
      RAISE EXCEPTION 'Allocation % teacher % is not appointed to official subject %',
        v_alloc.id, v_alloc.teacher_id, v_alloc.subject_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Update teaching allocation to approved
    UPDATE public.teaching_allocations
    SET status = 'approved',
        approved_by = p_approved_by,
        approved_at = now(),
        updated_at = now()
    WHERE id = v_alloc.id;

    -- Transactionally maintain derived compatibility projection in subject_teachers
    IF v_alloc.stream_id IS NOT NULL THEN
      -- Delete any existing conflicting active stream assignment if replacing
      DELETE FROM public.subject_teachers
      WHERE stream_id = v_alloc.stream_id
        AND subject_id = v_alloc.subject_id
        AND effective_from = v_alloc.effective_from;

      INSERT INTO public.subject_teachers (
        school_id, class_id, stream_id, subject_id, teacher_id, effective_from, effective_to
      ) VALUES (
        v_alloc.school_id, v_alloc.class_id, v_alloc.stream_id, v_alloc.subject_id,
        v_alloc.teacher_id, v_alloc.effective_from, v_alloc.effective_to
      );
    ELSE
      -- Unstreamed class level assignment
      INSERT INTO public.subject_teachers (
        school_id, class_id, stream_id, subject_id, teacher_id, effective_from, effective_to
      ) VALUES (
        v_alloc.school_id, v_alloc.class_id, NULL, v_alloc.subject_id,
        v_alloc.teacher_id, v_alloc.effective_from, v_alloc.effective_to
      );
    END IF;

    v_approved_count := v_approved_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'approved_count', v_approved_count,
    'school_id', v_school_id
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. ATOMIC RPC: approve_timetable_atomic
-- Transitions reviewed timetable to approved status after validating 0 hard violations.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_timetable_atomic(
  p_timetable_id UUID,
  p_approved_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tt public.timetables%ROWTYPE;
  v_hard_violations INT;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'approve_timetable_atomic: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Fetch and lock timetable
  SELECT * INTO v_tt FROM public.timetables WHERE id = p_timetable_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timetable % not found', p_timetable_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Leadership check
  IF NOT public.is_leadership_in_school(v_tt.school_id) THEN
    RAISE EXCEPTION 'approve_timetable_atomic: caller is not authorized leadership for school %', v_tt.school_id
      USING ERRCODE = '42501';
  END IF;

  -- 4. Invariant check: zero hard constraint violations
  v_hard_violations := COALESCE((v_tt.constraint_scorecard->>'hardViolationsCount')::int, 0);
  IF v_hard_violations > 0 THEN
    RAISE EXCEPTION 'Timetable % has % hard constraint violations; cannot approve', p_timetable_id, v_hard_violations
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Approver employee verification
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_approved_by AND e.school_id = v_tt.school_id
  ) THEN
    RAISE EXCEPTION 'Approver employee % does not belong to school %', p_approved_by, v_tt.school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Transition status
  UPDATE public.timetables
  SET status = 'approved',
      approved_by = p_approved_by,
      approved_at = now(),
      updated_at = now()
  WHERE id = p_timetable_id;

  RETURN jsonb_build_object(
    'success', true,
    'timetable_id', p_timetable_id,
    'status', 'approved',
    'approved_by', p_approved_by
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. HARDENED: accept_online_offer_atomic
-- Enforces authorized caller: parent of student, student user, or school leadership/admissions.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_online_offer_atomic(
  p_offer_id UUID,
  p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.online_offers%ROWTYPE;
  v_enrolment_id UUID;
  v_is_authorized BOOLEAN := false;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'accept_online_offer_atomic: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock and verify offer
  SELECT * INTO v_offer FROM public.online_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer % not found', p_offer_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_offer.status <> 'sent' THEN
    RAISE EXCEPTION 'Offer % is %, must be sent', p_offer_id, v_offer.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_offer.valid_until IS NOT NULL AND v_offer.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Offer % expired (valid_until %)', p_offer_id, v_offer.valid_until
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Verify student belongs to offer's school
  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id AND s.school_id = v_offer.school_id
  ) THEN
    RAISE EXCEPTION 'Student % does not belong to school %', p_student_id, v_offer.school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Authorization check: caller must be leadership/staff, student themselves, or parent
  IF public.is_leadership_in_school(v_offer.school_id) OR public.is_staff_in_school(v_offer.school_id) THEN
    v_is_authorized := true;
  ELSIF EXISTS (
    -- Student themselves
    SELECT 1 FROM public.students s
    JOIN public.people p ON p.id = s.person_id
    WHERE s.id = p_student_id AND p.auth_user_id = auth.uid()
  ) THEN
    v_is_authorized := true;
  ELSIF EXISTS (
    -- Parent / Guardian of student
    SELECT 1 FROM public.guardians g
    JOIN public.people p ON p.id = g.person_id
    WHERE g.student_id = p_student_id AND p.auth_user_id = auth.uid()
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'accept_online_offer_atomic: caller is not authorized to accept offer for student %', p_student_id
      USING ERRCODE = '42501';
  END IF;

  -- 5. Update offer status to accepted
  UPDATE public.online_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  -- 6. Insert active online enrolment
  INSERT INTO public.online_enrolments (
    school_id,
    student_id,
    offering_id,
    pricing_option_id,
    status
  ) VALUES (
    v_offer.school_id,
    p_student_id,
    v_offer.offering_id,
    v_offer.pricing_option_id,
    'active'
  )
  RETURNING id INTO v_enrolment_id;

  -- 7. Update enquiry status to enrolled if linked
  IF v_offer.enquiry_id IS NOT NULL THEN
    UPDATE public.online_enquiries
    SET status = 'enrolled', updated_at = now()
    WHERE id = v_offer.enquiry_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_enrolment_id,
    'schoolId', v_offer.school_id,
    'studentId', p_student_id,
    'offeringId', v_offer.offering_id,
    'status', 'active'
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. HARDENED: confirm_online_booking_atomic
-- Enforces explicit offering teaching assignment (ta.offering_id = v_booking.offering_id)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_online_booking_atomic(
  p_booking_id UUID,
  p_teacher_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.online_bookings%ROWTYPE;
  v_template public.online_slot_templates%ROWTYPE;
  v_confirmed_count INT;
  v_session_start TIMESTAMPTZ;
  v_session_end TIMESTAMPTZ;
  v_day_of_week INT;
  v_has_tt_conflict BOOLEAN;
  v_has_os_conflict BOOLEAN;
  v_session_id UUID;
  v_result JSONB;
BEGIN
  -- 1. In-function authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'confirm_online_booking_atomic: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock and verify booking
  SELECT * INTO v_booking FROM public.online_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.status <> 'requested' THEN
    RAISE EXCEPTION 'Booking % status is %, must be requested', p_booking_id, v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Authorization check: caller must be leadership or the teacher assigned
  IF NOT (
    public.is_leadership_in_school(v_booking.school_id)
    OR (
      public.is_staff_in_school(v_booking.school_id)
      AND EXISTS (
        SELECT 1 FROM public.employees e
        JOIN public.people p ON p.id = e.person_id
        WHERE e.id = p_teacher_id
          AND p.auth_user_id = auth.uid()
      )
    )
  ) THEN
    RAISE EXCEPTION 'confirm_online_booking_atomic: caller is not authorized to confirm this booking'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Verify teacher belongs to the same school
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_teacher_id
      AND e.school_id = v_booking.school_id
  ) THEN
    RAISE EXCEPTION 'Teacher % does not belong to booking school %', p_teacher_id, v_booking.school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. EXPLICIT ELIGIBILITY: Verify teacher has active engagement AND is explicitly assigned to this offering
  IF NOT EXISTS (
    SELECT 1 FROM public.online_teacher_engagements te
    JOIN public.online_teaching_assignments ta ON ta.engagement_id = te.id
    WHERE te.employee_id = p_teacher_id
      AND te.school_id = v_booking.school_id
      AND te.status = 'active'
      AND ta.offering_id = v_booking.offering_id
  ) THEN
    RAISE EXCEPTION 'Teacher % is not explicitly assigned to teach offering %', p_teacher_id, v_booking.offering_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Verify capacity if slot template is linked
  IF v_booking.slot_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.online_slot_templates WHERE id = v_booking.slot_template_id FOR UPDATE;
    IF FOUND THEN
      SELECT COUNT(*) INTO v_confirmed_count
      FROM public.online_bookings
      WHERE slot_template_id = v_booking.slot_template_id
        AND scheduled_date = v_booking.scheduled_date
        AND status = 'confirmed';

      IF v_confirmed_count >= v_template.capacity THEN
        RAISE EXCEPTION 'Slot template % is at maximum capacity (%) for date %',
          v_booking.slot_template_id, v_template.capacity, v_booking.scheduled_date
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- 7. Calculate session timestamps
  v_session_start := (v_booking.scheduled_date || ' ' || v_booking.start_time)::timestamp AT TIME ZONE 'UTC';
  v_session_end := (v_booking.scheduled_date || ' ' || v_booking.end_time)::timestamp AT TIME ZONE 'UTC';
  v_day_of_week := EXTRACT(ISODOW FROM v_booking.scheduled_date);

  -- 8. Check teacher physical timetable conflict
  SELECT EXISTS (
    SELECT 1 FROM public.timetable_entries te
    JOIN public.timetables t ON t.id = te.timetable_id
    WHERE te.teacher_id = p_teacher_id
      AND t.is_active = true
      AND te.day_of_week = v_day_of_week
      AND te.start_time < v_booking.end_time
      AND te.end_time > v_booking.start_time
  ) INTO v_has_tt_conflict;

  IF v_has_tt_conflict THEN
    RAISE EXCEPTION 'Teacher % has a conflicting physical timetable entry', p_teacher_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 9. Check teacher online session conflict
  SELECT EXISTS (
    SELECT 1 FROM public.online_sessions os
    WHERE os.teacher_id = p_teacher_id
      AND os.status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS')
      AND os.scheduled_start < v_session_end
      AND os.scheduled_end > v_session_start
  ) INTO v_has_os_conflict;

  IF v_has_os_conflict THEN
    RAISE EXCEPTION 'Teacher % has a conflicting online session', p_teacher_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 10. Update booking status
  UPDATE public.online_bookings
  SET status = 'confirmed',
      teacher_id = p_teacher_id,
      updated_at = now()
  WHERE id = p_booking_id;

  -- 11. Create online session record
  INSERT INTO public.online_sessions (
    school_id,
    offering_id,
    teacher_id,
    scheduled_start,
    scheduled_end,
    title,
    status
  ) VALUES (
    v_booking.school_id,
    v_booking.offering_id,
    p_teacher_id,
    v_session_start,
    v_session_end,
    'Confirmed 1-on-1 Academic Support Session',
    'CONFIRMED'
  )
  RETURNING id INTO v_session_id;

  -- 12. Create participant record
  INSERT INTO public.online_session_participants (
    session_id,
    student_id,
    attendance_status
  ) VALUES (
    v_session_id,
    v_booking.student_id,
    'REGISTERED'
  );

  v_result := jsonb_build_object(
    'booking_id', p_booking_id,
    'session_id', v_session_id,
    'teacher_id', p_teacher_id,
    'status', 'confirmed',
    'scheduled_start', v_session_start,
    'scheduled_end', v_session_end
  );

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. CORRECTED: record_online_session_payroll_claim
-- Evaluates compensation rate effective at session.scheduled_start::date, NOT CURRENT_DATE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_online_session_payroll_claim(
  p_session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.online_sessions%ROWTYPE;
  v_rate NUMERIC(14,2);
  v_currency TEXT := 'UGX';
  v_duration_hours NUMERIC(6,2);
  v_claim_amount NUMERIC(14,2);
  v_claim_id UUID;
  v_session_date DATE;
BEGIN
  -- 1. In-function authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_online_session_payroll_claim: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Fetch and verify session
  SELECT * INTO v_session FROM public.online_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Session % is %, must be COMPLETED to claim payroll', p_session_id, v_session.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Idempotency check: claim already recorded
  SELECT id INTO v_claim_id FROM public.online_session_payroll_claims
  WHERE source_type = 'ONLINE_SESSION' AND source_id = p_session_id;

  IF v_claim_id IS NOT NULL THEN
    RETURN v_claim_id;
  END IF;

  -- 4. Calculate duration in hours
  v_duration_hours := EXTRACT(EPOCH FROM (v_session.scheduled_end - v_session.scheduled_start)) / 3600.0;
  IF v_duration_hours <= 0 THEN
    v_duration_hours := 1.0;
  END IF;

  -- Effective date is the historical date when the session occurred
  v_session_date := v_session.scheduled_start::date;

  -- 5. Lookup compensation rate effective on session_date from online_compensation_rules
  SELECT cr.rate, cr.currency INTO v_rate, v_currency
  FROM public.online_compensation_rules cr
  JOIN public.online_teaching_assignments ta ON ta.id = cr.assignment_id
  JOIN public.online_teacher_engagements te ON te.id = ta.engagement_id
  WHERE te.employee_id = v_session.teacher_id
    AND (ta.offering_id IS NULL OR ta.offering_id = v_session.offering_id)
    AND cr.pay_model = 'per_session'
    AND cr.effective_from <= v_session_date
    AND (cr.effective_to IS NULL OR cr.effective_to >= v_session_date)
  ORDER BY cr.effective_from DESC
  LIMIT 1;

  -- 6. Fallback to employee payroll profile effective on the session date
  IF v_rate IS NULL THEN
    SELECT hourly_rate, currency INTO v_rate, v_currency
    FROM public.employee_payroll_profiles
    WHERE employee_id = v_session.teacher_id
      AND effective_from <= v_session_date
      AND (effective_to IS NULL OR effective_to >= v_session_date)
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;

  IF v_rate IS NULL THEN
    v_rate := 0;
  END IF;

  v_claim_amount := ROUND(v_rate * v_duration_hours, 2);

  -- 7. Insert payroll claim
  INSERT INTO public.online_session_payroll_claims (
    school_id,
    session_id,
    teacher_id,
    source_type,
    source_id,
    claim_amount,
    currency,
    status
  ) VALUES (
    v_session.school_id,
    p_session_id,
    v_session.teacher_id,
    'ONLINE_SESSION',
    p_session_id,
    v_claim_amount,
    v_currency,
    'PENDING'
  )
  RETURNING id INTO v_claim_id;

  RETURN v_claim_id;
END;
$$;
