/**
 * SomaCampus Phase 7: Payroll Parity Test Suite
 *
 * Direct parity verification against the audited JantaHR test baseline
 * (calculations.test.js & payrollItem.test.js).
 *
 * Verifies:
 * - Uganda Income Tax (Amendment) Act, 2026 PAYE bands
 * - 10% super-earner surcharge > UGX 10M
 * - NSSF Act Cap 222 (5% employee, 10% employer)
 * - 173.33h overtime engine with 1.5x multiplier and custom rates
 * - Worker classifications: local, global, contractor (WHT 6%), exempt
 * - Pro-rata gross adjustments
 * - Single-writer composer buildPayrollItem reconciliation & net pay clamping
 */

import { describe, it, expect } from 'vitest';
import {
  calculateUgandaPAYE,
  calculateUgandaNSSF,
  calculateOvertime,
  calculateUgandaPayslip,
  formatUGX,
} from '../modules/payroll/calculations';
import {
  buildPayrollItem,
  reconciles,
} from '../modules/payroll/payrollItem';

describe('Uganda Statutory Payroll Parity Suite', () => {
  describe('PAYE Tax Bands (Income Tax (Amendment) Act, 2026)', () => {
    it('charges nil tax at or below the 335,000 threshold', () => {
      expect(calculateUgandaPAYE(0)).toBe(0);
      expect(calculateUgandaPAYE(150_000)).toBe(0);
      expect(calculateUgandaPAYE(235_000)).toBe(0);
      expect(calculateUgandaPAYE(335_000)).toBe(0);
    });

    it('charges 10% on excess over 335,000 up to 410,000', () => {
      expect(calculateUgandaPAYE(350_000)).toBe(1_500); // 15,000 @ 10%
      expect(calculateUgandaPAYE(400_000)).toBe(6_500); // 65,000 @ 10%
      expect(calculateUgandaPAYE(410_000)).toBe(7_500); // statutory hinge
    });

    it('charges 7,500 + 25% on excess over 410,000 up to 485,000', () => {
      expect(calculateUgandaPAYE(430_000)).toBe(12_500); // 7,500 + 20,000 @ 25%
      expect(calculateUgandaPAYE(450_000)).toBe(17_500); // 7,500 + 40,000 @ 25%
      expect(calculateUgandaPAYE(485_000)).toBe(26_250); // statutory hinge
    });

    it('charges 26,250 + 30% on excess over 485,000', () => {
      expect(calculateUgandaPAYE(500_000)).toBe(30_750); // 26,250 + 15,000 @ 30%
      expect(calculateUgandaPAYE(1_000_000)).toBe(180_750); // 26,250 + 515,000 @ 30%
      expect(calculateUgandaPAYE(2_500_000)).toBe(630_750); // 26,250 + 2,015,000 @ 30%
    });

    it('ensures bands are continuous with no jump at boundaries', () => {
      for (const edge of [335_000, 410_000, 485_000, 10_000_000]) {
        const below = calculateUgandaPAYE(edge);
        const above = calculateUgandaPAYE(edge + 1);
        expect(above - below).toBeLessThanOrEqual(1);
      }
    });

    it('ensures tax is monotonic — higher gross never pays less tax', () => {
      let prev = -1;
      for (let gross = 0; gross <= 15_000_000; gross += 97_531) {
        const tax = calculateUgandaPAYE(gross);
        expect(tax).toBeGreaterThanOrEqual(prev);
        prev = tax;
      }
    });

    it('applies 10% super-earner surcharge above 10,000,000 threshold', () => {
      expect(calculateUgandaPAYE(10_000_000)).toBe(2_880_750);
      expect(calculateUgandaPAYE(12_000_000)).toBe(3_680_750); // 3,480,750 + 200,000

      const gross = 15_000_000;
      const withSurcharge = calculateUgandaPAYE(gross);
      const bracketOnly = 26_250 + (gross - 485_000) * 0.30;
      expect(withSurcharge - bracketOnly).toBe((gross - 10_000_000) * 0.10);
    });

    it('respects custom-configured tax bands', () => {
      const flat = [{ min: 0, max: Infinity, rate: 0.15 }];
      expect(calculateUgandaPAYE(1_000_000, flat)).toBe(150_000);
    });
  });

  describe('NSSF Contributions (NSSF Act Cap 222)', () => {
    it('deducts 5% employee, 10% employer, 15% total with no wage ceiling', () => {
      const { employee, employer, total } = calculateUgandaNSSF(1_000_000);
      expect(employee).toBe(50_000);
      expect(employer).toBe(100_000);
      expect(total).toBe(150_000);
    });

    it('ensures employer contribution is always double employee share', () => {
      for (const gross of [200_000, 750_000, 4_400_000, 20_000_000]) {
        const { employee, employer } = calculateUgandaNSSF(gross);
        expect(employer).toBe(employee * 2);
      }
    });

    it('rounds to whole shillings and total equals the parts', () => {
      const { employee, employer, total } = calculateUgandaNSSF(333_333);
      expect(employee).toBe(16_667);
      expect(employer).toBe(33_333);
      expect(total).toBe(employee + employer);
    });
  });

  describe('Overtime Calculations', () => {
    it('returns zero for missing or non-positive hours', () => {
      expect(calculateOvertime(1_000_000, 0)).toEqual({ hourlyRate: 0, overtimeRate: 0, overtimePay: 0 });
      expect(calculateOvertime(1_000_000, -3).overtimePay).toBe(0);
    });

    it('calculates 1.5x hourly rate over 173.33 standard monthly hours', () => {
      const { hourlyRate, overtimeRate, overtimePay } = calculateOvertime(1_000_000, 10);
      expect(hourlyRate).toBe(5_769);
      expect(overtimeRate).toBe(8_654);
      expect(overtimePay).toBe(86_540);
    });

    it('respects custom flat overtime rate', () => {
      const { overtimeRate, overtimePay } = calculateOvertime(1_000_000, 8, 1.5, 173.33, 12_000);
      expect(overtimeRate).toBe(12_000);
      expect(overtimePay).toBe(96_000);
    });
  });

  describe('Worker Tax Classifications', () => {
    it('taxes local employee with PAYE and NSSF', () => {
      const p = calculateUgandaPayslip({ grossSalary: 1_000_000, employeeType: 'local' });
      expect(p.paye).toBe(180_750);
      expect(p.nssfEmployee).toBe(50_000);
      expect(p.nssfEmployer).toBe(100_000);
      expect(p.whtAmount).toBe(0);
      expect(p.netPay).toBe(769_250);
    });

    it('taxes global employee with PAYE only (no NSSF)', () => {
      const p = calculateUgandaPayslip({ grossSalary: 1_000_000, employeeType: 'global' });
      expect(p.paye).toBe(180_750);
      expect(p.nssfEmployee).toBe(0);
      expect(p.nssfEmployer).toBe(0);
      expect(p.netPay).toBe(819_250);
    });

    it('taxes contractor with WHT only (default 6%)', () => {
      const p = calculateUgandaPayslip({ grossSalary: 1_000_000, employeeType: 'contractor' });
      expect(p.whtAmount).toBe(60_000);
      expect(p.paye).toBe(0);
      expect(p.nssfEmployee).toBe(0);
      expect(p.netPay).toBe(940_000);
    });

    it('allows contractor WHT override rate', () => {
      const p = calculateUgandaPayslip({ grossSalary: 1_000_000, employeeType: 'contractor', whtRate: 10 });
      expect(p.whtAmount).toBe(100_000);
    });

    it('does not withhold anything for exempt employees', () => {
      const p = calculateUgandaPayslip({ grossSalary: 1_000_000, employeeType: 'exempt' });
      expect(p.paye).toBe(0);
      expect(p.nssfEmployee).toBe(0);
      expect(p.whtAmount).toBe(0);
      expect(p.netPay).toBe(1_000_000);
    });
  });

  describe('Single-Writer Item Composer (buildPayrollItem)', () => {
    it('reconciles: gross earnings - deductions === net pay', () => {
      const cases = [
        { grossSalary: 1_000_000 },
        { grossSalary: 1_000_000, overtimeHours: 10, allowances: 150_000, otherDeductions: 40_000 },
        { grossSalary: 450_000, employeeType: 'global' as const, allowances: 25_000 },
        { grossSalary: 3_000_000, employeeType: 'contractor' as const },
        { grossSalary: 800_000, pctMonthWorked: 65, overtimeHours: 4 },
        { grossSalary: 14_000_000, allowances: 500_000 },
      ];

      for (const c of cases) {
        const item = buildPayrollItem(c);
        expect(reconciles(item)).toBe(true);
      }
    });

    it('correctly applies advance deductions and unpaid leave deductions', () => {
      const item = buildPayrollItem({
        grossSalary: 1_000_000,
        advanceDeduction: 100_000,
        unpaidLeaveDeduction: 50_000,
      });

      expect(item.advance_deduction).toBe(100_000);
      expect(item.unpaid_leave_deduction).toBe(50_000);
      // Net pay = 1,000,000 - PAYE(180,750) - NSSF(50,000) - Advance(100,000) - Unpaid(50,000) = 619,250
      expect(item.net_pay).toBe(619_250);
      expect(reconciles(item)).toBe(true);
    });

    it('clamps net pay at zero when deductions exceed earnings', () => {
      const item = buildPayrollItem({
        grossSalary: 400_000,
        advanceDeduction: 500_000, // exceeds net pay
      });

      expect(item.net_pay).toBe(0);
      expect(item.net_pay).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Formatting Utility (formatUGX)', () => {
    it('formats whole shillings with thousands separator', () => {
      expect(formatUGX(1_234_567)).toBe('UGX 1,234,567');
      expect(formatUGX(1_234_567.89)).toBe('UGX 1,234,568');
      expect(formatUGX(0)).toBe('UGX 0');
      expect(formatUGX(null)).toBe('UGX 0');
    });
  });
});
