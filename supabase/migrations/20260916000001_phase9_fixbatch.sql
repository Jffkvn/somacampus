-- ==============================================================================
-- Migration: 20260916000001_phase9_fixbatch.sql
-- Description:
--   Phase 9 fix batch F1 (corrective, idempotent, no changes to existing files):
--   1. Redefine confirm_online_booking_atomic (auth + leadership/self authz,
--      teacher-school + explicit offering-assignment checks; participants WITHOUT
--      school_id WITH participation_status='pending'; bookings WITHOUT
--      updated_at/teacher_id keeping confirmed_by; sessions WITH booking_id,
--      WITHOUT title).
--   2. Redefine accept_online_offer_atomic (auth + narrowed accept; replaces
--      non-existent public.guardians with student_guardians join; student school
--      resolved via student_enrolments since students has no school_id).
--   3. Redefine record_online_session_payroll_claim (pay_model='per_session',
--      lowercase 'pending', session-date-effective rate lookup, auth check).
--   4. Fix is_staff_in_school (employees has no user_id; reuse
--      current_employee_id_for_school IS NOT NULL).
--   5. Redefine publish_timetable_atomic (v2 gates retained: auth + leadership +
--      approved-state + hard-violation gates).
--   6. Unify is_leadership_in_school on user_roles.role_id (admin/principal/
--      bursar) to match online_centre_is_leadership (roles.name holds display
--      labels per supabase/seed.sql, so name-based matching could never fire).
--   7. teaching_allocations: SET search_path on trigger fns (non-destructive
--      ALTER FUNCTION); new class/stream/academic_year tenant trigger; narrowed
--      subject_teachers DELETE (school + teacher guards) with overlapping-range
--      cleanup so re-approve is idempotent under the EXCLUDE constraint.
--   8. REVOKE ALL ON FUNCTION FROM PUBLIC + GRANT EXECUTE TO authenticated for
--      every RPC touched here.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 4. FIX: is_staff_in_school (employees has NO user_id column; the canonical
--    identity path is employees.person_id -> people.auth_user_id, encapsulated
--    by current_employee_id_for_school, verified to exist in
--    20260912000006_school_scoped_employee_identity.sql).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff_in_school(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_employee_id_for_school(p_school_id) IS NOT NULL;
$$;

-- ------------------------------------------------------------------------------
-- 6. FIX: is_leadership_in_school unified on role_id.
-- Choice documented: supabase/seed.sql inserts roles with ids
-- ('admin','principal','teacher','bursar','parent','student') and display names
-- ('Administrator','Principal / Director',...). The previous predicate
-- r.name IN ('head_teacher','deputy_head','director','admin','bursar',
-- 'academic_head') could therefore never be true. This matches
-- online_centre_is_leadership (20260915000001), which checks
-- user_roles.role_id IN ('admin','principal','bursar').
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_leadership_in_school(p_school_id UUID)
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
      AND ur.role_id IN ('admin', 'principal', 'bursar')
  );
$$;

