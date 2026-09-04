/**
 * Single Authoritative Payroll Item Composer — Native SomaCampus Payroll Engine
 *
 * Implements the single-writer pattern from JantaHR:
 * Every writer (run creation, run editing, overtime updates, advance deductions,
 * unpaid leave adjustments) calls buildPayrollItem. Nothing derives net_pay itself.
 *
 * Guarantees:
 * 1. Gross Earnings - Employee Deductions === Net Pay
 * 2. Net Pay >= 0 (clamped so high advance recoveries cannot produce negative net pay)
 * 3. Consistent reconciliation across UI, database, PDF payslips, and exports
 */

import { calculateUgandaPayslip, PayslipCalculationParams } from './calculations';
import { TaxTreatment } from '../../types/domain';

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

  // Post-tax deductions reduce net pay, clamped at 0
  const netPay = Math.max(0, calc.netPay - advance - unpaid);

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
    net_pay: netPay,
    employee_type: (calc.employeeType as TaxTreatment) || 'local',
    pct_month_worked: calc.pctMonthWorked,
  };
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
 * Reconciles check: Total Earnings - Total Deductions === Net Pay (within 1 UGX rounding tolerance).
 */
export function reconciles(item: Partial<PayrollItemRecord> | null | undefined, tolerance: number = 1): boolean {
  if (!item) return false;
  const calculatedNet = totalEarningsOf(item) - totalDeductionsOf(item);
  return Math.abs(calculatedNet - num(item.net_pay)) <= tolerance;
}
