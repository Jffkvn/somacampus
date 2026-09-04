/**
 * Single Authoritative Payroll Item Composer — Native SomaCampus Payroll Engine
 *
 * Implements the single-writer pattern from JantaHR:
 * Every writer (run creation, run editing, overtime updates, advance deductions,
 * unpaid leave adjustments) calls buildPayrollItem. Nothing derives net_pay itself.
 *
 * Guarantees:
 * 1. Gross Earnings - Deductions Recovered === Net Pay
 * 2. Deductions Recovered + Outstanding Deductions === Total Deductions
 *    (unrecovered excess is an explicit outstanding liability — never silently
 *    dropped, never over-deducted)
 * 3. Net Pay >= 0 (clamped so high advance recoveries cannot produce negative net pay)
 * 4. Consistent reconciliation across UI, database, PDF payslips, and exports
 */

import { calculateUgandaPayslip, PayslipCalculationParams } from './calculations';
import { PayrollTaxBand, TaxTreatment } from '../../types/domain';

export interface BuildPayrollItemInput {
  grossSalary?: number;
  overtimeHours?: number;
  allowances?: number;
  otherDeductions?: number;
  employeeType?: TaxTreatment;
  pctMonthWorked?: number;
  whtRate?: number | null;
  settings?: PayslipCalculationParams['settings'];
  customOvertimeRate?: number | null;
  advanceDeduction?: number;
  unpaidLeaveDeduction?: number;
}

export interface PayrollItemRecord {
  gross_salary: number;
  overtime_hours: number;
  overtime_amount: number;
  allowances: number;
  other_deductions: number;
  paye: number;
  nssf_employee: number;
  nssf_employer: number;
  wht_amount: number;
  advance_deduction: number;
  unpaid_leave_deduction: number;
  outstanding_deductions: number;
  net_pay: number;
  employee_type: TaxTreatment;
  pct_month_worked: number;
}

