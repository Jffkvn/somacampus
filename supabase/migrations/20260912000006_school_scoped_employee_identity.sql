-- D6+D7 hardening: school-scoped employee identity.
--
-- Problem: public.current_employee_id() resolved the employee row via
-- people.auth_user_id with a bare LIMIT 1 and NO school scope. A person
-- employed at two schools has two employee rows; the LIMIT 1 pick was
-- ambiguous and a school-A employment could satisfy a school-B self-service
-- RLS check (payslips, leave, advances).
--
-- Fix: school context is REQUIRED. New function
-- public.current_employee_id_for_school(p_school_id) qualifies by
-- employees.school_id, and all self-service payroll/HR policies are rewritten
-- to use it. Finance scope only — academic/parent/student policies untouched.
--
-- Design chosen: explicit school_id PARAMETER (not JWT claim) because every
-- self-service row already carries school_id, so the policy can bind the
-- employment lookup to the row being accessed. The legacy no-arg function is
-- retained as a deterministic deprecated shim (ORDER BY, no policy depends on
-- it anymore) so existing clients don't break.

-- 1. School-scoped resolver (the new authorization primitive).
CREATE OR REPLACE FUNCTION public.current_employee_id_for_school(p_school_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  JOIN public.people p ON p.id = e.person_id
  WHERE p.auth_user_id = auth.uid()
    AND e.school_id = p_school_id
  ORDER BY e.id
  LIMIT 1;
$$;

-- 2. Legacy shim: deterministic + deprecated. No RLS policy may rely on this.
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  JOIN public.people p ON p.id = e.person_id
  WHERE p.auth_user_id = auth.uid()
  ORDER BY e.school_id, e.id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_employee_id() IS
  'DEPRECATED (D7): ambiguous across schools — LIMIT 1 without school scope. Use current_employee_id_for_school(UUID). No RLS policy depends on this function.';

-- 3. Rewrite self-service policies to bind employment to the row's school.

DROP POLICY IF EXISTS school_payroll_items_self_read ON public.school_payroll_items;
CREATE POLICY school_payroll_items_self_read ON public.school_payroll_items
  FOR SELECT TO authenticated
  USING (
    employee_id = public.current_employee_id_for_school(school_id)
    AND EXISTS (
      SELECT 1 FROM public.school_payroll_runs spr
      WHERE spr.id = school_payroll_items.payroll_run_id
        AND spr.status IN ('approved', 'finalized')
    )
  );

DROP POLICY IF EXISTS leave_entitlements_self_read ON public.leave_entitlements;
CREATE POLICY leave_entitlements_self_read ON public.leave_entitlements
  FOR SELECT TO authenticated
  USING (
    employee_id = public.current_employee_id_for_school(school_id)
    OR public.has_school_finance_access(school_id)
  );

DROP POLICY IF EXISTS leave_requests_self_and_finance ON public.leave_requests;
CREATE POLICY leave_requests_self_and_finance ON public.leave_requests
  FOR ALL TO authenticated
  USING (
    employee_id = public.current_employee_id_for_school(school_id)
    OR public.has_school_finance_access(school_id)
  );

DROP POLICY IF EXISTS staff_advances_self_and_finance ON public.staff_advances;
CREATE POLICY staff_advances_self_and_finance ON public.staff_advances
  FOR ALL TO authenticated
  USING (
    employee_id = public.current_employee_id_for_school(school_id)
    OR public.has_school_finance_access(school_id)
  );
