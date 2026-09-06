-- ==============================================================================
-- SOMACAMPUS MIGRATION: ONLINE TRANSACTIONS & PAYROLL BRIDGE
-- Migration ID: 20260915000003
-- ==============================================================================
-- Phase 9 Hardening:
--  1. Atomic offer acceptance (RPC: accept_online_offer_atomic)
--  2. Atomic booking confirmation with capacity lock, conflict checks,
--     concrete session creation, and participant provisioning (RPC: confirm_online_booking_atomic)
--  3. Online session payroll claims bridge into Phase 7 payroll engine
--     with strict idempotency (source_type = 'ONLINE_SESSION', source_id = session.id)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PAYROLL BRIDGE TABLE: online_session_payroll_claims
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_session_payroll_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.online_sessions(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  period_id UUID REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  payroll_run_id UUID REFERENCES public.school_payroll_runs(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'ONLINE_SESSION',
  source_id UUID NOT NULL,
  claim_amount NUMERIC(14,2) NOT NULL CHECK (claim_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'batched', 'paid', 'voided')),
  approved_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_online_session_payroll_source UNIQUE (source_type, source_id),
  CONSTRAINT uq_online_session_payroll_session UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_online_payroll_claims_school_teacher
  ON public.online_session_payroll_claims (school_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_online_payroll_claims_run
  ON public.online_session_payroll_claims (payroll_run_id);

ALTER TABLE public.online_session_payroll_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS online_session_payroll_claims_read ON public.online_session_payroll_claims;
CREATE POLICY online_session_payroll_claims_read ON public.online_session_payroll_claims
  FOR SELECT TO authenticated
  USING (
    public.online_centre_is_leadership(school_id)
    OR teacher_id = public.current_employee_id_for_school(school_id)
  );

DROP POLICY IF EXISTS online_session_payroll_claims_write ON public.online_session_payroll_claims;
CREATE POLICY online_session_payroll_claims_write ON public.online_session_payroll_claims
  FOR ALL TO authenticated
  USING (public.online_centre_is_leadership(school_id))
  WITH CHECK (public.online_centre_is_leadership(school_id));

-- Function to record or retrieve an online session payroll claim (idempotent)
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
BEGIN
  -- 1. Fetch and verify session
  SELECT * INTO v_session FROM public.online_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  IF v_session.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Session % is %, must be COMPLETED to claim payroll', p_session_id, v_session.status;
  END IF;

  -- 2. Check if claim already exists
  SELECT id INTO v_claim_id FROM public.online_session_payroll_claims
  WHERE source_type = 'ONLINE_SESSION' AND source_id = p_session_id;

  IF v_claim_id IS NOT NULL THEN
    RETURN v_claim_id;
  END IF;

  -- 3. Calculate duration in hours
  v_duration_hours := EXTRACT(EPOCH FROM (v_session.scheduled_end - v_session.scheduled_start)) / 3600.0;
  IF v_duration_hours <= 0 THEN
    v_duration_hours := 1.0;
  END IF;

  -- 4. Lookup compensation rate from online_compensation_rules or employee profile
  SELECT cr.rate, cr.currency INTO v_rate, v_currency
  FROM public.online_compensation_rules cr
  JOIN public.online_teaching_assignments ta ON ta.id = cr.assignment_id
  JOIN public.online_teacher_engagements te ON te.id = ta.engagement_id
  WHERE te.employee_id = v_session.teacher_id
    AND (ta.offering_id IS NULL OR ta.offering_id = v_session.offering_id)
    AND cr.rule_type = 'sessional_rate'
  LIMIT 1;

  IF v_rate IS NULL THEN
    SELECT hourly_rate, currency INTO v_rate, v_currency
    FROM public.employee_payroll_profiles
    WHERE employee_id = v_session.teacher_id
      AND effective_from <= CURRENT_DATE
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    LIMIT 1;
  END IF;

  IF v_rate IS NULL THEN
    v_rate := 0;
  END IF;

  v_claim_amount := ROUND(v_rate * v_duration_hours, 2);

  -- 5. Insert claim
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
    v_session.id,
    v_session.teacher_id,
    'ONLINE_SESSION',
    v_session.id,
    v_claim_amount,
    COALESCE(v_currency, 'UGX'),
    'pending'
  )
  RETURNING id INTO v_claim_id;

  RETURN v_claim_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. ATOMIC RPC: accept_online_offer_atomic
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
  v_result JSONB;
BEGIN
  -- 1. Lock and verify offer
  SELECT * INTO v_offer FROM public.online_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer % not found', p_offer_id;
  END IF;

  IF v_offer.status <> 'sent' THEN
    RAISE EXCEPTION 'Offer % is %, must be sent', p_offer_id, v_offer.status;
  END IF;

  IF v_offer.valid_until IS NOT NULL AND v_offer.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Offer % expired (valid_until %)', p_offer_id, v_offer.valid_until;
  END IF;

  -- 2. Update offer status to accepted
  UPDATE public.online_offers
  SET status = 'accepted', updated_at = now()
  WHERE id = p_offer_id;

  -- 3. Insert active online enrolment
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

  -- 4. Update enquiry status to enrolled
  UPDATE public.online_enquiries
  SET status = 'enrolled', updated_at = now()
  WHERE id = v_offer.enquiry_id;

  v_result := jsonb_build_object(
    'id', v_enrolment_id,
    'schoolId', v_offer.school_id,
    'studentId', p_student_id,
    'offeringId', v_offer.offering_id,
    'status', 'active'
  );

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. ATOMIC RPC: confirm_online_booking_atomic
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
  -- 1. Lock and verify booking
  SELECT * INTO v_booking FROM public.online_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;

  IF v_booking.status <> 'requested' THEN
    RAISE EXCEPTION 'Booking % status is %, must be requested', p_booking_id, v_booking.status;
  END IF;

  -- 2. Verify capacity if slot template linked
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
          v_booking.slot_template_id, v_template.capacity, v_booking.scheduled_date;
      END IF;
    END IF;
  END IF;

  -- 3. Calculate session timestamps
  v_session_start := (v_booking.scheduled_date || ' ' || v_booking.start_time)::timestamp AT TIME ZONE 'UTC';
  v_session_end := (v_booking.scheduled_date || ' ' || v_booking.end_time)::timestamp AT TIME ZONE 'UTC';
  v_day_of_week := EXTRACT(ISODOW FROM v_booking.scheduled_date);

  -- 4. Check teacher timetable conflict (physical)
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
    RAISE EXCEPTION 'Teacher % has a conflicting physical timetable entry', p_teacher_id;
  END IF;

  -- 5. Check teacher online session conflict
  SELECT EXISTS (
    SELECT 1 FROM public.online_sessions os
    WHERE os.teacher_id = p_teacher_id
      AND os.status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS')
      AND os.scheduled_start < v_session_end
      AND os.scheduled_end > v_session_start
  ) INTO v_has_os_conflict;

  IF v_has_os_conflict THEN
    RAISE EXCEPTION 'Teacher % has a conflicting online session', p_teacher_id;
  END IF;

  -- 6. Create or link concrete session
  SELECT id INTO v_session_id FROM public.online_sessions WHERE booking_id = v_booking.id;

  IF v_session_id IS NULL THEN
    INSERT INTO public.online_sessions (
      school_id,
      offering_id,
      booking_id,
      teacher_id,
      scheduled_start,
      scheduled_end,
      session_type,
      status
    ) VALUES (
      v_booking.school_id,
      v_booking.offering_id,
      v_booking.id,
      p_teacher_id,
      v_session_start,
      v_session_end,
      'lesson',
      'CONFIRMED'
    )
    RETURNING id INTO v_session_id;
  ELSE
    UPDATE public.online_sessions
    SET status = 'CONFIRMED', teacher_id = p_teacher_id, scheduled_start = v_session_start, scheduled_end = v_session_end
    WHERE id = v_session_id;
  END IF;

  -- 7. Add participant row
  INSERT INTO public.online_session_participants (
    session_id,
    student_id,
    participation_status
  ) VALUES (
    v_session_id,
    v_booking.student_id,
    'pending'
  )
  ON CONFLICT (session_id, student_id) DO NOTHING;

  -- 8. Mark booking confirmed
  UPDATE public.online_bookings
  SET status = 'confirmed',
      confirmed_by = (SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1)
  WHERE id = p_booking_id;

  v_result := jsonb_build_object(
    'bookingId', v_booking.id,
    'sessionId', v_session_id,
    'schoolId', v_booking.school_id,
    'studentId', v_booking.student_id,
    'scheduledDate', v_booking.scheduled_date,
    'status', 'confirmed'
  );

  RETURN v_result;
END;
$$;
