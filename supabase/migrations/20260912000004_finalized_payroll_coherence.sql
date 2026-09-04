-- ============================================================================
-- SomaCampus Hardening D3: Finalized payroll item coherence guard
-- Migration: 20260912000004_finalized_payroll_coherence.sql
-- ============================================================================
-- Critical Fixes #2+#3 — net pay is clamped to 0 when deductions exceed
-- earnings, so gross-deductions=net no longer holds on its own. The model now
-- splits every item into RECOVERED (min(total deductions, gross)) and
-- OUTSTANDING (total − recovered, an explicit liability that is never
-- silently dropped and never over-deducted):
--   gross_earnings − deductions_recovered = net_pay
--   deductions_recovered + outstanding_deductions = deductions_total
-- where gross_earnings  = gross_salary + overtime_amount + allowances
--   and deductions_total = paye + nssf_employee + wht_amount
--                        + other_deductions + advance_deduction
--                        + unpaid_leave_deduction
--   and deductions_recovered = deductions_total − outstanding_deductions.
--
-- Enforcement is gated on the parent run status: ONLY finalized runs are
-- constrained (draft / calculated / under_review / approved stay editable).
-- Two triggers:
--   1. trg_guard_finalized_payroll_coherence on school_payroll_items
--      (BEFORE INSERT OR UPDATE) — rejects incoherent writes whose parent
--      run is finalized.
--   2. trg_guard_finalized_run_coherence on school_payroll_runs
--      (BEFORE UPDATE OF status) — rejects finalizing a run that contains
--      any incoherent item.
-- Existing immutability triggers (trg_guard_finalised_payroll_items,
-- trg_guard_payroll_run_status) are NOT touched: they keep firing in their
-- original creation order and their conditions are unchanged.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS before CREATE TRIGGER, guarded ADD CONSTRAINT.

-- 1. Outstanding liability column (nullable with default 0; COALESCE 0 in guards)
ALTER TABLE public.school_payroll_items
  ADD COLUMN IF NOT EXISTS outstanding_deductions NUMERIC(14,2) DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_payroll_items_outstanding_nonneg'
  ) THEN
    ALTER TABLE public.school_payroll_items
      ADD CONSTRAINT school_payroll_items_outstanding_nonneg
      CHECK (outstanding_deductions IS NULL OR outstanding_deductions >= 0);
  END IF;
END
$$;

-- 2. Item-level coherence guard (finalized runs only)
CREATE OR REPLACE FUNCTION public.guard_finalized_payroll_coherence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status    TEXT;
  v_run       UUID := COALESCE(NEW.payroll_run_id, OLD.payroll_run_id);
  v_gross     NUMERIC(14,2);
  v_total     NUMERIC(14,2);
  v_out       NUMERIC(14,2);
  v_recovered NUMERIC(14,2);
BEGIN
  SELECT status INTO v_status FROM public.school_payroll_runs WHERE id = v_run;

  -- Drafts stay editable: only finalized runs are constrained.
  IF v_status IS DISTINCT FROM 'finalized' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_gross := COALESCE(NEW.gross_salary, 0)
           + COALESCE(NEW.overtime_amount, 0)
           + COALESCE(NEW.allowances, 0);
  v_total := COALESCE(NEW.paye, 0)
           + COALESCE(NEW.nssf_employee, 0)
           + COALESCE(NEW.wht_amount, 0)
           + COALESCE(NEW.other_deductions, 0)
           + COALESCE(NEW.advance_deduction, 0)
           + COALESCE(NEW.unpaid_leave_deduction, 0);
  v_out := COALESCE(NEW.outstanding_deductions, 0);
  v_recovered := v_total - v_out;

  IF v_out < 0 OR v_out > v_total THEN
    RAISE EXCEPTION
      'Finalized payroll item % is incoherent: outstanding_deductions (%) must be between 0 and total deductions (%).',
      NEW.id, v_out, v_total
      USING ERRCODE = '23514';
  END IF;

  IF NEW.net_pay IS DISTINCT FROM (v_gross - v_recovered) THEN
    RAISE EXCEPTION
      'Finalized payroll item % is incoherent: gross earnings (%) minus deductions recovered (%) must equal net pay (%).',
      NEW.id, v_gross, v_recovered, NEW.net_pay
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_guard_finalized_payroll_coherence ON public.school_payroll_items;
CREATE TRIGGER trg_guard_finalized_payroll_coherence
  BEFORE INSERT OR UPDATE ON public.school_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_payroll_coherence();

-- 3. Finalize gate: a run with any incoherent item cannot become finalized
CREATE OR REPLACE FUNCTION public.guard_finalized_run_coherence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finalized' AND OLD.status IS DISTINCT FROM 'finalized' THEN
    IF EXISTS (
      SELECT 1
      FROM public.school_payroll_items i
      WHERE i.payroll_run_id = NEW.id
        AND (
          COALESCE(i.outstanding_deductions, 0) < 0
          OR COALESCE(i.outstanding_deductions, 0) > (
               COALESCE(i.paye, 0)
             + COALESCE(i.nssf_employee, 0)
             + COALESCE(i.wht_amount, 0)
             + COALESCE(i.other_deductions, 0)
             + COALESCE(i.advance_deduction, 0)
             + COALESCE(i.unpaid_leave_deduction, 0)
             )
          OR i.net_pay IS DISTINCT FROM (
               (COALESCE(i.gross_salary, 0) + COALESCE(i.overtime_amount, 0) + COALESCE(i.allowances, 0))
             - (
               (COALESCE(i.paye, 0) + COALESCE(i.nssf_employee, 0) + COALESCE(i.wht_amount, 0)
              + COALESCE(i.other_deductions, 0) + COALESCE(i.advance_deduction, 0)
              + COALESCE(i.unpaid_leave_deduction, 0))
             - COALESCE(i.outstanding_deductions, 0)
               )
             )
        )
    ) THEN
      RAISE EXCEPTION
        'Payroll run % cannot be finalized: it contains incoherent items (gross − recovered must equal net pay, recovered + outstanding must equal total deductions).',
        NEW.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_guard_finalized_run_coherence ON public.school_payroll_runs;
CREATE TRIGGER trg_guard_finalized_run_coherence
  BEFORE UPDATE OF status ON public.school_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_run_coherence();
