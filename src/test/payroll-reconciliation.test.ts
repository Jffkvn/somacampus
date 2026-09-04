/**
 * SomaCampus Phase 7 Hardening D2+D3: Payroll Reconciliation Coherence Suite
 *
 * Critical Fixes #2+#3 — net pay was clamped to 0 when deductions exceeded
 * earnings while reconciles() expected gross-deductions=net (contradiction:
 * the clamped liability was silently dropped, never over-deducted, never
 * tracked).
 *
 * Required semantics (HARD RULE: fix the model, never weaken a test):
 *   recovered   = min(totalDeductions, gross)
 *   net         = gross − recovered            (clamp retained: naturally >= 0)
 *   outstanding = totalDeductions − recovered  (explicit liability, >= 0,
 *                                              never silently dropped)
 *   reconciles() asserts BOTH equalities:
 *     gross − recovered == net AND recovered + outstanding == total deductions
 *
 * This file is NEW — src/test/payroll-parity.test.ts is left untouched.
 */

import { describe, it, expect } from 'vitest';
import {
  buildPayrollItem,
  reconciles,
  totalDeductionsOf,
  totalEarningsOf,
} from '../modules/payroll/payrollItem';

function split(item: Parameters<typeof reconciles>[0]) {
  const gross = totalEarningsOf(item);
  const total = totalDeductionsOf(item);
  const recovered = Math.min(total, gross);
  return { gross, total, recovered };
}

