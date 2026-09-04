/**
 * T3 review fixes (C4, M1, M2, M3) — RED→GREEN.
 *
 * C4: PayrollDashboardPage.handleAdvanceStatus must surface a rejected
 *     status transition (service returns false) instead of going silent.
 * M1: MyHRPage must thread schoolId into getMyPayslips(empId, schoolId).
 * M2: Advance 50% cap base must be the employee's actual payroll-profile
 *     salary, falling back to the documented hardcoded base ONLY when the
 *     profile is unreadable.
 * M3: createAndCalculateDraftRun must select the effective-dated profile
 *     per employee (effective_from <= period AND (effective_to IS NULL OR
 *     >= period)), so historical rows never duplicate into
 *     UNIQUE(payroll_run_id, employee_id) violations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

const authState = vi.hoisted(() => ({
  schoolId: 'school-default' as string | null,
  fullName: 'Sarah Nabwire',
}));

vi.mock('../lib/authContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: null,
    role: 'teacher',
    fullName: authState.fullName,
    schoolId: authState.schoolId,
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchDevRole: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { payrollService } from '../modules/payroll/payrollService';
import { PayrollDashboardPage } from '../modules/payroll/PayrollDashboardPage';
import { MyHRPage } from '../modules/hr/MyHRPage';

const REAL_URL = 'https://prod-real-db.supabase.co';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

function restoreMockEnv() {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
}

/** Chainable supabase mock that records every chained call per table. */
function recordingQuery(calls: any[], result: { data: any; error: any }) {
  const chain: any = { __calls: calls };
  for (const m of [
    'select',
    'eq',
    'order',
    'is',
    'in',
    'lte',
    'gte',
    'or',
    'limit',
    'update',
  ]) {
    chain[m] = vi.fn((...args: any[]) => {
      calls.push({ method: m, args });
      return chain;
    });
  }
  chain.insert = vi.fn((rows: any) => {
    calls.push({ method: 'insert', args: [rows] });
    return chain;
  });
  chain.single = vi.fn(() => {
    calls.push({ method: 'single', args: [] });
    return Promise.resolve(result);
  });
  chain.maybeSingle = vi.fn(() => {
    calls.push({ method: 'maybeSingle', args: [] });
    return Promise.resolve(result);
  });
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  authState.schoolId = 'school-default';
  authState.fullName = 'Sarah Nabwire';
});

afterEach(() => {
  restoreMockEnv();
  vi.restoreAllMocks();
});

describe('C4: rejected status transition surfaces an alert', () => {
  it('alerts naming the attempted transition when updateRunStatus returns false', async () => {
    restoreMockEnv();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const statusSpy = vi
      .spyOn(payrollService, 'updateRunStatus')
      .mockResolvedValue(false);

    render(
      <MemoryRouter>
        <PayrollDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Staff Payroll & Statutory Remittances')).toBeInTheDocument();
    });
    const advanceBtn = await screen.findByRole('button', { name: /submit for review/i });
    fireEvent.click(advanceBtn);

    await waitFor(() => {
      expect(statusSpy).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    const msg = String(alertSpy.mock.calls[0][0]);
    expect(msg).toMatch(/under_review/);
    expect(msg).toMatch(/reject/i);
  });
});

describe('M1: payslip read is school-scoped from MyHRPage', () => {
  it('MyHRPage passes the in-scope schoolId into getMyPayslips', async () => {
    restoreMockEnv();
    const slipSpy = vi
      .spyOn(payrollService, 'getMyPayslips')
      .mockResolvedValue([]);

    render(
      <MemoryRouter>
        <MyHRPage section="payslips" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(slipSpy).toHaveBeenCalled();
    });
    expect(slipSpy).toHaveBeenCalledWith('emp-teacher-1', 'school-default');
  });

  it('service threads the school filter into the items query', async () => {
    forceProductionEnv();
    const callsByTable: Record<string, any[]> = {};
    (supabase.from as any).mockImplementation((table: string) => {
      const calls: any[] = [];
      callsByTable[table] = calls;
      return recordingQuery(calls, { data: [], error: null });
    });

    await payrollService.getMyPayslips('emp-x', 'school-B');

    const itemCalls = callsByTable['school_payroll_items'] ?? [];
    expect(
      itemCalls.some(
        (c) => c.method === 'eq' && c.args[0] === 'school_id' && c.args[1] === 'school-B'
      )
    ).toBe(true);
  });
});

