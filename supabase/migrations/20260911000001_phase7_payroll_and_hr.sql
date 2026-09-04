-- ============================================================================
-- SomaCampus Phase 7: Native School Payroll & Staff HR Self-Service
-- Migration: 20260911000001_phase7_payroll_and_hr.sql
-- ============================================================================

-- 1. STATUTORY TAX CONFIGURATION (Uganda 2026 Baseline & Versioning)
CREATE TABLE IF NOT EXISTS public.payroll_tax_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE, -- NULL means national statutory baseline
  name TEXT NOT NULL DEFAULT 'Uganda Statutory Tax Configuration (July 2026 Amendment)',
  effective_from DATE NOT NULL,
  effective_to DATE,
  paye_bands JSONB NOT NULL,
  surcharge_threshold NUMERIC(14,2) NOT NULL DEFAULT 10000000,
  surcharge_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  nssf_employee_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  nssf_employer_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  overtime_multiplier NUMERIC(5,4) NOT NULL DEFAULT 1.5,
  standard_monthly_hours NUMERIC(6,2) NOT NULL DEFAULT 173.33,
  default_wht_rate NUMERIC(5,4) NOT NULL DEFAULT 0.06,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed national Uganda 2026 statutory baseline
INSERT INTO public.payroll_tax_configurations (
  school_id, name, effective_from, paye_bands,
  surcharge_threshold, surcharge_rate, nssf_employee_rate, nssf_employer_rate,
  overtime_multiplier, standard_monthly_hours, default_wht_rate
)
VALUES (
  NULL,
  'Uganda Income Tax (Amendment) Act, 2026 (Effective July 1, 2026)',
  '2026-07-01',
  '[
    {"min": 0, "max": 335000, "rate": 0.00},
    {"min": 335000, "max": 410000, "rate": 0.10},
    {"min": 410000, "max": 485000, "rate": 0.25},
    {"min": 485000, "max": null, "rate": 0.30}
  ]'::jsonb,
  10000000, 0.10, 0.05, 0.10, 1.5, 173.33, 0.06
)
ON CONFLICT DO NOTHING;

-- 2. EMPLOYEE PAYROLL PROFILES (Effective-Dated Financial Configuration)
CREATE TABLE IF NOT EXISTS public.employee_payroll_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  pay_basis TEXT NOT NULL DEFAULT 'salaried' CHECK (pay_basis IN ('salaried', 'hourly')),
  tax_treatment TEXT NOT NULL DEFAULT 'local' CHECK (tax_treatment IN ('local', 'global', 'contractor', 'exempt')),
  base_salary NUMERIC(14,2) NOT NULL CHECK (base_salary >= 0),
  hourly_rate NUMERIC(14,2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  nssf_applicable BOOLEAN NOT NULL DEFAULT true,
  custom_wht_rate NUMERIC(5,2),
  custom_overtime_rate NUMERIC(14,2),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'mobile_money', 'cash', 'cheque')),
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  mobile_money_number TEXT,
  mobile_money_provider TEXT CHECK (mobile_money_provider IS NULL OR mobile_money_provider IN ('mtn', 'airtel')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS employee_payroll_profiles_lookup_idx 
  ON public.employee_payroll_profiles(employee_id, effective_from, effective_to);

-- 3. INDEPENDENT PAYROLL CALENDAR (School Employment Periods)
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_month TEXT NOT NULL, -- 'YYYY-MM'
  label TEXT NOT NULL,        -- e.g. 'September 2026'
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_start = date_trunc('month', period_start)::date),
  CHECK (period_end = (period_start + interval '1 month - 1 day')::date),
  UNIQUE (school_id, period_month)
);

-- 4. NATIVE PAYROLL RUNS (5-State Lifecycle)
CREATE TABLE IF NOT EXISTS public.school_payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE RESTRICT,
  tax_configuration_id UUID REFERENCES public.payroll_tax_configurations(id) ON DELETE RESTRICT,
  run_number INTEGER NOT NULL DEFAULT 1 CHECK (run_number > 0),
  run_type TEXT NOT NULL DEFAULT 'regular' CHECK (run_type IN ('regular', 'supplemental', 'correction')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'under_review', 'approved', 'finalized', 'trashed')),
  calculation_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_gross NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_gross >= 0),
  total_paye NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_paye >= 0),
  total_nssf_employee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_nssf_employee >= 0),
  total_nssf_employer NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_nssf_employer >= 0),
  total_wht NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_wht >= 0),
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  total_net NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_net >= 0),
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_id, run_number)
);