describe('Payroll Reconciliation Coherence (D2+D3)', () => {
  it('1. normal: deductions below earnings reconcile with zero outstanding', () => {
    const item = buildPayrollItem({ grossSalary: 1_000_000 });
    const { gross, total, recovered } = split(item);

    expect(item.net_pay).toBe(769_250);
    expect(item.outstanding_deductions).toBe(0);
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + (item.outstanding_deductions as number)).toBe(total);
    expect(reconciles(item)).toBe(true);
  });

  it('2. below: overtime + allowances + other deductions reconcile', () => {
    const item = buildPayrollItem({
      grossSalary: 1_000_000,
      overtimeHours: 10,
      allowances: 150_000,
      otherDeductions: 40_000,
    });
    const { gross, total, recovered } = split(item);

    expect(item.outstanding_deductions).toBe(0);
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + (item.outstanding_deductions as number)).toBe(total);
    expect(item.net_pay).toBeGreaterThan(0);
    expect(reconciles(item)).toBe(true);
  });

  it('3. equal: deductions exactly equal earnings → net 0, outstanding 0', () => {
    const item = buildPayrollItem({
      grossSalary: 500_000,
      employeeType: 'exempt',
      otherDeductions: 500_000,
    });
    const { gross, total, recovered } = split(item);

    expect(total).toBe(gross);
    expect(item.net_pay).toBe(0);
    expect(item.outstanding_deductions).toBe(0);
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + (item.outstanding_deductions as number)).toBe(total);
    expect(reconciles(item)).toBe(true);
  });

  it('4. exceeding: deductions exceed earnings → net clamped 0, excess tracked', () => {
    const item = buildPayrollItem({
      grossSalary: 400_000,
      advanceDeduction: 500_000,
    });
    const { gross, total, recovered } = split(item);

    // PAYE(400k)=6,500 + NSSF 5%(400k)=20,000 + advance 500,000 = 526,500
    expect(total).toBe(526_500);
    expect(item.net_pay).toBe(0);
    expect(item.outstanding_deductions).toBe(126_500);
    expect(item.outstanding_deductions).toBe(total - gross);
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + (item.outstanding_deductions as number)).toBe(total);
    expect(reconciles(item)).toBe(true);
  });

  it('5. advance-exceeds-net: large advance recovery never over-deducts', () => {
    const item = buildPayrollItem({
      grossSalary: 1_000_000,
      advanceDeduction: 900_000,
    });
    const { gross, total, recovered } = split(item);

    // 180,750 PAYE + 50,000 NSSF + 900,000 advance = 1,130,750 > 1,000,000
    expect(total).toBe(1_130_750);
    expect(item.net_pay).toBe(0);
    expect(item.outstanding_deductions).toBe(130_750);
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + (item.outstanding_deductions as number)).toBe(total);
    expect(reconciles(item)).toBe(true);
  });

  it('6. unpaid-leave+deductions: combined post-tax deductions reconcile', () => {
    const item = buildPayrollItem({
      grossSalary: 1_000_000,
      otherDeductions: 40_000,
      advanceDeduction: 100_000,
      unpaidLeaveDeduction: 50_000,
    });
    const { gross, total, recovered } = split(item);

    expect(total).toBe(420_750);
    expect(item.net_pay).toBe(579_250);
    expect(item.outstanding_deductions).toBe(0);
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + (item.outstanding_deductions as number)).toBe(total);
    expect(reconciles(item)).toBe(true);
  });

  it('7. zero earnings with advance: full advance becomes outstanding liability', () => {
    const item = buildPayrollItem({
      grossSalary: 0,
      employeeType: 'exempt',
      advanceDeduction: 75_000,
    });
    const { gross, total, recovered } = split(item);

    expect(gross).toBe(0);
    expect(total).toBe(75_000);
    expect(item.net_pay).toBe(0);
    expect(item.outstanding_deductions).toBe(75_000);
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + (item.outstanding_deductions as number)).toBe(total);
    expect(reconciles(item)).toBe(true);
  });

  it('8. zero net (exact): advance exactly consumes earnings, nothing outstanding', () => {
    const item = buildPayrollItem({
      grossSalary: 200_000,
      employeeType: 'exempt',
      advanceDeduction: 200_000,
    });
    const { gross, total, recovered } = split(item);

    expect(total).toBe(gross);
    expect(item.net_pay).toBe(0);
    expect(item.outstanding_deductions).toBe(0);
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + (item.outstanding_deductions as number)).toBe(total);
    expect(reconciles(item)).toBe(true);
  });

  it('9. outstanding-unrecovered: unrecovered amount is explicit, never dropped', () => {
    const item = buildPayrollItem({
      grossSalary: 600_000,
      employeeType: 'contractor',
      advanceDeduction: 700_000,
    });
    const { gross, total, recovered } = split(item);

    // WHT 6%(600k)=36,000 + advance 700,000 = 736,000 > 600,000
    expect(total).toBe(736_000);
    expect(item.net_pay).toBe(0);
    expect(item.net_pay).toBeGreaterThanOrEqual(0);
    expect(item.outstanding_deductions).toBe(136_000);
    expect(Number.isFinite(item.outstanding_deductions)).toBe(true);
    expect((item.outstanding_deductions as number)).toBeGreaterThanOrEqual(0);
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + (item.outstanding_deductions as number)).toBe(total);
    expect(reconciles(item)).toBe(true);
  });

  it('10. finalised-item full reconciliation: whole-item coherence, not merely net>=0', () => {
    const item = buildPayrollItem({
      grossSalary: 800_000,
      pctMonthWorked: 65,
      overtimeHours: 4,
      allowances: 50_000,
      otherDeductions: 20_000,
      advanceDeduction: 100_000,
      unpaidLeaveDeduction: 30_000,
    });
    const { gross, total, recovered } = split(item);
    const outstanding = item.outstanding_deductions as number;

    // Whole-item coherence: BOTH equalities must hold simultaneously.
    expect(item.net_pay).toBe(gross - recovered);
    expect(recovered + outstanding).toBe(total);
    // Clamp retained: net is naturally >= 0 by construction.
    expect(item.net_pay).toBeGreaterThanOrEqual(0);
    expect(outstanding).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(outstanding)).toBe(true);
    // Not merely net>=0: an incoherent item with non-negative net must fail
    // (perturbations exceed the 1 UGX rounding tolerance).
    expect(reconciles(item)).toBe(true);
    expect(reconciles({ ...item, outstanding_deductions: outstanding + 2 })).toBe(false);
    expect(reconciles({ ...item, net_pay: item.net_pay + 2 })).toBe(false);
  });
});
