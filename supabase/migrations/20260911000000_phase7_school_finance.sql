-- ============================================================================
-- SomaCampus Phase 7: School Finance, Fee Ledgers, Activities & Operating Expenses
-- Migration: 20260911000000_phase7_school_finance.sql
-- ============================================================================

-- 1. CRITICAL SECURITY REMEDIATION: DROP LEAKY PUBLIC FEE POLICY
DROP POLICY IF EXISTS fee_accounts_auth_read ON public.student_fee_accounts;
DROP POLICY IF EXISTS fee_payments_auth_read ON public.fee_payments;

-- 2. FEE CATEGORIES
CREATE TABLE IF NOT EXISTS public.fee_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code TEXT NOT NULL, -- e.g. 'TUITION', 'DEVELOPMENT', 'LUNCH', 'TRANSPORT', 'ACTIVITY'
  name TEXT NOT NULL,
  description TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, code)
);

-- 3. FEE STRUCTURES (Class/Term Fee Schedules)
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE, -- NULL means all classes in school
  fee_category_id UUID NOT NULL REFERENCES public.fee_categories(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, academic_year_id, term_id, class_id, fee_category_id)
);

-- 4. STUDENT CHARGES (Debit Obligations)
CREATE TABLE IF NOT EXISTS public.student_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE RESTRICT,
  fee_category_id UUID NOT NULL REFERENCES public.fee_categories(id) ON DELETE RESTRICT,
  fee_structure_id UUID REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  due_date DATE NOT NULL,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_charges_student_term_idx 
  ON public.student_charges(student_id, term_id);

-- 5. UPGRADE FEE PAYMENTS (Credit Transactions)
ALTER TABLE public.fee_payments 
  ADD COLUMN IF NOT EXISTS payer_name TEXT,
  ADD COLUMN IF NOT EXISTS payer_phone TEXT,
  ADD COLUMN IF NOT EXISTS unallocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_number TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'unallocated', 'partially_allocated', 'fully_allocated', 'reversed')),
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_receipt_number_idx 
  ON public.fee_payments(school_id, receipt_number) WHERE receipt_number IS NOT NULL;

-- 6. PAYMENT ALLOCATIONS (Credit Application to Debits)
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.fee_payments(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES public.student_charges(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  allocated_by UUID REFERENCES public.people(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS payment_allocations_charge_idx 
  ON public.payment_allocations(charge_id);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx 
  ON public.payment_allocations(payment_id);

-- 7. FEE ADJUSTMENTS (Waivers, Scholarships, Corrections)
CREATE TABLE IF NOT EXISTS public.fee_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES public.student_charges(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('waiver', 'scholarship', 'discount', 'correction', 'bad_debt_writeoff')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) >= 5),
  authorized_by UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. DERIVED FEE ACCOUNT REFRESH TRIGGER
-- Invariant: student_fee_accounts is a derived operational summary, not the mutable source of truth.
CREATE OR REPLACE FUNCTION public.refresh_student_fee_account(p_student_id UUID, p_term_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_academic_year_id UUID;
  v_total_assessed NUMERIC(14,2) := 0;
  v_total_paid NUMERIC(14,2) := 0;
  v_total_adjusted NUMERIC(14,2) := 0;
  v_balance NUMERIC(14,2) := 0;
  v_clearance TEXT := 'overdue';
BEGIN
  SELECT s.school_id, t.academic_year_id 
  INTO v_school_id, v_academic_year_id
  FROM public.students s
  CROSS JOIN public.terms t
  WHERE s.id = p_student_id AND t.id = p_term_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Sum of all charges for this student in this term
  SELECT COALESCE(SUM(amount), 0) INTO v_total_assessed
  FROM public.student_charges
  WHERE student_id = p_student_id AND term_id = p_term_id;

  -- Sum of all allocations for charges in this term
  SELECT COALESCE(SUM(pa.amount), 0) INTO v_total_paid
  FROM public.payment_allocations pa
  JOIN public.student_charges sc ON sc.id = pa.charge_id
  WHERE sc.student_id = p_student_id AND sc.term_id = p_term_id;

  -- Sum of all adjustments for charges in this term
  SELECT COALESCE(SUM(fa.amount), 0) INTO v_total_adjusted
  FROM public.fee_adjustments fa
  JOIN public.student_charges sc ON sc.id = fa.charge_id
  WHERE sc.student_id = p_student_id AND sc.term_id = p_term_id;

  v_balance := GREATEST(0, v_total_assessed - v_total_paid - v_total_adjusted);

  IF v_balance = 0 AND v_total_assessed > 0 THEN
    v_clearance := 'cleared';
  ELSIF v_total_paid > 0 OR v_total_adjusted > 0 THEN
    v_clearance := 'partial';
  ELSE
    v_clearance := 'overdue';
  END IF;

  INSERT INTO public.student_fee_accounts (
    school_id, student_id, academic_year_id, term_id,
    assessed_amount, paid_amount, balance, clearance_status, updated_at
  )
  VALUES (
    v_school_id, p_student_id, v_academic_year_id, p_term_id,
    v_total_assessed, (v_total_paid + v_total_adjusted), v_balance, v_clearance, now()
  )
  ON CONFLICT (student_id, term_id) DO UPDATE SET
    assessed_amount = EXCLUDED.assessed_amount,
    paid_amount = EXCLUDED.paid_amount,
    balance = EXCLUDED.balance,
    clearance_status = EXCLUDED.clearance_status,
    updated_at = now();
END;
$$;

-- 9. SCHOOL ACTIVITIES & CLUBS
CREATE TABLE IF NOT EXISTS public.school_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sports', 'arts', 'academic_club', 'excursion', 'special_service')),
  is_paid BOOLEAN NOT NULL DEFAULT true,
  fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  lead_teacher_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.school_activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES public.student_charges(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'withdrawn', 'suspended')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(activity_id, student_id)
);

-- 10. DECOUPLED OPERATIONAL CLEARANCE (Zero Financial Data for Teachers)
CREATE TABLE IF NOT EXISTS public.activity_clearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.school_activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('cleared', 'not_cleared', 'pending_review')),
  basis TEXT NOT NULL DEFAULT 'promise_to_pay' CHECK (basis IN ('paid', 'waived', 'sponsored', 'promise_to_pay', 'included', 'administrative_approval')),
  cleared_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until DATE,
  operational_note TEXT,
  UNIQUE(activity_id, student_id)
);

