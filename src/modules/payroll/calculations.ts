/**
 * Uganda Statutory Calculations — Native SomaCampus Payroll Engine
 *
 * Implements:
 * - PAYE: Income Tax Act Cap 340 (as amended by Income Tax (Amendment) Act, 2026 — effective July 1, 2026)
 * - NSSF: NSSF Act Cap 222 (5% employee, 10% employer)
 * - Overtime: Standard monthly hours = 173.33, multiplier = 1.5
 * - Worker Classifications:
 *     - 'local': PAYE + NSSF (standard Uganda employee)
 *     - 'global': PAYE only, no NSSF (expat/international staff)
 *     - 'contractor': WHT only at configurable rate (default 6%), no PAYE, no NSSF
 *     - 'exempt': 0% (intern/exempt)
 */

import { PayrollTaxBand } from '../../types/domain';

// Default Monthly income tax bands (UGX) under Income Tax (Amendment) Act, 2026
export const UG_PAYE_BANDS_2026: PayrollTaxBand[] = [
  { min: 0,        max: 335000,   rate: 0.00 },
  { min: 335000,   max: 410000,   rate: 0.10 },
  { min: 410000,   max: 485000,   rate: 0.25 },
  { min: 485000,   max: Infinity, rate: 0.30 },
];

export const SURCHARGE_THRESHOLD = 10000000;
export const SURCHARGE_RATE = 0.10;

/**
 * Calculate Uganda PAYE on monthly gross salary
 */
export function calculateUgandaPAYE(grossMonthly: number, bands: PayrollTaxBand[] = UG_PAYE_BANDS_2026): number {
  if (!grossMonthly || grossMonthly <= 0) return 0;
  let tax = 0;

  for (const band of bands) {
    if (grossMonthly <= band.min) break;
    const upper = (band.max === Infinity || band.max === null) ? grossMonthly : Math.min(grossMonthly, band.max);
    tax += (upper - band.min) * band.rate;
  }

  // Super-earner surcharge, stacked on top of bracket PAYE
  if (grossMonthly > SURCHARGE_THRESHOLD) {
    tax += (grossMonthly - SURCHARGE_THRESHOLD) * SURCHARGE_RATE;
  }

  return Math.round(tax);
}

/**
 * Calculate Uganda NSSF contributions (employee 5%, employer 10%)
 */
export function calculateUgandaNSSF(
  grossMonthly: number,
  employeeRate: number = 0.05,
  employerRate: number = 0.10
): { employee: number; employer: number; total: number } {
  if (!grossMonthly || grossMonthly <= 0) return { employee: 0, employer: 0, total: 0 };
  const employee = Math.round(grossMonthly * employeeRate);
  const employer = Math.round(grossMonthly * employerRate);
  return { employee, employer, total: employee + employer };
}

/**
 * Calculate overtime pay
 */
export function calculateOvertime(
  grossMonthly: number,
  overtimeHours: number,
  multiplier: number = 1.5,
  standardHours: number = 173.33,
  customRate: number | null = null
): { hourlyRate: number; overtimeRate: number; overtimePay: number } {
  if (!overtimeHours || overtimeHours <= 0) {
    return { hourlyRate: 0, overtimeRate: 0, overtimePay: 0 };
  }

  if (customRate !== null && customRate !== undefined) {
    const overtimeRate = Math.round(Number(customRate));
    const overtimePay = Math.round(overtimeRate * overtimeHours);
    return { hourlyRate: 0, overtimeRate, overtimePay };
  }

  const hourlyRate = Math.round(grossMonthly / standardHours);
  const overtimeRate = Math.round(hourlyRate * multiplier);
  const overtimePay = Math.round(overtimeRate * overtimeHours);
  return { hourlyRate, overtimeRate, overtimePay };
}