function num(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Authoritative single composer for a payroll item's figures.
 */
export function buildPayrollItem({
  grossSalary = 0,
  overtimeHours = 0,
  allowances = 0,
  otherDeductions = 0,
  employeeType = 'local',
  pctMonthWorked = 100,
  whtRate = 6,
  settings = {},
  customOvertimeRate = null,
  advanceDeduction = 0,
  unpaidLeaveDeduction = 0,
}: BuildPayrollItemInput = {}): PayrollItemRecord {
  const calc = calculateUgandaPayslip({
    grossSalary: num(grossSalary),
    overtimeHours: num(overtimeHours),
    allowances: num(allowances),
    otherDeductions: num(otherDeductions),
    employeeType: employeeType || 'local',
    pctMonthWorked: pctMonthWorked ?? 100,
    whtRate: whtRate ?? 6,
    settings: settings || {},
    customOvertimeRate: customOvertimeRate ?? null,
  });

  const advance = num(advanceDeduction);
  const unpaid = num(unpaidLeaveDeduction);

  // Coherent recovery split: only min(total deductions, gross) can be
  // recovered from this payslip; the excess is an explicit outstanding
  // liability (never silently dropped, never over-deducted).
  // Post-tax deductions reduce net pay, clamped at 0 (net is gross − recovered,
  // naturally >= 0 by construction; the clamp is retained as the guarantee).
  const gross = calc.totalGross;
  const total = calc.totalDeductions + advance + unpaid;
  const recovered = Math.min(total, gross);
  const outstanding = total - recovered;
  const netPay = Math.max(0, gross - recovered);

  return {
    gross_salary: calc.grossSalary,
    overtime_hours: num(overtimeHours),
    overtime_amount: calc.overtimePay,
    allowances: calc.allowances,
    other_deductions: num(otherDeductions),
    paye: calc.paye,
    nssf_employee: calc.nssfEmployee,
    nssf_employer: calc.nssfEmployer,
    wht_amount: calc.whtAmount || 0,
    advance_deduction: advance,
    unpaid_leave_deduction: unpaid,
    outstanding_deductions: outstanding,
    net_pay: netPay,
    employee_type: (calc.employeeType as TaxTreatment) || 'local',
    pct_month_worked: calc.pctMonthWorked,
  };
}

export interface CalculationSnapshotInput {
  baseSalary?: number;
  overtimeHours?: number;
  allowances?: number;
  otherDeductions?: number;
  employeeType?: TaxTreatment;
  pctMonthWorked?: number;
  whtRate?: number | null;
  customOvertimeRate?: number | null;
  advanceDeduction?: number;
  unpaidLeaveDeduction?: number;
  statutoryVersion?: string;
  taxConfigurationId?: string | null;
  // D4-review: the RESOLVED band table actually used by this computation
  // (from the payroll_tax_configurations row when available, else the
  // statutory constants). Frozen so later band edits cannot rewrite history.
  payeBands?: PayrollTaxBand[] | null;
  surchargeThreshold?: number | null;
  surchargeRate?: number | null;
  settings?: PayslipCalculationParams['settings'];
}

/**
 * D4: freeze the calculation inputs behind a payroll item at computation
 * time (draft/calculated). Pure data capture — no tax math, no live reads.
 * The stored snapshot is what finalized renders/audits reproduce from, so
 * later profile or tax-config changes cannot rewrite history.
 */
export function buildCalculationSnapshot({
  baseSalary = 0,
  overtimeHours = 0,
  allowances = 0,
  otherDeductions = 0,
  employeeType = 'local',
  pctMonthWorked = 100,
  whtRate = null,
  customOvertimeRate = null,
  advanceDeduction = 0,
  unpaidLeaveDeduction = 0,
  statutoryVersion = '2026.1',
  taxConfigurationId = null,
  payeBands = null,
  surchargeThreshold = null,
  surchargeRate = null,
  settings = {},
}: CalculationSnapshotInput = {}): Record<string, any> {
  const s = settings || {};
  return {
    version: 1,
    statutoryVersion,
    taxConfigurationId,
    // Frozen band table: the exact thresholds/rates this item was computed under.
    payeBands: payeBands ?? null,
    inputs: {
      baseSalary: num(baseSalary),
      overtimeHours: num(overtimeHours),
      allowances: num(allowances),
      otherDeductions: num(otherDeductions),
      employeeType: employeeType || 'local',
      pctMonthWorked: pctMonthWorked ?? 100,
      whtRate: whtRate ?? null,
      customOvertimeRate: customOvertimeRate ?? null,
      advanceDeduction: num(advanceDeduction),
      unpaidLeaveDeduction: num(unpaidLeaveDeduction),
    },
    rates: {
      // settings carry percent-scale NSSF rates (5/10); snapshot stores decimals.
      nssfEmployeeRate: s.nssf_employee_rate != null ? num(s.nssf_employee_rate) / 100 : 0.05,
      nssfEmployerRate: s.nssf_employer_rate != null ? num(s.nssf_employer_rate) / 100 : 0.1,
      overtimeMultiplier: s.overtime_multiplier != null ? num(s.overtime_multiplier) : 1.5,
      standardMonthlyHours: s.standard_monthly_hours != null ? num(s.standard_monthly_hours) : 173.33,
      // Recorded for audit; the engine resolves the surcharge from constants.
      surchargeThreshold: surchargeThreshold ?? null,
      surchargeRate: surchargeRate ?? null,
    },
    settings: s,
  };
}

/**
 * D4-review: per-employee computation source. Mirrors the profile fields the
 * compute actually consumes; overtime/allowances/deductions/leave default to
 * the values used today (no live source is read for them yet).
 */
export interface PayrollProfileInput {
  baseSalary: number;
  taxTreatment: TaxTreatment;
  overtimeHours?: number | null;
  allowances?: number | null;
  otherDeductions?: number | null;
  pctMonthWorked?: number | null;
  customWhtRate?: number | null;
  customOvertimeRate?: number | null;
  advanceDeduction?: number | null;
  unpaidLeaveDeduction?: number | null;
}

export interface ItemComputationContext {
  settings: PayslipCalculationParams['settings'];
  statutoryVersion: string;
  taxConfigurationId: string | null;
  payeBands: PayrollTaxBand[] | null;
  surchargeThreshold: number | null;
  surchargeRate: number | null;
}

/**
 * D4-review: single composer feeding BOTH buildPayrollItem and
 * buildCalculationSnapshot from ONE inputs object, so the frozen snapshot
 * can never diverge from the figures actually computed. No tax math here —
 * pure input threading.
 */
export function computePayrollItem(
  profile: PayrollProfileInput,
  ctx: ItemComputationContext,
): { computed: PayrollItemRecord; snapshot: Record<string, any> } {
  const input: BuildPayrollItemInput = {
    grossSalary: profile.baseSalary,
    overtimeHours: profile.overtimeHours ?? 0,
    allowances: profile.allowances ?? 0,
    otherDeductions: profile.otherDeductions ?? 0,
    employeeType: profile.taxTreatment,
    pctMonthWorked: profile.pctMonthWorked ?? 100,
    whtRate: profile.customWhtRate ?? null,
    settings: ctx.settings,
    customOvertimeRate: profile.customOvertimeRate ?? null,
    advanceDeduction: profile.advanceDeduction ?? 0,
    unpaidLeaveDeduction: profile.unpaidLeaveDeduction ?? 0,
  };
  const computed = buildPayrollItem(input);
  const snapshot = buildCalculationSnapshot({
    baseSalary: profile.baseSalary,
    overtimeHours: input.overtimeHours,
    allowances: input.allowances,
    otherDeductions: input.otherDeductions,
    employeeType: profile.taxTreatment,
    pctMonthWorked: input.pctMonthWorked,
    whtRate: input.whtRate,
    customOvertimeRate: input.customOvertimeRate,
    advanceDeduction: input.advanceDeduction,
    unpaidLeaveDeduction: input.unpaidLeaveDeduction,
    statutoryVersion: ctx.statutoryVersion,
    taxConfigurationId: ctx.taxConfigurationId,
    payeBands: ctx.payeBands,
    surchargeThreshold: ctx.surchargeThreshold,
    surchargeRate: ctx.surchargeRate,
    settings: ctx.settings,
  });
  return { computed, snapshot };
}

/**
 * Total employee deductions: statutory (PAYE + employee NSSF + WHT) + other deductions + advance + unpaid leave.
 */
export function totalDeductionsOf(item: Partial<PayrollItemRecord> | null | undefined): number {
  return (
    num(item?.paye) +
    num(item?.nssf_employee) +
    num(item?.wht_amount) +
    num(item?.other_deductions) +
    num(item?.advance_deduction) +
    num(item?.unpaid_leave_deduction)
  );
}

/**
 * Total gross earnings: base salary + overtime + allowances.
 */
export function totalEarningsOf(item: Partial<PayrollItemRecord> | null | undefined): number {
  return num(item?.gross_salary) + num(item?.overtime_amount) + num(item?.allowances);
}

/**
 * Deductions recovered from this payslip: min(total deductions, gross).
 * The remainder (if any) is the outstanding liability, never over-deducted.
 */
export function recoveredDeductionsOf(item: Partial<PayrollItemRecord> | null | undefined): number {
  return Math.min(totalDeductionsOf(item), totalEarningsOf(item));
}

/**
 * Outstanding (unrecovered) deductions: explicit liability carried forward.
 * Always >= 0 on items produced by buildPayrollItem.
 */
export function outstandingDeductionsOf(item: Partial<PayrollItemRecord> | null | undefined): number {
  return num(item?.outstanding_deductions);
}

/**
 * Reconciles check — BOTH equalities must hold (within rounding tolerance):
 * 1. Total Earnings - Deductions Recovered === Net Pay
 * 2. Deductions Recovered + Outstanding Deductions === Total Deductions
 *
 * A merely non-negative net pay is NOT sufficient: an item whose clamped
 * liability was silently dropped fails check 2.
 */
export function reconciles(item: Partial<PayrollItemRecord> | null | undefined, tolerance: number = 1): boolean {
  if (!item) return false;
  const gross = totalEarningsOf(item);
  const total = totalDeductionsOf(item);
  const outstanding = outstandingDeductionsOf(item);
  const recovered = Math.min(total, gross);
  const netOk = Math.abs(gross - recovered - num(item.net_pay)) <= tolerance;
  const splitOk = Math.abs(recovered + outstanding - total) <= tolerance;
  return netOk && splitOk;
}
