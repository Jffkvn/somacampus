/**
 * D6+D7 hardening (RED): activity projection privacy + finance-scoped tenant checks.
 *
 * Scope: activity projection + current_employee_id school scope + finance-scoped
 * tenant checks ONLY. No academic modules, no payroll math, no UI.
 *
 * Safe-behavior convention (pinned from finance-failure-modes): an RLS deny
 * from PostgREST surfaces as a query error -> services THROW, never leak rows
 * and never silently masquerade deny as empty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { activityService } from '../modules/activities/activityService';
import { financeService } from '../modules/finance/financeService';
import { expenseService } from '../modules/expenses/expenseService';
import { payrollService } from '../modules/payroll/payrollService';
import { hrService } from '../modules/hr/hrService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const RLS_DENY = { code: '42501', message: 'permission denied for table (RLS)' };
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

/** Chainable supabase query mock; records eq() args for school-scope assertions. */
function mockQuery(result: { data: any; error: any }, seen: { eq: any[] }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn((col: string, val: unknown) => {
    seen.eq.push([col, val]);
    return chain;
  });
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

function mockFrom(resultByTable: Record<string, { data: any; error: any }>, seen?: { eq: any[] }) {
  const calls: { eq: any[] } = seen ?? { eq: [] };
  (supabase.from as any).mockImplementation((table: string) => {
    const result = resultByTable[table] ?? resultByTable['*'] ?? { data: [], error: null };
    return mockQuery(result, calls);
  });
  return calls;
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

// Exact server-side projection contract: operational fields only.
const PROJECTION_ALLOWLIST = [
  'studentId',
  'studentName',
  'className',
  'streamName',
  'activityId',
  'activityName',
  'clearanceStatus',
  'clearanceLabel',
  'validUntil',
  'operationalNote',
];

const FORBIDDEN_FINANCIAL_KEYS = [
  'amount',
  'feeAmount',
  'balance',
  'balanceRemaining',
  'arrears',
  'unpaid',
  'paidAmount',
  'debt',
  'chargeId',
  'charge_id',
  'paymentId',
  'payment_id',
  'receiptNumber',
  'netPay',
];

describe('D6: teacher activity projection privacy firewall', () => {
  it('projection contains EXACTLY the operational allowlist (key enumeration)', async () => {
    restoreMockEnv();
    const roster = await activityService.getRosterForTeacher('act-swimming');
    expect(roster.length).toBeGreaterThan(0);
    for (const p of roster) {
      expect(Object.keys(p).sort()).toEqual([...PROJECTION_ALLOWLIST].sort());
    }
  });

  it('projection exposes ZERO financial keys', async () => {
    restoreMockEnv();
    const roster = await activityService.getRosterForTeacher('act-swimming');
    for (const p of roster) {
      for (const key of FORBIDDEN_FINANCIAL_KEYS) {
        expect(p as any).not.toHaveProperty(key);
      }
      // Serialized form must not leak figures either.
      const raw = JSON.stringify(p);
      expect(raw).not.toMatch(/charge_id|payment_id|receipt_number/i);
    }
  });

  it('Promise-to-Pay enrolment is operationally cleared WITHOUT any amount', async () => {
    restoreMockEnv();
    const clearance = await activityService.setOperationalClearance({
      schoolId: 'school-default',
      activityId: 'act-swimming',
      studentId: 'stud-promise',
      status: 'cleared',
      basis: 'promise_to_pay',
      validUntil: '2026-09-30',
      operationalNote: 'Parent commitment letter received',
    });
    expect(clearance.status).toBe('cleared');
    expect(clearance.basis).toBe('promise_to_pay');
    expect(clearance).not.toHaveProperty('amount');
    expect(clearance).not.toHaveProperty('balance');

    const roster = await activityService.getRosterForTeacher('act-swimming');
    const keys = Object.keys(roster[0]);
    expect(keys).not.toContain('amount');
    expect(keys).not.toContain('balance');
  });

  it('roster is school-scoped: wrong-school activity returns no foreign rows', async () => {
    restoreMockEnv();
    const foreign = await activityService.getRosterForTeacher('act-swimming', 'school-B');
    expect(foreign).toEqual([]);
  });

  it('teacher querying financial tables directly is denied (RLS -> throw, never rows)', async () => {
    forceProductionEnv();
    // Direct read of fee_payments as teacher: RLS deny must throw.
    mockFrom({ fee_payments: { data: null, error: RLS_DENY } });
    await expect(financeService.getStudentFeeStatement('stud-amari')).rejects.toThrow();
    // Direct read of school_expenses as teacher: RLS deny must throw.
    mockFrom({ school_expenses: { data: null, error: RLS_DENY } });
    await expect(expenseService.getExpenses('school-B')).rejects.toThrow();
  });
});

describe('D7: finance-scoped tenant isolation (expenses + fee_payments)', () => {
  it('cross-school school_expenses read is denied (RLS -> throw)', async () => {
    forceProductionEnv();
    mockFrom({ school_expenses: { data: null, error: RLS_DENY } });
    await expect(expenseService.getExpenses('school-B')).rejects.toThrow();
    const settled = await expenseService.getExpenses('school-B').then(
      (v) => ({ ok: true as const, v }),
      () => ({ ok: false as const, v: null as any }),
    );
    // Either throws or (if convention ever becomes empty) returns empty — NEVER foreign rows.
    if (settled.ok) expect(settled.v).toEqual([]);
    else expect(settled.ok).toBe(false);
  });

  it('cross-school fee_payments read is denied (RLS -> throw)', async () => {
    forceProductionEnv();
    mockFrom({ '*': { data: null, error: RLS_DENY } });
    await expect(financeService.getStudentFeeStatement('stud-foreign')).rejects.toThrow();
  });
});

describe('D7: school-scoped employee identity (payroll / HR self-service)', () => {
  it('school-A employee cannot read school-B payslips (RLS deny -> throw)', async () => {
    forceProductionEnv();
    const seen = mockFrom({ school_payroll_items: { data: null, error: RLS_DENY } });
    await expect(payrollService.getMyPayslips('emp-school-A', 'school-B')).rejects.toThrow();
    // The read must be school-qualified server-side.
    expect(seen.eq).toContainEqual(['school_id', 'school-B']);
  });

  it('school-A employee cannot read school-B leave requests (RLS deny -> throw)', async () => {
    forceProductionEnv();
    const seen = mockFrom({ leave_requests: { data: null, error: RLS_DENY } });
    await expect(hrService.getMyLeaveRequests('emp-school-A', 'school-B')).rejects.toThrow();
    expect(seen.eq).toContainEqual(['school_id', 'school-B']);
  });

  it('school-A employee cannot read school-B advances (RLS deny -> throw)', async () => {
    forceProductionEnv();
    const seen = mockFrom({ staff_advances: { data: null, error: RLS_DENY } });
    await expect(hrService.getMyAdvances('emp-school-A', 'school-B')).rejects.toThrow();
    expect(seen.eq).toContainEqual(['school_id', 'school-B']);
  });
});
