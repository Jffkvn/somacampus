-- ============================================================================
-- SomaCampus Commissioning: Seed Staff Payroll Profiles & September 2026 Period
-- Migration: 20260922000021_seed_staff_payroll_profiles.sql
-- ============================================================================
-- 1. Ensure September 2026 payroll period exists for Pilot School
INSERT INTO public.payroll_periods (
  school_id,
  period_start,
  period_end,
  period_month,
  label,
  is_closed
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '2026-09-01'::date,
  '2026-09-30'::date,
  '2026-09',
  'September 2026 (2026-09)',
  false
)
ON CONFLICT (school_id, period_month) DO UPDATE
SET is_closed = false;

-- 2. Backfill open-ended payroll compensation profiles for all active employees
-- of the Pilot School who lack a payroll profile (e.g. legacy seed teachers TCH-001..TCH-005)
INSERT INTO public.employee_payroll_profiles (
  school_id,
  employee_id,
  effective_from,
  effective_to,
  pay_basis,
  tax_treatment,
  base_salary,
  currency,
  nssf_applicable,
  payment_method,
  bank_name,
  bank_account_number,
  bank_account_name
)
SELECT
  e.school_id,
  e.id,
  '2026-01-01'::date,
  NULL,
  'salaried',
  'local',
  CASE
    WHEN e.employee_number = 'TCH-001' THEN 1500000.00
    WHEN e.employee_number = 'TCH-002' THEN 1400000.00
    WHEN e.employee_number = 'TCH-003' THEN 1350000.00
    WHEN e.employee_number = 'TCH-004' THEN 1300000.00
    ELSE 1200000.00
  END,
  'UGX',
  true,
  'bank_transfer',
  'Stanbic Bank Uganda',
  '90300' || lpad(abs(hashtext(e.id::text))::text, 8, '0'),
  COALESCE(p.first_name || ' ' || p.last_name, 'Faculty Member')
FROM public.employees e
LEFT JOIN public.people p ON p.id = e.person_id
WHERE e.school_id = '22222222-2222-2222-2222-222222222222'
  AND e.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.employee_payroll_profiles ep
    WHERE ep.employee_id = e.id
  );

-- 3. Ensure employee self-read policy on employee_payroll_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'employee_payroll_profiles' 
      AND policyname = 'employee_payroll_profiles_self_read'
  ) THEN
    CREATE POLICY employee_payroll_profiles_self_read ON public.employee_payroll_profiles
      FOR SELECT TO authenticated
      USING (
        employee_id = public.current_employee_id()
        OR public.has_school_finance_access(school_id)
      );
  END IF;
END $$;