-- 11. SCHOOL OPERATING EXPENSES (Money Out)
CREATE TABLE IF NOT EXISTS public.school_expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL, -- 'FOOD_LUNCH', 'ELECTRICITY', 'WATER', 'MAINTENANCE', etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, code)
);

CREATE TABLE IF NOT EXISTS public.school_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.school_expense_categories(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  spent_on DATE NOT NULL,
  payment_channel TEXT NOT NULL DEFAULT 'cash' CHECK (payment_channel IN ('bank_transfer', 'cash', 'mobile_money', 'cheque')),
  recipient_payee TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_number TEXT,
  receipt_attachment_url TEXT,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  term_id UUID REFERENCES public.terms(id) ON DELETE SET NULL,
  recorded_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'approved', 'reconciled', 'voided')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_expenses_spent_on_idx 
  ON public.school_expenses(school_id, spent_on DESC);

-- 12. IMMUTABLE FINANCIAL AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'charge', 'payment', 'allocation', 'adjustment', 'expense', 'clearance'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'create', 'allocate', 'reconcile', 'reverse', 'adjust', 'clear', 'void'
  previous_data JSONB,
  new_data JSONB,
  performed_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION public.prevent_financial_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'financial_audit_logs is an immutable write-only ledger and cannot be altered or deleted'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_financial_audit_logs ON public.financial_audit_logs;
CREATE TRIGGER trg_guard_financial_audit_logs
  BEFORE UPDATE OR DELETE ON public.financial_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_audit_mutation();

-- 13. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user has school leadership/finance role
CREATE OR REPLACE FUNCTION public.has_school_finance_access(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = p_school_id
      AND r.id IN ('admin', 'principal', 'bursar')
  );
$$;

-- Financial Management Policies (Strictly Admin, Principal, Bursar)
CREATE POLICY fee_categories_finance ON public.fee_categories
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY fee_structures_finance ON public.fee_structures
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY student_charges_finance ON public.student_charges
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY fee_payments_finance ON public.fee_payments
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY payment_allocations_finance ON public.payment_allocations
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY fee_adjustments_finance ON public.fee_adjustments
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY student_fee_accounts_finance ON public.student_fee_accounts
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY school_expenses_finance ON public.school_expenses
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY school_expense_categories_finance ON public.school_expense_categories
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY financial_audit_logs_finance ON public.financial_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_school_finance_access(school_id));

-- Activity Policies: Activities readable by all staff, but clearance ledger firewall-protected
CREATE POLICY school_activities_read_all ON public.school_activities
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.school_id = school_activities.school_id
    )
  );

CREATE POLICY school_activities_write_finance ON public.school_activities
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY activity_enrolments_read_all ON public.activity_enrolments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.school_id = activity_enrolments.school_id
    )
  );

-- Teachers read operational clearance (which has zero fee figures)
CREATE POLICY activity_clearances_read ON public.activity_clearances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.school_id = activity_clearances.school_id
    )
  );

CREATE POLICY activity_clearances_write_finance ON public.activity_clearances
  FOR ALL TO authenticated
  USING (public.has_school_finance_access(school_id));