-- ------------------------------------------------------------------------------
-- 1. REDEFINE: confirm_online_booking_atomic (corrected identifiers).
-- Base columns verified in 20260914000000_online_centre.sql:
--   online_bookings: NO teacher_id, NO updated_at (has confirmed_by).
--   online_sessions: NO title (HAS booking_id).
--   online_session_participants: NO school_id, NO attendance_status
--     (participation_status IN pending/present/absent/late/partial/excused).
-- Keeps the 20260916000000 explicit offering-assignment requirement
-- (ta.offering_id = v_booking.offering_id).
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

  -- 3. Authorization: leadership, or the assigned teacher confirming self.
  -- (employees has no user_id; identity resolved via people.auth_user_id.)
  IF NOT (
    public.is_leadership_in_school(v_booking.school_id)
    OR (
      public.is_staff_in_school(v_booking.school_id)
      AND EXISTS (
        SELECT 1 FROM public.employees e
        JOIN public.people p ON p.id = e.person_id
        WHERE e.id = p_teacher_id
          AND e.school_id = v_booking.school_id
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

  -- 5. EXPLICIT ELIGIBILITY: active engagement AND explicit assignment to this offering
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

  -- 10. Provision concrete session row (WITH booking_id, WITHOUT title:
  -- online_sessions has no title column).
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

  -- 11. Link participant to session (NO school_id column; participation_status
  -- uses lowercase 'pending', NOT attendance_status/'REGISTERED').
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

  -- 12. Mark booking confirmed (NO updated_at / teacher_id columns on
  -- online_bookings; record the confirmer via confirmed_by).
  UPDATE public.online_bookings
  SET status = 'confirmed',
      confirmed_by = (SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1)
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
-- 2. REDEFINE: accept_online_offer_atomic (narrowed accept, corrected joins).
-- Fixes vs 20260916000000:
--   (a) public.guardians does not exist; canonical link is
--       student_guardians(student_id, guardian_person_id) joined via people.
--   (b) students has no school_id; school resolved via student_enrolments.
--       Prospects may not have an enrolment row yet, so the tenant check only
--       fires when the student already has enrolments (at least one must then
--       belong to the offer's school).
--   (c) Narrows the staff side to leadership (role_id admin/principal/bursar);
--       the prior blanket is_staff_in_school accept was both over-broad and
--       unrunnable (e.user_id does not exist). Self (student user) and parent
--       (guardian) paths retained per existing convention.
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

  -- 3. Tenant check: if the student already has physical enrolments, at least
  -- one must belong to the offer's school (students carries no school_id).
  IF EXISTS (
    SELECT 1 FROM public.student_enrolments se
    WHERE se.student_id = p_student_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.student_enrolments se
    WHERE se.student_id = p_student_id
      AND se.school_id = v_offer.school_id
  ) THEN
    RAISE EXCEPTION 'Student % does not belong to school %', p_student_id, v_offer.school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Authorization: leadership, the student themselves, or their guardian.
  IF public.is_leadership_in_school(v_offer.school_id) THEN
    v_is_authorized := true;
  ELSIF EXISTS (
    -- Student themselves
    SELECT 1 FROM public.students s
    JOIN public.people p ON p.id = s.person_id
    WHERE s.id = p_student_id AND p.auth_user_id = auth.uid()
  ) THEN
    v_is_authorized := true;
  ELSIF EXISTS (
    -- Parent / guardian via canonical student_guardians link
    SELECT 1 FROM public.student_guardians sg
    JOIN public.people p ON p.id = sg.guardian_person_id
    WHERE sg.student_id = p_student_id AND p.auth_user_id = auth.uid()
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
-- 3. REDEFINE: record_online_session_payroll_claim (corrected identifiers).
-- Fixes vs 20260916000000: status CHECK on online_session_payroll_claims is
-- lowercase (pending/approved/batched/paid/voided), so 'PENDING' could never
-- insert. Compensation uses pay_model (not rule_type). Keeps the
-- session-date-effective rate lookup. Adds COALESCE on currency because a
-- no-row SELECT ... INTO nulls out the 'UGX' initializer.
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

  -- 5. Lookup compensation rate effective on session_date
  -- (online_compensation_rules uses pay_model, NOT rule_type).
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

  -- 7. Insert payroll claim (lowercase 'pending' per status CHECK)
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
    COALESCE(v_currency, 'UGX'),
    'pending'
  )
  RETURNING id INTO v_claim_id;

  RETURN v_claim_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. REDEFINE: publish_timetable_atomic (v2 gates retained verbatim from
-- 20260915000005: auth + leadership + approved-state + hard-violation gates +
-- publisher-employee school check + single-active invariant). Re-issued here so
-- the function is pinned against the corrected is_leadership_in_school above
-- and covered by the REVOKE/GRANT block below.
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
-- 7a. teaching_allocations trigger fns: add SET search_path (non-destructive;
-- no DROP, no body change). Both were created in 20260916000000 without it.
-- ------------------------------------------------------------------------------
ALTER FUNCTION public.check_official_subject_tenant_integrity() SET search_path = public;
ALTER FUNCTION public.check_teaching_allocation_subject_eligibility() SET search_path = public;

-- ------------------------------------------------------------------------------
-- 7b. NEW: tenant integrity for teaching_allocations FKs.
-- The 20260916000000 eligibility trigger only checks the official-subject link;
-- class_id / stream_id / academic_year_id school matching was unenforced.
-- streams carries no school_id (streams.class_id -> classes.school_id), so the
-- stream check resolves via the classes join.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_teaching_allocation_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref_school_id UUID;
BEGIN
  -- Teacher school match
  SELECT school_id INTO v_ref_school_id FROM public.employees WHERE id = NEW.teacher_id;
  IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
    RAISE EXCEPTION 'Cross-tenant violation: teacher employee does not belong to school %', NEW.school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Subject school match
  SELECT school_id INTO v_ref_school_id FROM public.subjects WHERE id = NEW.subject_id;
  IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
    RAISE EXCEPTION 'Cross-tenant violation: subject does not belong to school %', NEW.school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Class school match
  SELECT school_id INTO v_ref_school_id FROM public.classes WHERE id = NEW.class_id;
  IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
    RAISE EXCEPTION 'Cross-tenant violation: class does not belong to school %', NEW.school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Stream school match (resolved via parent class)
  IF NEW.stream_id IS NOT NULL THEN
    SELECT c.school_id INTO v_ref_school_id
    FROM public.streams s
    JOIN public.classes c ON c.id = s.class_id
    WHERE s.id = NEW.stream_id;
    IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Cross-tenant violation: stream does not belong to school %', NEW.school_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Academic year school match
  SELECT school_id INTO v_ref_school_id FROM public.academic_years WHERE id = NEW.academic_year_id;
  IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
    RAISE EXCEPTION 'Cross-tenant violation: academic year does not belong to school %', NEW.school_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teaching_allocation_tenant_integrity ON public.teaching_allocations;
CREATE TRIGGER trg_teaching_allocation_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.teaching_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_teaching_allocation_tenant_integrity();

-- ------------------------------------------------------------------------------
-- 7c. REDEFINE: approve_teaching_allocations_atomic (narrowed DELETE +
-- idempotent re-approve).
-- Fixes vs 20260916000000:
--   (a) The streamed-branch DELETE matched on (stream_id, subject_id,
--       effective_from) only: no school/teacher guards and no protection
--       against the no_overlapping_stream_subject_teachers EXCLUDE constraint
--       for overlapping ranges with a different effective_from. It now deletes
--       overlapping-range rows for the same school/class/stream/subject before
--       insert, so the EXCLUDE cannot fire within that scope.
--   (b) The unstreamed branch had no DELETE at all, so every re-approve
--       stacked a duplicate subject_teachers row. It now gets the same
--       delete-then-insert treatment (EXCLUDE does not cover NULL stream_id,
--       but duplicates would still corrupt the derived projection).
--   (c) Explicit class/stream/academic_year school-match errors (defense in
--       depth alongside the trigger in 7b).
-- Delete-then-insert runs inside the caller's single transaction, so the
-- projection swap stays atomic.
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

    -- Verify class / stream / academic year belong to the allocation school
    IF NOT EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = v_alloc.class_id AND c.school_id = v_alloc.school_id
    ) THEN
      RAISE EXCEPTION 'Allocation % class % does not belong to school %',
        v_alloc.id, v_alloc.class_id, v_alloc.school_id
        USING ERRCODE = 'P0001';
    END IF;

    IF v_alloc.stream_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.streams s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = v_alloc.stream_id AND c.school_id = v_alloc.school_id
    ) THEN
      RAISE EXCEPTION 'Allocation % stream % does not belong to school %',
        v_alloc.id, v_alloc.stream_id, v_alloc.school_id
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.academic_years ay
      WHERE ay.id = v_alloc.academic_year_id AND ay.school_id = v_alloc.school_id
    ) THEN
      RAISE EXCEPTION 'Allocation % academic year % does not belong to school %',
        v_alloc.id, v_alloc.academic_year_id, v_alloc.school_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Update teaching allocation to approved
    UPDATE public.teaching_allocations
    SET status = 'approved',
        approved_by = p_approved_by,
        approved_at = now(),
        updated_at = now()
    WHERE id = v_alloc.id;

    -- Transactionally maintain derived compatibility projection in
    -- subject_teachers: remove overlapping rows for the same
    -- school/class/stream/subject first so re-approve is idempotent and the
    -- EXCLUDE constraint cannot fire within that scope.
    IF v_alloc.stream_id IS NOT NULL THEN
      DELETE FROM public.subject_teachers st
      WHERE st.school_id = v_alloc.school_id
        AND st.class_id = v_alloc.class_id
        AND st.stream_id = v_alloc.stream_id
        AND st.subject_id = v_alloc.subject_id
        AND st.teacher_id = v_alloc.teacher_id
        AND daterange(st.effective_from, COALESCE(st.effective_to, 'infinity'::date), '[]')
          && daterange(v_alloc.effective_from, COALESCE(v_alloc.effective_to, 'infinity'::date), '[]');

      INSERT INTO public.subject_teachers (
        school_id, class_id, stream_id, subject_id, teacher_id, effective_from, effective_to
      ) VALUES (
        v_alloc.school_id, v_alloc.class_id, v_alloc.stream_id, v_alloc.subject_id,
        v_alloc.teacher_id, v_alloc.effective_from, v_alloc.effective_to
      );
    ELSE
      -- Unstreamed class level assignment
      DELETE FROM public.subject_teachers st
      WHERE st.school_id = v_alloc.school_id
        AND st.class_id = v_alloc.class_id
        AND st.stream_id IS NULL
        AND st.subject_id = v_alloc.subject_id
        AND st.teacher_id = v_alloc.teacher_id
        AND daterange(st.effective_from, COALESCE(st.effective_to, 'infinity'::date), '[]')
          && daterange(v_alloc.effective_from, COALESCE(v_alloc.effective_to, 'infinity'::date), '[]');

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
-- 8. Lock down execution: no prior migration in scope granted EXECUTE, so
-- revoke the PUBLIC default and grant to authenticated on every function
-- created or redefined here (plus approve_timetable_atomic, redefined in
-- 20260916000000 without grants).
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_staff_in_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff_in_school(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_leadership_in_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_leadership_in_school(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_online_booking_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_online_booking_atomic(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_online_offer_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_online_offer_atomic(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.record_online_session_payroll_claim(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_online_session_payroll_claim(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.publish_timetable_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_timetable_atomic(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_teaching_allocations_atomic(UUID[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_teaching_allocations_atomic(UUID[], UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_timetable_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_timetable_atomic(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.check_teaching_allocation_tenant_integrity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_teaching_allocation_tenant_integrity() TO authenticated;
