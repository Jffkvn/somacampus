-- ==============================================================================
-- SOMACAMPUS MIGRATION: GUARDIAN READ ACCESS
-- Migration ID: 20260913000001
-- ==============================================================================
-- getChildOverview queries student_charges / fee_payments / payment_allocations
-- (+ student_fee_accounts via financeService) and activity_enrolments /
-- activity_clearances / school_activities, but guardians have NO read policies
-- on these tables (only finance-role FOR ALL policies and staff-only
-- user_roles-school SELECT reads), so the live parent home throws. This opens
-- scoped SELECT only via public.current_guardian_student_ids_for_school
-- (migration 20260913000000): guardians see rows for their own actively
-- enrolled children, nothing else. No writes granted (never USING(true)).
-- Idempotent: DROP POLICY IF EXISTS before each CREATE.

-- ------------------------------------------------------------------------------
-- student_charges: guardian read for own children's charges (direct student_id)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS student_charges_guardian_read ON public.student_charges;
CREATE POLICY student_charges_guardian_read ON public.student_charges
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT public.current_guardian_student_ids_for_school(student_charges.school_id)
    )
  );

-- ------------------------------------------------------------------------------
-- fee_payments: guardian read for own children's payments (direct student_id)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS fee_payments_guardian_read ON public.fee_payments;
CREATE POLICY fee_payments_guardian_read ON public.fee_payments
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT public.current_guardian_student_ids_for_school(fee_payments.school_id)
    )
  );

-- ------------------------------------------------------------------------------
-- payment_allocations: guardian read via the linked charge's student
-- (allocations carry payment_id/charge_id only, no student_id column)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS payment_allocations_guardian_read ON public.payment_allocations;
CREATE POLICY payment_allocations_guardian_read ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_charges sc
      WHERE sc.id = payment_allocations.charge_id
        AND sc.student_id IN (
          SELECT public.current_guardian_student_ids_for_school(payment_allocations.school_id)
        )
    )
  );

-- ------------------------------------------------------------------------------
-- student_fee_accounts: guardian read for own children's accounts (direct)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS student_fee_accounts_guardian_read ON public.student_fee_accounts;
CREATE POLICY student_fee_accounts_guardian_read ON public.student_fee_accounts
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT public.current_guardian_student_ids_for_school(student_fee_accounts.school_id)
    )
  );

-- ------------------------------------------------------------------------------
-- activity_enrolments: guardian read for own children's enrolments (direct)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS activity_enrolments_guardian_read ON public.activity_enrolments;
CREATE POLICY activity_enrolments_guardian_read ON public.activity_enrolments
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT public.current_guardian_student_ids_for_school(activity_enrolments.school_id)
    )
  );

-- ------------------------------------------------------------------------------
-- activity_clearances: guardian read for own children's clearances (direct)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS activity_clearances_guardian_read ON public.activity_clearances;
CREATE POLICY activity_clearances_guardian_read ON public.activity_clearances
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT public.current_guardian_student_ids_for_school(activity_clearances.school_id)
    )
  );

-- ------------------------------------------------------------------------------
-- school_activities: guardian read for activities a child is enrolled in
-- (activities carry no student_id, so scope via the enrolment join)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS school_activities_guardian_read ON public.school_activities;
CREATE POLICY school_activities_guardian_read ON public.school_activities
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.activity_enrolments ae
      WHERE ae.activity_id = school_activities.id
        AND ae.student_id IN (
          SELECT public.current_guardian_student_ids_for_school(school_activities.school_id)
        )
    )
  );
