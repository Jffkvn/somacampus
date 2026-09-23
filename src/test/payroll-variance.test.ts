import { describe, it, expect } from 'vitest';
import {
  comparePayrollRuns,
  summarizeVariance,
  type PayrollLine,
  type PayrollRunSnapshot,
} from '../modules/payroll/payrollVarianceDomain';

const line = (id: string, gross: number, extra: Partial<PayrollLine> = {}): PayrollLine => ({
  employeeId: id,
  employeeName: `Emp ${id}`,
  grossSalary: gross,
  overtimeHours: 0,
  overtimeAmount: 0,
  allowances: 0,
  otherDeductions: 0,
  netPay: gross,
  pctMonthWorked: 100,
  ...extra,
});

const run = (label: string, lines: PayrollLine[]): PayrollRunSnapshot => ({
  runId: label,
  label,
  lines,
});

describe('AI-1 payroll variance compare (rules, not AI)', () => {
  it('flags new joiner and gross jump vs last month', () => {
    const current = run('2026-09', [line('a', 1_200_000), line('b', 500_000)]);
    const prev = run('2026-08', [line('a', 1_000_000)]);
    const report = comparePayrollRuns(current, prev, null);
    const a = report.rows.find((r) => r.employeeId === 'a')!;
    const b = report.rows.find((r) => r.employeeId === 'b')!;
    expect(a.flags.map((f) => f.code)).toContain('gross_jump');
    expect(b.flags.map((f) => f.code)).toContain('new_joiner');
    expect(report.totals.flaggedEmployees).toBe(2);
  });

  it('flags overtime spike and left payroll', () => {
    const current = run('2026-09', [line('a', 1_000_000, { overtimeAmount: 200_000 })]);
    const prev = run('2026-08', [line('a', 1_000_000), line('b', 800_000)]);
    const report = comparePayrollRuns(current, prev, null);
    expect(report.rows.find((r) => r.employeeId === 'a')!.flags.map((f) => f.code)).toContain('overtime_spike');
    expect(report.rows.find((r) => r.employeeId === 'b')!.flags.map((f) => f.code)).toContain('left_payroll');
  });

  it('flags part-month and summarises deterministically', () => {
    const current = run('2026-09', [line('a', 400_000, { pctMonthWorked: 50 })]);
    const prev = run('2026-08', [line('a', 800_000)]);
    const report = comparePayrollRuns(current, prev, run('2026-07', [line('a', 800_000)]));
    expect(report.rows[0].flags.map((f) => f.code)).toContain('part_month');
    expect(summarizeVariance(report)).toMatch(/flagged/);
  });

  it('clean run produces no flags', () => {
    const lines = [line('a', 1_000_000)];
    const report = comparePayrollRuns(run('2026-09', lines), run('2026-08', lines), run('2026-07', lines));
    expect(report.totals.flagCount).toBe(0);
  });
});
