-- ==============================================================================
-- SOMACAMPUS MIGRATION: ACTIVITY (CLUB) ENROLMENT BILLING (Phase C)
-- Migration ID: 20260922000014
-- ==============================================================================
-- Paid clubs bill through the same fees platform as everything else:
--   * The price lives ON the activity (school_activities.is_paid + fee_amount).
--   * Enrolling a pupil copies that price into student_charges (description =
--     the club's name, category = the school's ACTIVITY category) and links
--     activity_enrolments.charge_id, so parents see "Chess Club — UGX 50,000 —
--     Due" on their portal and payments allocate against it like any fee.
--   * Idempotent: enrolments are unique per (activity, student). A NEW
--     enrolment (or a re-join of a withdrawn pupil with no charge yet) bills
--     once; already-billed pupils are never re-billed.
--   * Free clubs (is_paid = false or fee_amount = 0) never create charges.
--   * Each pupil may join any number of clubs: bill lines are per club.
--   * Every newly enrolled pupil gets a pending_review operational clearance
--     ("added now, pays later") per the decoupled clearance design.
--   * Refreshes student_fee_accounts rollups for touched students.
--
-- Idempotent: CREATE OR REPLACE, guarded seeds. No DELETEs.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DEFAULT 'ACTIVITY' FEE CATEGORY for every school (club bill lines)
-- ------------------------------------------------------------------------------
INSERT INTO public.fee_categories (school_id, code, name, description, is_mandatory)
SELECT s.id, 'ACTIVITY', 'Clubs & Activities', 'Club and activity participation fees', false
FROM public.schools s
WHERE NOT EXISTS (
  SELECT 1 FROM public.fee_categories fc
  WHERE fc.school_id = s.id AND fc.code = 'ACTIVITY'
);

-- ------------------------------------------------------------------------------
-- 2. RPC: enroll_students_in_activity (finance roles)
--    Bulk-enrol pupils into one activity; bills paid clubs automatically.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enroll_students_in_activity(
  p_school_id UUID,
  p_activity_id UUID,
  p_student_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity RECORD;
  v_category_id UUID;
  v_student_id UUID;
  v_enrolment_id UUID;
  v_existing_charge UUID;
  v_actor UUID;
  v_enrolled INT := 0;
  v_billed INT := 0;
  v_active_count INT;
  v_batch INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'enroll_students_in_activity: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_school_finance_access(p_school_id) THEN
    RAISE EXCEPTION 'enroll_students_in_activity: caller has no finance access for school %',
      p_school_id USING ERRCODE = '42501';
  END IF;
  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'enroll_students_in_activity: no students supplied'
      USING ERRCODE = '22023';
  END IF;
  IF array_length(p_student_ids, 1) > 200 THEN
    RAISE EXCEPTION 'enroll_students_in_activity: enrol batches are limited to 200 students'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_activity
  FROM public.school_activities a
  WHERE a.id = p_activity_id AND a.school_id = p_school_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enroll_students_in_activity: activity % not found for school %',
      p_activity_id, p_school_id USING ERRCODE = 'P0002';
  END IF;
  IF v_activity.status <> 'active' THEN
    RAISE EXCEPTION 'enroll_students_in_activity: activity % is not active', p_activity_id
      USING ERRCODE = '22023';
  END IF;

  SELECT p.id INTO v_actor FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1;

  -- Club bill lines use the school's ACTIVITY category (get-or-create).
  SELECT fc.id INTO v_category_id
  FROM public.fee_categories fc
  WHERE fc.school_id = p_school_id AND fc.code = 'ACTIVITY';
  IF v_category_id IS NULL THEN
    INSERT INTO public.fee_categories (school_id, code, name, description, is_mandatory)
    VALUES (p_school_id, 'ACTIVITY', 'Clubs & Activities', 'Club and activity participation fees', false)
    RETURNING id INTO v_category_id;
  END IF;

  -- Capacity guard: count active enrolments excluding the incoming batch.
  SELECT count(*) INTO v_active_count
  FROM public.activity_enrolments ae
  WHERE ae.activity_id = p_activity_id AND ae.status = 'enrolled'
    AND NOT (ae.student_id = ANY(p_student_ids));
  IF v_activity.capacity IS NOT NULL
     AND v_active_count + array_length(p_student_ids, 1) > v_activity.capacity THEN
    RAISE EXCEPTION 'enroll_students_in_activity: capacity % exceeded (% enrolled already)',
      v_activity.capacity, v_active_count USING ERRCODE = '22023';
  END IF;

  FOREACH v_student_id IN ARRAY p_student_ids LOOP
    -- New enrolment inserts; a withdrawn/suspended pupil re-joins.
    INSERT INTO public.activity_enrolments (school_id, activity_id, student_id, status)
    VALUES (p_school_id, p_activity_id, v_student_id, 'enrolled')
    ON CONFLICT (activity_id, student_id)
    DO UPDATE SET status = 'enrolled'
    RETURNING id, charge_id INTO v_enrolment_id, v_existing_charge;

    IF v_existing_charge IS NOT NULL THEN
      -- Already billed on a previous enrolment: never double-bill.
      v_enrolled := v_enrolled + 1;
      CONTINUE;
    END IF;

    IF v_activity.is_paid AND v_activity.fee_amount > 0 THEN
      INSERT INTO public.student_charges (
        school_id, student_id, academic_year_id, term_id, fee_category_id,
        fee_structure_id, description, amount, currency, due_date, created_by
      ) VALUES (
        p_school_id, v_student_id, v_activity.academic_year_id, v_activity.term_id,
        v_category_id, NULL, v_activity.name, v_activity.fee_amount, 'UGX',
        COALESCE((SELECT t.end_date FROM public.terms t WHERE t.id = v_activity.term_id), CURRENT_DATE),
        v_actor
      ) RETURNING id INTO v_existing_charge;

      UPDATE public.activity_enrolments
      SET charge_id = v_existing_charge
      WHERE id = v_enrolment_id;

      -- Existing account rollups need re-assessment after a new charge.
      UPDATE public.student_fee_accounts a
      SET assessed_amount = a.assessed_amount + v_activity.fee_amount,
          balance = GREATEST(0, a.assessed_amount + v_activity.fee_amount - a.paid_amount),
          clearance_status = CASE
            WHEN a.assessed_amount + v_activity.fee_amount - a.paid_amount <= 0 THEN 'cleared'
            WHEN a.paid_amount > 0 THEN 'partial'
            ELSE 'overdue'
          END,
          updated_at = now()
      WHERE a.student_id = v_student_id
        AND a.term_id = v_activity.term_id;

      v_billed := v_billed + 1;
    END IF;

    -- Operational clearance: added now, pays later (per decoupled design).
    INSERT INTO public.activity_clearances (
      school_id, activity_id, student_id, status, basis
    )
    VALUES (p_school_id, p_activity_id, v_student_id, 'pending_review', 'promise_to_pay')
    ON CONFLICT (activity_id, student_id) DO NOTHING;

    v_enrolled := v_enrolled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'enrolled', v_enrolled,
    'billed', v_billed,
    'already_billed', v_enrolled - v_billed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enroll_students_in_activity(UUID, UUID, UUID[]) TO authenticated;