-- 5. NATIVE PAYROLL ITEMS (Individual Employee Computations)
CREATE TABLE IF NOT EXISTS public.school_payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.school_payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  gross_salary NUMERIC(14,2) NOT NULL CHECK (gross_salary >= 0),
  overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  overtime_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (overtime_amount >= 0),
  allowances NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  other_deductions NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  paye NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paye >= 0),
  nssf_employee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (nssf_employee >= 0),
  nssf_employer NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (nssf_employer >= 0),
  wht_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (wht_amount >= 0),
  advance_deduction NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (advance_deduction >= 0),
  unpaid_leave_deduction NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unpaid_leave_deduction >= 0),
  net_pay NUMERIC(14,2) NOT NULL CHECK (net_pay >= 0),
  employee_type TEXT NOT NULL DEFAULT 'local' CHECK (employee_type IN ('local', 'global', 'contractor', 'exempt')),
  pct_month_worked NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (pct_month_worked BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_run_id, employee_id)
);

-- 6. IMMUTABILITY TRIGGER SAFEGUARDS
CREATE OR REPLACE FUNCTION public.guard_finalised_payroll_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_run UUID := COALESCE(NEW.payroll_run_id, OLD.payroll_run_id);
BEGIN
  SELECT status INTO v_status FROM public.school_payroll_runs WHERE id = v_run;

  IF v_status IN ('approved', 'finalized') THEN
    RAISE EXCEPTION
      'Payroll run % is % and cannot be modified. Unfinalized changes must be submitted via correction runs.',
      v_run, v_status
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_guard_finalised_payroll_items ON public.school_payroll_items;
CREATE TRIGGER trg_guard_finalised_payroll_items
  BEFORE UPDATE OR DELETE ON public.school_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_finalised_payroll_items();

CREATE OR REPLACE FUNCTION public.guard_payroll_run_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('approved', 'finalized') AND NEW.status IN ('draft', 'calculated') THEN
    RAISE EXCEPTION
      'An approved or finalized payroll run cannot be returned to draft. Historical records are immutable.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_payroll_run_status ON public.school_payroll_runs;
CREATE TRIGGER trg_guard_payroll_run_status
  BEFORE UPDATE OF status ON public.school_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_run_status();

-- 7. STAFF HR: LEAVE TYPES & WORKING DAYS ENGINE
CREATE TABLE IF NOT EXISTS public.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  is_paid BOOLEAN NOT NULL DEFAULT true,
  default_entitlement_days NUMERIC(5,1) CHECK (default_entitlement_days IS NULL OR default_entitlement_days >= 0),
  requires_evidence BOOLEAN NOT NULL DEFAULT false,
  color TEXT NOT NULL DEFAULT '#1e40af',
  display_order INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, code)
);

CREATE TABLE IF NOT EXISTS public.public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE, -- NULL means national holiday
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Working Days RPC: counts weekdays skipping Saturdays/Sundays and active holidays
CREATE OR REPLACE FUNCTION public.rpc_calculate_leave_working_days(
  p_start_date DATE,
  p_end_date DATE,
  p_school_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result INTEGER;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start and end dates are required' USING ERRCODE = '22023';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date cannot be earlier than start date' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_result
  FROM generate_series(p_start_date, p_end_date, INTERVAL '1 day') day_value
  WHERE EXTRACT(ISODOW FROM day_value) BETWEEN 1 AND 5
    AND NOT EXISTS (
      SELECT 1 FROM public.public_holidays ph
      WHERE ph.holiday_date = day_value::date
        AND ph.is_active
        AND (ph.school_id IS NULL OR ph.school_id = p_school_id)
    );

  RETURN v_result;
END;
$$;

CREATE TABLE IF NOT EXISTS public.leave_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  leave_year INTEGER NOT NULL CHECK (leave_year BETWEEN 2020 AND 2100),
  entitled_days NUMERIC(5,1) NOT NULL CHECK (entitled_days >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, leave_type_id, leave_year)
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  working_days NUMERIC(5,1) NOT NULL CHECK (working_days > 0),
  day_portion TEXT NOT NULL DEFAULT 'full' CHECK (day_portion IN ('full', 'morning', 'afternoon')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) >= 3),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn', 'cancelled')),
  decided_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  -- Half-day shape invariant
  CONSTRAINT leave_requests_half_day_shape CHECK (
    day_portion = 'full' OR (start_date = end_date AND working_days = 0.5)
  )
);