export interface PayslipCalculationParams {
  grossSalary?: number;
  overtimeHours?: number;
  otherDeductions?: number;
  allowances?: number;
  employeeType?: string;
  pctMonthWorked?: number;
  whtRate?: number | null;
  settings?: {
    paye_bands?: PayrollTaxBand[];
    nssf_employee_rate?: number;
    nssf_employer_rate?: number;
    overtime_multiplier?: number;
    standard_monthly_hours?: number;
    wht_rate?: number;
  };
  customOvertimeRate?: number | null;
}

export interface PayslipCalculationResult {
  grossSalary: number;
  overtimePay: number;
  allowances: number;
  totalGross: number;
  paye: number;
  nssfEmployee: number;
  nssfEmployer: number;
  whtAmount: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  overtimeHours: number;
  overtimeRate: number;
  employeeType: string;
  pctMonthWorked: number;
}

/**
 * Calculate complete payslip for Uganda
 */
export function calculateUgandaPayslip({
  grossSalary = 0,
  overtimeHours = 0,
  otherDeductions = 0,
  allowances = 0,
  employeeType = 'local',
  pctMonthWorked = 100,
  whtRate = null,
  settings = {},
  customOvertimeRate = null,
}: PayslipCalculationParams = {}): PayslipCalculationResult {
  const {
    paye_bands = UG_PAYE_BANDS_2026,
    nssf_employee_rate = 5,
    nssf_employer_rate = 10,
    overtime_multiplier = 1.5,
    standard_monthly_hours = 173.33,
    wht_rate = 6,
  } = settings;

  const validPct = Number.isFinite(pctMonthWorked) ? pctMonthWorked : 100;
  const proRataFactor = Math.min(100, Math.max(0, validPct)) / 100;
  const proRataGross = Math.round((Number(grossSalary) || 0) * proRataFactor);

  const { overtimePay, overtimeRate } = calculateOvertime(
    proRataGross,
    overtimeHours || 0,
    overtime_multiplier,
    standard_monthly_hours,
    customOvertimeRate
  );

  const safeAllowances = Number(allowances) || 0;
  const safeOtherDeductions = Number(otherDeductions) || 0;
  const totalGross = proRataGross + overtimePay + safeAllowances;

  let paye = 0;
  let nssfEmployee = 0;
  let nssfEmployer = 0;
  let whtAmount = 0;

  const resolvedType = employeeType || 'local';

  if (resolvedType === 'contractor') {
    const activeWhtRate = whtRate !== null && whtRate !== undefined ? whtRate : wht_rate;
    whtAmount = Math.round(proRataGross * (activeWhtRate / 100));
  } else if (resolvedType === 'exempt') {
    paye = 0;
    nssfEmployee = 0;
    nssfEmployer = 0;
    whtAmount = 0;
  } else if (resolvedType === 'global') {
    paye = calculateUgandaPAYE(totalGross, paye_bands);
  } else {
    // 'local' or unrecognised defaults to local
    paye = calculateUgandaPAYE(totalGross, paye_bands);
    const nssf = calculateUgandaNSSF(totalGross, nssf_employee_rate / 100, nssf_employer_rate / 100);
    nssfEmployee = nssf.employee;
    nssfEmployer = nssf.employer;
  }

  const totalDeductions = paye + nssfEmployee + whtAmount + safeOtherDeductions;
  const netPay = totalGross - totalDeductions;

  return {
    grossSalary: proRataGross,
    overtimePay,
    allowances: safeAllowances,
    totalGross,
    paye,
    nssfEmployee,
    nssfEmployer,
    whtAmount,
    otherDeductions: safeOtherDeductions,
    totalDeductions,
    netPay,
    overtimeHours: overtimeHours || 0,
    overtimeRate,
    employeeType: resolvedType,
    pctMonthWorked: validPct,
  };
}

/**
 * Format currency in Uganda Shillings (UGX)
 */
export function formatUGX(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return 'UGX 0';
  const rounded = Math.round(Number(amount));
  return `UGX ${rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
