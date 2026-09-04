/**
 * SomaCampus Phase 7 Hardening D4: Finalized Payroll Snapshot Authority
 *
 * Critical Fix #4 — a finalized payroll must be historically reproducible:
 * September finalized at basic 2,000,000; October profile changes to
 * 2,500,000 + a band input changes; September must still read 2,000,000
 * (salary, allowances, bands, NSSF, classification, advances, leave, config).
 *
 * Read-path finding (documented by the tests below):
 * - PayslipDocument renders ONLY the stored `item` prop — no live queries.
 * - payrollService.getPayrollRunDetails maps stored school_payroll_items
 *   columns directly — no recompute from employee_payroll_profiles /
 *   payroll_tax_configurations at read time.
 * - THE GAP: no frozen calculation inputs exist anywhere. The item row has
 *   NO snapshot/config column (verified against
 *   20260911000001_phase7_payroll_and_hr.sql), the run's
 *   calculation_settings stores only a `{ statutoryVersion: '2026.1' }`
 *   label (not the actual bands/rates), and tax_configuration_id is never
 *   written by the service. Any future verify/recompute path — and any
 *   audit of "which bands/NSSF rates produced September?" — must re-read
 *   LIVE config, which October may have changed. That is the live re-read.
 *
 * RED expectations:
 * - stored-columns tests (basic/allowances/NSSF via getPayrollRunDetails)
 *   PASS on current code (column-level authority already holds).
 * - calculation_snapshot tests + migration-shape test FAIL on current code
 *   (field absent, no migration) — the genuine snapshot gap.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { payrollService, resolveEffectiveTaxConfig } from '../modules/payroll/payrollService';
import { buildCalculationSnapshot, computePayrollItem } from '../modules/payroll/payrollItem';
import { UG_PAYE_BANDS_2026 } from '../modules/payroll/calculations';

const REAL_URL = 'https://prod-real-db.supabase.co';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

/** Chainable supabase query mock: `await query` resolves via .then, .single() resolves directly. */
function mockQuery(result: { data: any; error: any }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function mockFrom(resultByTable: Record<string, { data: any; error: any }>) {
  (supabase.from as any).mockImplementation((table: string) => {
    const result = resultByTable[table] ?? resultByTable['*'] ?? { data: [], error: null };
    return mockQuery(result);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  forceProductionEnv();
});

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

// ─── September statutory inputs (frozen) vs October live divergence ───
const SEPT_BANDS = [
  { min: 0, max: 335000, rate: 0 },
  { min: 335000, max: 410000, rate: 0.1 },
  { min: 410000, max: 485000, rate: 0.25 },
  { min: 485000, max: null, rate: 0.3 },
];

const SEPT_TAX_CONFIG_ROW = {
  id: 'tax-sept-1',
  school_id: 's1',
  name: 'Uganda Income Tax (Amendment) Act, 2026 (Effective July 1, 2026)',
  effective_from: '2026-07-01',
  effective_to: null,
  paye_bands: SEPT_BANDS,
  surcharge_threshold: 10000000,
  surcharge_rate: 0.1,
  nssf_employee_rate: 0.05,
  nssf_employer_rate: 0.1,
  overtime_multiplier: 1.5,
  standard_monthly_hours: 173.33,
  default_wht_rate: 0.06,
};
// ─── September STORED row: finalized at basic 2,000,000 + 150,000 allowances ───
// Total gross 2,150,000 (local): PAYE = 26,250 + (2,150,000 − 485,000) × 30% = 525,750;
// NSSF employee 5% = 107,500; employer 10% = 215,000; net = 1,516,750.
const SEPT_STORED_ITEM = {
  id: 'item-sep-1',
  school_id: 's1',
  payroll_run_id: 'run-sep',
  employee_id: 'emp-1',
  gross_salary: 2000000,
  overtime_hours: 0,
  overtime_amount: 0,
  allowances: 150000,
  other_deductions: 0,
  paye: 525750,
  nssf_employee: 107500,
  nssf_employer: 215000,
  wht_amount: 0,
  advance_deduction: 0,
  unpaid_leave_deduction: 0,
  outstanding_deductions: 0,
  net_pay: 1516750,
  employee_type: 'local',
  pct_month_worked: 100,
  // Post-migration row: frozen September inputs (see
  // 20260912000005_payroll_item_calculation_snapshot.sql).
  calculation_snapshot: {
    version: 1,
    statutoryVersion: '2026.1',
    taxConfigurationId: 'tax-sept-1',
    payeBands: SEPT_BANDS,
    inputs: {
      baseSalary: 2000000,
      overtimeHours: 0,
      allowances: 150000,
      otherDeductions: 0,
      employeeType: 'local',
      pctMonthWorked: 100,
      whtRate: null,
      customOvertimeRate: null,
      advanceDeduction: 0,
      unpaidLeaveDeduction: 0,
    },
    rates: {
      nssfEmployeeRate: 0.05,
      nssfEmployerRate: 0.1,
      overtimeMultiplier: 1.5,
      standardMonthlyHours: 173.33,
      surchargeThreshold: 10000000,
      surchargeRate: 0.1,
    },
    settings: {
      paye_bands: SEPT_BANDS,
      nssf_employee_rate: 5,
      nssf_employer_rate: 10,
      overtime_multiplier: 1.5,
      standard_monthly_hours: 173.33,
      wht_rate: 6,
    },
  },
  created_at: '2026-09-28T16:00:00Z',
  employee: { job_title: 'Senior Mathematics Teacher', person: { first_name: 'Sarah', last_name: 'Nabwire' } },
};

const SEPT_FINALIZED_RUN = {
  id: 'run-sep',
  school_id: 's1',
  period_id: 'period-2026-09',
  period: { label: 'September 2026', period_month: '2026-09' },
  run_number: 1,
  run_type: 'regular',
  status: 'finalized',
  calculation_settings: { statutoryVersion: '2026.1' },
  total_gross: 2150000,
  total_paye: 525750,
  total_nssf_employee: 107500,
  total_nssf_employer: 215000,
  total_wht: 0,
  total_deductions: 633250,
  total_net: 1516750,
  finalized_at: '2026-09-28T16:00:00Z',
  created_at: '2026-09-02T10:00:00Z',
  updated_at: '2026-09-28T16:00:00Z',
};

// ─── LIVE (October) re-reads: profile moved to 2,500,000, allowances config ───
// ─── to 300,000, NSSF employee rate to 6% — September must be unaffected. ───
const OCT_LIVE_PROFILE = {
  id: 'prof-1',
  school_id: 's1',
  employee_id: 'emp-1',
  base_salary: 2500000, // CHANGED from 2,000,000
  tax_treatment: 'local',
};

const OCT_LIVE_TAX_CONFIG = {
  id: 'tax-v2',
  paye_bands: [
    { min: 0, max: 400000, rate: 0.0 }, // CHANGED bands
    { min: 400000, max: null, rate: 0.35 },
  ],
  nssf_employee_rate: 0.06, // CHANGED from 5%
  nssf_employer_rate: 0.10,
};

function mockSeptemberFinalized() {
  mockFrom({
    school_payroll_runs: { data: SEPT_FINALIZED_RUN, error: null },
    school_payroll_items: { data: [SEPT_STORED_ITEM], error: null },
    employee_payroll_profiles: { data: [OCT_LIVE_PROFILE], error: null },
    payroll_tax_configurations: { data: [OCT_LIVE_TAX_CONFIG], error: null },
  });
}

describe('Finalized Payroll Snapshot Authority (D4)', () => {
  describe('stored columns stay authoritative despite live profile/config drift', () => {
    it('September basic still reads 2,000,000 after profile moves to 2,500,000', async () => {
      mockSeptemberFinalized();
      const details = await payrollService.getPayrollRunDetails('run-sep');
      expect(details).not.toBeNull();
      expect(details!.run.status).toBe('finalized');
      expect(details!.items).toHaveLength(1);
      expect(details!.items[0].grossSalary).toBe(2000000);
    });

    it('stored allowances (150,000) and NSSF (5% → 107,500) win over live divergence', async () => {
      mockSeptemberFinalized();
      const details = await payrollService.getPayrollRunDetails('run-sep');
      const item = details!.items[0];
      // Live allowances config would yield 300,000; stored September value must win.
      expect(item.allowances).toBe(150000);
      // Live NSSF 6% on 2,150,000 would yield 129,000; stored 5% value must win.
      expect(item.nssfEmployee).toBe(107500);
      expect(item.nssfEmployer).toBe(215000);
      // Classification frozen as stored.
      expect(item.employeeType).toBe('local');
    });
  });

  describe('frozen calculation snapshot (the D4 gap)', () => {
    it('finalized item carries a calculation_snapshot freezing September inputs', async () => {
      mockSeptemberFinalized();
      const details = await payrollService.getPayrollRunDetails('run-sep');
      const item = details!.items[0] as any;
      expect(item.calculationSnapshot).toBeDefined();
      expect(item.calculationSnapshot.inputs.baseSalary).toBe(2000000);
      expect(item.calculationSnapshot.inputs.allowances).toBe(150000);
      expect(item.calculationSnapshot.inputs.employeeType).toBe('local');
    });

    it('snapshot freezes the full band table so October band changes cannot rewrite September', async () => {
      mockSeptemberFinalized();
      const details = await payrollService.getPayrollRunDetails('run-sep');
      const snap = (details!.items[0] as any).calculationSnapshot;
      expect(snap).toBeDefined();
      // Frozen September statutory reference — must NOT equal the live October config.
      expect(snap.statutoryVersion).toBe('2026.1');
      expect(snap.taxConfigurationId).toBe('tax-sept-1');
      expect(snap.taxConfigurationId).not.toBe(OCT_LIVE_TAX_CONFIG.id);
      // The EXACT frozen band table (thresholds + rates), not just a version label.
      expect(snap.payeBands).toEqual(SEPT_BANDS);
      expect(snap.payeBands).not.toEqual(OCT_LIVE_TAX_CONFIG.paye_bands);
      expect(snap.settings.paye_bands).toEqual(SEPT_BANDS);
      expect(snap.rates.nssfEmployeeRate).toBe(0.05);
      expect(snap.rates.nssfEmployeeRate).not.toBe(OCT_LIVE_TAX_CONFIG.nssf_employee_rate);
    });
  });

  describe('snapshot builder (pure input freeze, no tax math)', () => {
    it('freezes allowances + NSSF rates + classification as given', () => {
      const snap = buildCalculationSnapshot({
        baseSalary: 2000000,
        allowances: 150000,
        employeeType: 'local',
      });
      expect(snap.version).toBe(1);
      expect(snap.statutoryVersion).toBe('2026.1');
      expect(snap.inputs.baseSalary).toBe(2000000);
      expect(snap.inputs.allowances).toBe(150000);
      expect(snap.inputs.employeeType).toBe('local');
      expect(snap.rates.nssfEmployeeRate).toBe(0.05);
      expect(snap.rates.nssfEmployerRate).toBe(0.1);
    });

    it('resolves percent-scale settings into decimal rates without touching tax bands', () => {
      const snap = buildCalculationSnapshot({
        baseSalary: 2000000,
        settings: { nssf_employee_rate: 5, nssf_employer_rate: 10 } as any,
      });
      expect(snap.rates.nssfEmployeeRate).toBe(0.05);
      expect(snap.rates.nssfEmployerRate).toBe(0.1);
      expect(snap.settings).toEqual({ nssf_employee_rate: 5, nssf_employer_rate: 10 });
    });
  });

  describe('shared composer: snapshot mirrors the actual computation inputs', () => {
    it('freezes every input (allowances, overtime, advances, leave/pct, WHT/custom rates, settings, config id)', () => {
      const { computed, snapshot } = computePayrollItem(
        {
          baseSalary: 2000000,
          taxTreatment: 'contractor',
          overtimeHours: 5,
          allowances: 150000,
          otherDeductions: 20000,
          pctMonthWorked: 80,
          customWhtRate: 10,
          customOvertimeRate: 12000,
          advanceDeduction: 50000,
          unpaidLeaveDeduction: 25000,
        },
        {
          settings: {
            paye_bands: SEPT_BANDS,
            nssf_employee_rate: 5,
            nssf_employer_rate: 10,
            overtime_multiplier: 1.5,
            standard_monthly_hours: 173.33,
            wht_rate: 6,
          },
          statutoryVersion: '2026.1',
          taxConfigurationId: 'tax-sept-1',
          payeBands: SEPT_BANDS,
          surchargeThreshold: 10000000,
          surchargeRate: 0.1,
        },
      );
      // Snapshot inputs are EXACTLY what the composer computed from.
      expect(snapshot.inputs).toEqual({
        baseSalary: 2000000,
        overtimeHours: 5,
        allowances: 150000,
        otherDeductions: 20000,
        employeeType: 'contractor',
        pctMonthWorked: 80,
        whtRate: 10,
        customOvertimeRate: 12000,
        advanceDeduction: 50000,
        unpaidLeaveDeduction: 25000,
      });
      // Figures and snapshot agree (same source object).
      expect(computed.allowances).toBe(snapshot.inputs.allowances);
      expect(computed.advance_deduction).toBe(snapshot.inputs.advanceDeduction);
      expect(computed.unpaid_leave_deduction).toBe(snapshot.inputs.unpaidLeaveDeduction);
      expect(computed.pct_month_worked).toBe(snapshot.inputs.pctMonthWorked);
      // Contractor WHT honors the threaded override: pro-rata 1,600,000 × 10%.
      expect(computed.wht_amount).toBe(160000);
      // Frozen bands + config id travel with the snapshot.
      expect(snapshot.payeBands).toEqual(SEPT_BANDS);
      expect(snapshot.taxConfigurationId).toBe('tax-sept-1');
    });
  });

  describe('effective tax config resolution (bands origin)', () => {
    it('prefers the school config row: id + band JSON + decimal-to-percent settings', async () => {
      mockFrom({ payroll_tax_configurations: { data: [SEPT_TAX_CONFIG_ROW], error: null } });
      const tax = await resolveEffectiveTaxConfig('s1');
      expect(tax.id).toBe('tax-sept-1');
      expect(tax.bands).toEqual(SEPT_BANDS);
      expect(tax.settings.paye_bands).toEqual(SEPT_BANDS);
      expect(tax.settings.nssf_employee_rate).toBe(5);
      expect(tax.settings.nssf_employer_rate).toBe(10);
      expect(tax.settings.wht_rate).toBe(6);
    });

    it('falls back to statutory constants when no config row exists', async () => {
      mockFrom({ payroll_tax_configurations: { data: [], error: null } });
      const tax = await resolveEffectiveTaxConfig('s1');
      expect(tax.id).toBeNull();
      expect(tax.bands).toEqual(UG_PAYE_BANDS_2026);
      expect(tax.settings.nssf_employee_rate).toBe(5);
    });
  });

  describe('live persistence: calculate persists items with frozen snapshots', () => {
    // 2,000,000 local, no extras, Sept bands: PAYE 480,750; NSSF 100,000/200,000; net 1,419,250.
    const LIVE_PROFILE_ROW = {
      id: 'prof-1',
      school_id: 's1',
      employee_id: 'emp-1',
      base_salary: 2000000,
      tax_treatment: 'local',
      custom_wht_rate: null,
      custom_overtime_rate: null,
    };
    const LIVE_RUN_ROW = {
      id: 'run-oct',
      school_id: 's1',
      period_id: 'period-2026-10',
      status: 'calculated',
      created_at: '2026-10-02T10:00:00Z',
      updated_at: '2026-10-02T10:00:00Z',
    };

    function mockLiveCalculate() {
      const inserted: Record<string, any[]> = {};
      (supabase.from as any).mockImplementation((table: string) => {
        const results: Record<string, { data: any; error: any }> = {
          payroll_tax_configurations: { data: [SEPT_TAX_CONFIG_ROW], error: null },
          employee_payroll_profiles: { data: [LIVE_PROFILE_ROW], error: null },
          school_payroll_runs: { data: LIVE_RUN_ROW, error: null },
          school_payroll_items: { data: [], error: null },
        };
        const chain = mockQuery(results[table] ?? { data: [], error: null });
        chain.insert = vi.fn((rows: any) => {
          inserted[table] = Array.isArray(rows) ? rows : [rows];
          return chain;
        });
        return chain;
      });
      return inserted;
    }

    it('inserts item rows carrying calculation_snapshot + outstanding_deductions', async () => {
      const inserted = mockLiveCalculate();
      await payrollService.createAndCalculateDraftRun('s1', 'period-2026-10');

      const items = inserted['school_payroll_items'];
      expect(items).toHaveLength(1);
      const row = items[0];
      expect(row.payroll_run_id).toBe('run-oct');
      expect(row.employee_id).toBe('emp-1');
      expect(row.gross_salary).toBe(2000000);
      expect(row.paye).toBe(480750);
      expect(row.nssf_employee).toBe(100000);
      expect(row.net_pay).toBe(1419250);
      expect(row.outstanding_deductions).toBe(0);
      // Frozen snapshot payload travels on the persisted row.
      expect(row.calculation_snapshot.inputs.baseSalary).toBe(2000000);
      expect(row.calculation_snapshot.inputs.employeeType).toBe('local');
      expect(row.calculation_snapshot.taxConfigurationId).toBe('tax-sept-1');
      expect(row.calculation_snapshot.payeBands).toEqual(SEPT_BANDS);
      expect(row.calculation_snapshot.settings.paye_bands).toEqual(SEPT_BANDS);
      expect(row.calculation_snapshot.rates.nssfEmployeeRate).toBe(0.05);
    });

    it('inserts the run row with tax_configuration_id + frozen bands in settings', async () => {
      const inserted = mockLiveCalculate();
      await payrollService.createAndCalculateDraftRun('s1', 'period-2026-10');

      const runs = inserted['school_payroll_runs'];
      expect(runs).toHaveLength(1);
      expect(runs[0].tax_configuration_id).toBe('tax-sept-1');
      expect(runs[0].calculation_settings.payeBands).toEqual(SEPT_BANDS);
      expect(runs[0].total_gross).toBe(2000000);
      expect(runs[0].total_net).toBe(1419250);
    });
  });

  describe('migration shape', () => {
    it('adds calculation_snapshot JSONB idempotently on school_payroll_items', () => {
      const p = path.resolve(process.cwd(), 'supabase/migrations', '20260912000005_payroll_item_calculation_snapshot.sql');
      const sql = fs.readFileSync(p, 'utf8');
      expect(sql).toContain('school_payroll_items');
      expect(sql).toContain('calculation_snapshot');
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/i);
      expect(sql).toMatch(/JSONB/i);
    });
  });
});
