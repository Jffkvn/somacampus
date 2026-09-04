/**
 * SomaCampus Phase 7 Hardening D3: Finalized Payroll Coherence Guard Semantics
 *
 * Verifies the DB guard migration
 * (supabase/migrations/20260912000004_finalized_payroll_coherence.sql):
 *  - finalized items satisfy gross_earnings − deductions_recovered = net_pay
 *    AND deductions_recovered + outstanding = deductions_total
 *  - ONLY enforced when the parent run status is finalized;
 *    draft / calculated / under_review / approved remain editable
 *  - outstanding_deductions column is added idempotently
 *  - existing immutability triggers (guard_finalised_payroll_items,
 *    guard_payroll_run_status) keep working — never dropped or replaced
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildPayrollItem,
  reconciles,
  type PayrollItemRecord,
} from '../modules/payroll/payrollItem';

const MIGRATION = '20260912000004_finalized_payroll_coherence.sql';

function migrationSql(): string {
  const p = path.resolve(process.cwd(), 'supabase/migrations', MIGRATION);
  return fs.readFileSync(p, 'utf8');
}

/** TS mirror of the SQL trigger WHEN logic: non-finalized rows pass through. */
function finalizedGuardAllows(runStatus: string, item: PayrollItemRecord): boolean {
  if (runStatus !== 'finalized') return true; // drafts editable — DB must not constrain
  return reconciles(item);
}

describe('Finalized Payroll Coherence Guard (D3)', () => {
  describe('migration shape', () => {
    it('migration file exists and targets school_payroll_items', () => {
      const sql = migrationSql();
      expect(sql).toContain('school_payroll_items');
      expect(sql).toContain(MIGRATION);
    });

    it('adds outstanding_deductions idempotently with non-negative guard', () => {
      const sql = migrationSql();
      expect(sql).toContain('outstanding_deductions');
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/i);
      expect(sql).toMatch(/outstanding_deductions\s*>=\s*0|CHECK\s*\([^)]*outstanding_deductions[^)]*>=/i);
    });

    it('enforces both coherence equalities (net and recovered+outstanding)', () => {
      const sql = migrationSql().toLowerCase();
      expect(sql).toContain('net_pay');
      // gross earnings expression minus recovered must equal net_pay
      expect(sql).toMatch(/gross_salary\s*\+\s*overtime_amount\s*\+\s*allowances/);
      // recovered + outstanding must equal the deductions total expression
      expect(sql).toMatch(/paye.*nssf_employee.*wht_amount|deductions_total|v_total/);
    });

    it('is enforced ONLY when the parent run is finalized', () => {
      const sql = migrationSql().toLowerCase();
      expect(sql).toMatch(/finalized/);
      // Gate on the run status — drafts must pass through unconstrained.
      expect(sql).toMatch(/status\s*=\s*'finalized'|new\.status|v_status/);
    });

    it('never drops or replaces the existing immutability triggers', () => {
      const sql = migrationSql();
      expect(sql).not.toMatch(/DROP\s+(TRIGGER|FUNCTION).*guard_finalised_payroll_items/i);
      expect(sql).not.toMatch(/DROP\s+(TRIGGER|FUNCTION).*guard_payroll_run_status/i);
      expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+.*guard_finalised_payroll_items/i);
      expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+.*guard_payroll_run_status/i);
    });
  });

  describe('status-gating semantics', () => {
    const coherent = buildPayrollItem({ grossSalary: 1_000_000 });
    const incoherent = { ...coherent, net_pay: coherent.net_pay + 500 };

    it.each(['draft', 'calculated', 'under_review', 'approved'])(
      'status %s: any figures pass through (editable)',
      (status) => {
        expect(finalizedGuardAllows(status, coherent)).toBe(true);
        expect(finalizedGuardAllows(status, incoherent)).toBe(true);
      },
    );

    it('status finalized: coherent item passes', () => {
      expect(reconciles(coherent)).toBe(true);
      expect(finalizedGuardAllows('finalized', coherent)).toBe(true);
    });

    it('status finalized: clamped-but-untracked item fails (contradiction caught)', () => {
      expect(finalizedGuardAllows('finalized', incoherent)).toBe(false);
    });

    it('status finalized: over-deducted item with explicit outstanding passes', () => {
      const item = buildPayrollItem({ grossSalary: 400_000, advanceDeduction: 500_000 });
      expect(item.net_pay).toBe(0);
      expect(item.outstanding_deductions).toBe(126_500);
      expect(finalizedGuardAllows('finalized', item)).toBe(true);
    });
  });
});