describe('M2: advance cap uses the actual payroll-profile salary', () => {
  it('service resolves the employee profile salary (unknown employee -> null)', async () => {
    restoreMockEnv();
    const profile = await payrollService.getPayrollProfile('emp-teacher-1');
    expect(profile).not.toBeNull();
    expect(profile!.baseSalary).toBe(1800000);

    const missing = await payrollService.getPayrollProfile('emp-ghost-9');
    expect(missing).toBeNull();
  });

  it('policy cap renders from the resolved profile salary (2,400,000 -> 1,200,000 max)', async () => {
    restoreMockEnv();
    vi.spyOn(payrollService, 'getPayrollProfile').mockResolvedValue({
      id: 'prof-x',
      schoolId: 'school-default',
      employeeId: 'emp-teacher-1',
      effectiveFrom: '2026-01-01',
      payBasis: 'salaried',
      taxTreatment: 'local',
      baseSalary: 2400000,
      currency: 'UGX',
      nssfApplicable: true,
      paymentMethod: 'bank_transfer',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as any);

    render(
      <MemoryRouter>
        <MyHRPage section="advances" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Salary Advance Policy Guidelines')).toBeInTheDocument();
    });
    expect(screen.getByText(/UGX 1,200,000/)).toBeInTheDocument();
  });

  it('falls back to the documented hardcoded base ONLY when the profile is unreadable', async () => {
    restoreMockEnv();
    vi.spyOn(payrollService, 'getPayrollProfile').mockRejectedValue(
      new Error('profile unreadable')
    );

    render(
      <MemoryRouter>
        <MyHRPage section="advances" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Salary Advance Policy Guidelines')).toBeInTheDocument();
    });
    // Fallback base 1,800,000 -> 900,000 cap still renders; page never blanks.
    expect(screen.getByText(/UGX 900,000/)).toBeInTheDocument();
  });
});

describe('M3: draft run selects the effective-dated profile per employee', () => {
  it('two profiles (historical + current) -> exactly one item on the current salary', async () => {
    forceProductionEnv();
    const callsByTable: Record<string, any[]> = {};
    const inserted: Record<string, any[]> = {};
    const HISTORICAL = {
      id: 'prof-hist',
      school_id: 's1',
      employee_id: 'emp-1',
      base_salary: 1500000,
      tax_treatment: 'local',
      effective_from: '2026-01-01',
      effective_to: '2026-06-30',
      custom_wht_rate: null,
      custom_overtime_rate: null,
    };
    const CURRENT = {
      id: 'prof-cur',
      school_id: 's1',
      employee_id: 'emp-1',
      base_salary: 2000000,
      tax_treatment: 'local',
      effective_from: '2026-07-01',
      effective_to: null,
      custom_wht_rate: null,
      custom_overtime_rate: null,
    };
    (supabase.from as any).mockImplementation((table: string) => {
      const calls: any[] = [];
      callsByTable[table] = calls;
      const results: Record<string, { data: any; error: any }> = {
        payroll_periods: {
          data: { period_end: '2026-09-30', period_month: '2026-09' },
          error: null,
        },
        employee_payroll_profiles: { data: [HISTORICAL, CURRENT], error: null },
        payroll_tax_configurations: { data: [], error: null },
        school_payroll_runs: {
          data: { id: 'run-sep', school_id: 's1' },
          error: null,
        },
        school_payroll_items: { data: [], error: null },
      };
      const chain = recordingQuery(
        calls,
        results[table] ?? { data: [], error: null }
      );
      const rawInsert = chain.insert;
      chain.insert = vi.fn((rows: any) => {
        inserted[table] = Array.isArray(rows) ? rows : [rows];
        return rawInsert(rows);
      });
      return chain;
    });

    await payrollService.createAndCalculateDraftRun('s1', 'period-2026-09');

    // Query carries the effective-date filter + recency ordering.
    const profileCalls = callsByTable['employee_payroll_profiles'] ?? [];
    expect(
      profileCalls.some((c) => c.method === 'lte' && c.args[0] === 'effective_from')
    ).toBe(true);
    expect(
      profileCalls.some(
        (c) =>
          c.method === 'order' &&
          c.args[0] === 'effective_from' &&
          c.args[1]?.ascending === false
      )
    ).toBe(true);

    // Exactly one item row (no UNIQUE(payroll_run_id, employee_id) dupes),
    // computed from the CURRENT profile salary.
    const items = inserted['school_payroll_items'] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].employee_id).toBe('emp-1');
    expect(items[0].gross_salary).toBe(2000000);
  });
});
