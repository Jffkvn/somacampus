-- ==============================================================================
-- SOMACAMPUS MIGRATION: FINANCIAL AUDIT INSERT ACCESS
-- ==============================================================================
-- financial_audit_logs is written DIRECTLY by app code (writeFinancialAudit),
-- unlike trigger-fed audit tables. It had SELECT-only access, so every
-- authenticated INSERT was denied (42501) and silently swallowed by the
-- best-effort helper. Finance staff can append; nothing can update/delete
-- (immutable trigger trg_guard_financial_audit_logs already enforced).
DROP POLICY IF EXISTS financial_audit_logs_insert ON public.financial_audit_logs;
CREATE POLICY financial_audit_logs_insert ON public.financial_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_school_finance_access(school_id));
