-- ==============================================================================
-- Migration: 20260915000005_timetable_and_booking_security_hardening.sql
-- Description: Hardens SECURITY DEFINER RPCs for timetable publishing, online
--              booking confirmation, and effective-dated sessional payroll claims.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDENED PUBLISH TIMETABLE RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_timetable_atomic(
  p_timetable_id UUID,
  p_published_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_term_id UUID;
  v_status TEXT;
  v_scorecard JSONB;
  v_hard_violations INT;
  v_archived_count INT;
BEGIN
  -- 1. In-function authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'publish_timetable_atomic: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Fetch target timetable
  SELECT school_id, term_id, status, constraint_scorecard
  INTO v_school_id, v_term_id, v_status, v_scorecard
  FROM public.timetables
  WHERE id = p_timetable_id;
  
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Timetable % not found', p_timetable_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Authorization check: caller must be school leadership
  IF NOT public.is_leadership_in_school(v_school_id) THEN
    RAISE EXCEPTION 'publish_timetable_atomic: caller is not authorized leadership for school %', v_school_id
      USING ERRCODE = '42501';
  END IF;

  -- 4. State machine prerequisite: target timetable must be in 'approved' status
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Timetable % is in status %, must be approved before publication', p_timetable_id, v_status
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Invariant check: zero hard constraint violations
  v_hard_violations := COALESCE((v_scorecard->>'hardViolationsCount')::int, 0);
  IF v_hard_violations > 0 THEN
    RAISE EXCEPTION 'Timetable % has % hard constraint violations; cannot publish', p_timetable_id, v_hard_violations
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Verify publisher employee belongs to this school
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_published_by
      AND e.school_id = v_school_id
  ) THEN
    RAISE EXCEPTION 'Publisher employee % does not belong to school %', p_published_by, v_school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Archive previously active published timetable for this school and term
  UPDATE public.timetables
  SET is_active = false,
      status = 'archived',
      updated_at = now()
  WHERE school_id = v_school_id
    AND term_id = v_term_id
    AND is_active = true
    AND id <> p_timetable_id;

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  -- 8. Transactionally publish the target timetable
  UPDATE public.timetables
  SET is_active = true,
      status = 'published',
      published_at = now(),
      approved_by = p_published_by,
      updated_at = now()
  WHERE id = p_timetable_id;

  RETURN jsonb_build_object(
    'success', true,
    'timetable_id', p_timetable_id,
    'archived_count', v_archived_count,
    'status', 'published'
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. HARDENED ONLINE BOOKING CONFIRMATION RPC
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
        WHERE e.id = p_teacher_id
          AND e.user_id = auth.uid()
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

  -- 5. Verify teacher has an active engagement or assignment for this offering
  IF NOT EXISTS (
    SELECT 1 FROM public.online_teacher_engagements te
    LEFT JOIN public.online_teaching_assignments ta ON ta.engagement_id = te.id
    WHERE te.employee_id = p_teacher_id
      AND te.school_id = v_booking.school_id
      AND te.status = 'active'
      AND (ta.offering_id IS NULL OR ta.offering_id = v_booking.offering_id)
  ) THEN
    RAISE EXCEPTION 'Teacher % has no active engagement or teaching assignment for offering %', p_teacher_id, v_booking.offering_id
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

  -- 10. Provision concrete session row
  INSERT INTO public.online_sessions (
    school_id,
    offering_id,
    teacher_id,
    scheduled_start,
    scheduled_end,
    status
  ) VALUES (
    v_booking.school_id,
    v_booking.offering_id,
    p_teacher_id,
    v_session_start,
    v_session_end,
    'CONFIRMED'
  )
  RETURNING id INTO v_session_id;

  -- 11. Link participant to session
  INSERT INTO public.online_session_participants (
    school_id,
    session_id,
    student_id,
    participation_status
  ) VALUES (
    v_booking.school_id,
    v_session_id,
    v_booking.student_id,
    'pending'
  );

  -- 12. Update booking row
  UPDATE public.online_bookings
  SET status = 'confirmed',
      updated_at = now()
  WHERE id = p_booking_id;

  v_result := jsonb_build_object(
    'bookingId', p_booking_id,
    'sessionId', v_session_id,
    'teacherId', p_teacher_id,
    'status', 'confirmed',
    'scheduledStart', v_session_start,
    'scheduledEnd', v_session_end
  );

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. EFFECTIVE-DATED SESSIONAL PAYROLL CLAIMS
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

  v_session_date := v_session.scheduled_start::date;

  -- 5. Lookup compensation rate effective AT THE TIME OF THE SESSION
  SELECT cr.rate, cr.currency INTO v_rate, v_currency
  FROM public.online_compensation_rules cr
  JOIN public.online_teaching_assignments ta ON ta.id = cr.assignment_id
  JOIN public.online_teacher_engagements te ON te.id = ta.engagement_id
  WHERE te.employee_id = v_session.teacher_id
    AND (ta.offering_id IS NULL OR ta.offering_id = v_session.offering_id)
    AND cr.rule_type = 'sessional_rate'
  LIMIT 1;

  IF v_rate IS NULL THEN
    -- Fallback to employee payroll profile effective on the session date
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

  -- 6. Insert claim row
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
