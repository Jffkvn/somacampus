-- ============================================================================
-- SomaCampus Hardening D4: Finalized payroll calculation snapshot
-- Migration: 20260912000005_payroll_item_calculation_snapshot.sql
-- ============================================================================
-- Critical Fix #4 — a finalized payroll must be historically reproducible:
-- September finalized at basic 2,000,000 must still read 2,000,000 after
-- October moves the profile to 2,500,000 and band inputs change.
--
-- Read-path finding: PayslipDocument renders only stored item values and
-- getPayrollRunDetails maps stored school_payroll_items columns directly —
-- nothing recomputes from live employee_payroll_profiles /
-- payroll_tax_configurations at read time. The gap is that NO frozen
-- calculation inputs exist anywhere: the item row has no snapshot/config
-- column, the run's calculation_settings stores only a statutoryVersion
-- label (not the actual bands/rates), and tax_configuration_id is never
-- written. Any verify/recompute path must therefore re-read LIVE config.
--
-- Fix (code-level snapshot payload first): ONE nullable JSONB column
-- carrying the frozen inputs (base salary, allowances, overtime,
-- classification, advances, leave/pct, WHT/custom rates, NSSF rates,
-- statutory version, tax configuration id, effective settings).
--
-- The snapshot is frozen at computation time (draft/calculated) and carried
-- unchanged through finalize — it CANNOT be written "at finalize" via
-- UPDATE because trg_guard_finalised_payroll_items rejects item writes once
-- the parent run is approved/finalized.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. No data mutation, no tax-logic
-- change, existing triggers untouched.
-- ============================================================================

ALTER TABLE public.school_payroll_items
  ADD COLUMN IF NOT EXISTS calculation_snapshot JSONB;

COMMENT ON COLUMN public.school_payroll_items.calculation_snapshot IS
  'D4: frozen calculation inputs captured at computation time (draft/calculated). Finalized reads render this stored snapshot — never live employee_payroll_profiles / payroll_tax_configurations.';
