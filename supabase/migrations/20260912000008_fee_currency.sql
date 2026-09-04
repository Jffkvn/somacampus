-- ============================================================================
-- SomaCampus Hardening Part C: Fee currency convergence
-- Migration: 20260912000008_fee_currency.sql
-- ============================================================================
-- Phase 7 shape wants currency TEXT DEFAULT 'UGX' on fee tables (fee_structures
-- line 31, student_charges line 47, school_expenses line 226 of
-- 20260911000000; employee_payroll_profiles in 20260911000001). The new tables
-- get it via CREATE TABLE IF NOT EXISTS, but the two PRE-EXISTING core tables
-- never did: fee_payments gained columns via ALTER in Phase 7 WITHOUT currency,
-- and the fee_structures Phase 7 CREATE was a live no-op (table already existed)
-- with remediation 20260912000002 adding only fee_category_id. The app reads
-- currency with a 'UGX' fallback, so converge WITHOUT data rewrite:
-- nullable TEXT DEFAULT 'UGX' (existing rows backfill to the default).
-- Idempotent: ADD COLUMN IF NOT EXISTS. No NOT NULL yet (no validation pass).
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'UGX';
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'UGX';
