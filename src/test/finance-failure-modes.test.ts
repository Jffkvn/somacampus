/**
 * D1 hardening: financial services must NEVER return mock/demo data on DB failure.
 *
 * - Production DB failure -> explicit throw
 * - Mock data ONLY under isMockEnv (explicit demo flag)
 * - Empty DB response -> empty state (success, not error)
 * - NO_DATA vs DATABASE_ERROR distinguishable by callers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { payrollService } from '../modules/payroll/payrollService';
import { financeService } from '../modules/finance/financeService';
import { expenseService } from '../modules/expenses/expenseService';
import { hrService } from '../modules/hr/hrService';
import { feesService } from '../modules/fees/feesService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const DB_DOWN = new Error('DB connection refused');
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

/** Chainable supabase query mock: `await query` resolves to result via .then */
function mockQuery(result: { data: any; error: any }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
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

const MOCK_PERIOD_IDS = ['period-2026-08', 'period-2026-09'];
const MOCK_RUN_IDS = ['run-2026-08', 'run-2026-09'];
const MOCK_FEE_CAT_IDS = ['fc-tuition', 'fc-dev', 'fc-lunch'];
const MOCK_EXPENSE_IDS = ['exp-1', 'exp-2', 'exp-3', 'exp-4'];
const MOCK_LEAVE_TYPE_IDS = ['lt-annual', 'lt-sick'];

beforeEach(() => {
  vi.resetAllMocks();
  forceProductionEnv();
});

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

describe('finance failure modes: production DB failure must throw, never mock', () => {
  // ─── payrollService ───
  it('payroll getPayrollPeriods: success -> real data', async () => {
    const live = [
      { id: 'live-p1', school_id: 's1', period_start: '2026-10-01', period_end: '2026-10-31', period_month: '2026-10', label: 'October 2026', is_closed: false, created_at: '2026-10-01T00:00:00Z' },
    ];
    mockFrom({ payroll_periods: { data: live, error: null } });
    const res = await payrollService.getPayrollPeriods('s1');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('live-p1');
  });

  it('payroll getPayrollPeriods: empty DB -> empty (not error)', async () => {
    mockFrom({ payroll_periods: { data: [], error: null } });
    await expect(payrollService.getPayrollPeriods('s1')).resolves.toEqual([]);
  });

  it('payroll getPayrollPeriods: DB failure -> throws, never mock-shaped', async () => {
    mockFrom({ payroll_periods: { data: null, error: DB_DOWN } });
    const promise = payrollService.getPayrollPeriods('s1');
    await expect(promise).rejects.toThrow();
    // must never resolve to mock rows
    const settled = await promise.then(
      (v) => ({ ok: true, v }),
      () => ({ ok: false, v: null as any }),
    );
    if (settled.ok) {
      const ids = (settled.v as any[]).map((r) => r.id);
      expect(ids.some((id) => MOCK_PERIOD_IDS.includes(id))).toBe(false);
    } else {
      expect(settled.ok).toBe(false); // threw: correct
    }
  });

  it('payroll getPayrollRuns: DB failure -> throws, never mock-shaped', async () => {
    mockFrom({ school_payroll_runs: { data: null, error: DB_DOWN } });
    await expect(payrollService.getPayrollRuns('s1')).rejects.toThrow();
    const settled = await payrollService.getPayrollRuns('s1').then(
      (v) => ({ ok: true, v }),
      () => ({ ok: false, v: null as any }),
    );
    if (settled.ok) {
      const ids = (settled.v as any[]).map((r: any) => r.id);
      expect(ids.some((id: string) => MOCK_RUN_IDS.includes(id))).toBe(false);
    }
  });

  it('payroll getPayrollRuns: empty DB -> empty', async () => {
    mockFrom({ school_payroll_runs: { data: [], error: null } });
    await expect(payrollService.getPayrollRuns('s1')).resolves.toEqual([]);
  });

  it('payroll getPayrollRunDetails: DB failure -> throws (null reserved for not-found)', async () => {
    mockFrom({ '*': { data: null, error: DB_DOWN } });
    await expect(payrollService.getPayrollRunDetails('missing')).rejects.toThrow();
  });

  it('payroll getMyPayslips: DB failure -> throws, never empty-masquerade', async () => {
    mockFrom({ school_payroll_items: { data: null, error: DB_DOWN } });
    await expect(payrollService.getMyPayslips('emp-x')).rejects.toThrow();
  });

  it('payroll getMyPayslips: empty DB -> empty', async () => {
    mockFrom({ school_payroll_items: { data: [], error: null } });
    await expect(payrollService.getMyPayslips('emp-x')).resolves.toEqual([]);
  });

  // ─── financeService ───
  it('finance getFeeCategories: success -> real data', async () => {
    const live = [{ id: 'live-fc', school_id: 's1', code: 'LIVE', name: 'Live Category', description: null, is_mandatory: true, created_at: '2026-01-01T00:00:00Z' }];
    mockFrom({ fee_categories: { data: live, error: null } });
    const res = await financeService.getFeeCategories('s1');
    expect(res[0].id).toBe('live-fc');
  });

  it('finance getFeeCategories: DB failure -> throws, never mock-shaped', async () => {
    mockFrom({ fee_categories: { data: null, error: DB_DOWN } });
    await expect(financeService.getFeeCategories('s1')).rejects.toThrow();
    const settled = await financeService.getFeeCategories('s1').then(
      (v) => ({ ok: true, v }),
      () => ({ ok: false, v: null as any }),
    );
    if (settled.ok) {
      const ids = (settled.v as any[]).map((r) => r.id);
      expect(ids.some((id) => MOCK_FEE_CAT_IDS.includes(id))).toBe(false);
    }
  });

  it('finance getStudentFeeAccounts: empty DB -> empty (not error)', async () => {
    mockFrom({ student_fee_accounts: { data: [], error: null } });
    await expect(financeService.getStudentFeeAccounts('s1', 'term-1')).resolves.toEqual([]);
  });

  it('finance getStudentFeeAccounts: DB failure -> throws', async () => {
    mockFrom({ student_fee_accounts: { data: null, error: DB_DOWN } });
    await expect(financeService.getStudentFeeAccounts('s1', 'term-1')).rejects.toThrow();
  });

  it('finance getStudentFeeStatement: DB failure -> throws, never mock-shaped', async () => {
    mockFrom({ '*': { data: null, error: DB_DOWN } });
    await expect(financeService.getStudentFeeStatement('stud-amari')).rejects.toThrow();
  });

  // ─── expenseService ───
  it('expense getExpenses: DB failure -> throws, never mock-shaped', async () => {
    mockFrom({ school_expenses: { data: null, error: DB_DOWN } });
    await expect(expenseService.getExpenses('s1')).rejects.toThrow();
    const settled = await expenseService.getExpenses('s1').then(
      (v) => ({ ok: true, v }),
      () => ({ ok: false, v: null as any }),
    );
    if (settled.ok) {
      const ids = (settled.v as any[]).map((r) => r.id);
      expect(ids.some((id) => MOCK_EXPENSE_IDS.includes(id))).toBe(false);
    }
  });

  it('expense getExpenses: empty DB -> empty', async () => {
    mockFrom({ school_expenses: { data: [], error: null } });
    await expect(expenseService.getExpenses('s1')).resolves.toEqual([]);
  });

  it('expense getCategories: DB failure -> throws', async () => {
    mockFrom({ school_expense_categories: { data: null, error: DB_DOWN } });
    await expect(expenseService.getCategories('s1')).rejects.toThrow();
  });

  // ─── hrService ───
  it('hr getLeaveTypes: DB failure -> throws, never mock-shaped', async () => {
    mockFrom({ leave_types: { data: null, error: DB_DOWN } });
    await expect(hrService.getLeaveTypes('s1')).rejects.toThrow();
    const settled = await hrService.getLeaveTypes('s1').then(
      (v) => ({ ok: true, v }),
      () => ({ ok: false, v: null as any }),
    );
    if (settled.ok) {
      const ids = (settled.v as any[]).map((r) => r.id);
      expect(ids.some((id) => MOCK_LEAVE_TYPE_IDS.includes(id))).toBe(false);
    }
  });

  it('hr getMyLeaveRequests: DB failure -> throws', async () => {
    mockFrom({ leave_requests: { data: null, error: DB_DOWN } });
    await expect(hrService.getMyLeaveRequests('emp-x')).rejects.toThrow();
  });

  it('hr getMyAdvances: DB failure -> throws', async () => {
    mockFrom({ staff_advances: { data: null, error: DB_DOWN } });
    await expect(hrService.getMyAdvances('emp-x')).rejects.toThrow();
  });

  it('hr getPendingApprovals: DB failure -> throws (not silent empty)', async () => {
    mockFrom({ '*': { data: null, error: DB_DOWN } });
    await expect(hrService.getPendingApprovals('s1')).rejects.toThrow();
  });

  // ─── feesService ───
  it('fees getFeesDashboard: DB failure -> throws, never mock-shaped', async () => {
    mockFrom({ student_fee_accounts: { data: null, error: DB_DOWN } });
    await expect(feesService.getFeesDashboard('s1')).rejects.toThrow();
  });

  it('fees getFeesDashboard: empty DB -> zeroed dashboard (not error)', async () => {
    mockFrom({ student_fee_accounts: { data: [], error: null } });
    const res = await feesService.getFeesDashboard('s1');
    expect(res.accounts).toEqual([]);
    expect(res.totalOutstanding).toBe(0);
  });
});