-- 8. STAFF SALARY ADVANCES (Single Open Request Invariant & Amortization)
CREATE TABLE IF NOT EXISTS public.staff_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  balance_remaining NUMERIC(14,2) NOT NULL CHECK (balance_remaining >= 0 AND balance_remaining <= amount),
  monthly_deduction NUMERIC(14,2) NOT NULL CHECK (monthly_deduction > 0),
  num_instalments INTEGER NOT NULL CHECK (num_instalments BETWEEN 1 AND 12),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) >= 3),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paid_off', 'rejected', 'flagged', 'voided')),
  decided_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invariant: Exactly one open/pending/active advance per employee
CREATE UNIQUE INDEX IF NOT EXISTS staff_advances_one_open_per_employee_idx
  ON public.staff_advances(employee_id)
  WHERE status IN ('pending', 'active', 'flagged');

CREATE TABLE IF NOT EXISTS public.advance_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  advance_id UUID NOT NULL REFERENCES public.staff_advances(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  payroll_run_id UUID REFERENCES public.school_payroll_runs(id) ON DELETE RESTRICT,
  payroll_period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL DEFAULT 'payroll' CHECK (source IN ('payroll', 'manual', 'exit')),
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(advance_id, payroll_period_id, source)
);

-- 9. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.payroll_tax_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payroll_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_repayments ENABLE ROW LEVEL SECURITY;

-- Helper function: Employee lookup for currently signed-in auth user
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
  LIMIT 1;
$$;

-- Policies for Leadership/Finance (Admin, Principal, Bursar)
CREATE POLICY payroll_tax_configurations_access ON public.payroll_tax_configurations
  FOR ALL TO authenticated
  USING (school_id IS NULL OR public.has_school_finance_access(school_id));

CREATE POLICY employee_payroll_profiles_finance ON public.employee_payroll_profiles
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY payroll_periods_finance ON public.payroll_periods
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY school_payroll_runs_finance ON public.school_payroll_runs
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY school_payroll_items_finance ON public.school_payroll_items
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY advance_repayments_finance ON public.advance_repayments
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

-- Self-Service Policies for Staff (Viewing Own Payslips, Requesting Leave, Requesting Advances)
CREATE POLICY school_payroll_items_self_read ON public.school_payroll_items
  FOR SELECT TO authenticated
  USING (
    employee_id = public.current_employee_id()
    AND EXISTS (
      SELECT 1 FROM public.school_payroll_runs spr
      WHERE spr.id = school_payroll_items.payroll_run_id
        AND spr.status IN ('approved', 'finalized')
    )
  );

CREATE POLICY leave_types_read ON public.leave_types
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.school_id = leave_types.school_id
    )
  );

CREATE POLICY public_holidays_read ON public.public_holidays
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY leave_entitlements_self_read ON public.leave_entitlements
  FOR SELECT TO authenticated
  USING (
    employee_id = public.current_employee_id()
    OR public.has_school_finance_access(school_id)
  );

CREATE POLICY leave_requests_self_and_finance ON public.leave_requests
  FOR ALL TO authenticated
  USING (
    employee_id = public.current_employee_id()
    OR public.has_school_finance_access(school_id)
  );

CREATE POLICY staff_advances_self_and_finance ON public.staff_advances
  FOR ALL TO authenticated
  USING (
    employee_id = public.current_employee_id()
    OR public.has_school_finance_access(school_id)
  );
