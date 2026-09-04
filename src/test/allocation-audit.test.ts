/**
 * D8+D9 hardening: allocation invariant + audit coverage (tests-first).
 *
 * Allocation invariant: payment.amount = sum(allocations) + unallocated_amount
 *   exact 100/100/0; partial 100/70/30; overpayment 100/60/40-credit;
 *   multi-allocation one payment -> 2 charges; negative/zero REJECTED.
 * Derived balance: from charges+allocations, NOT payment existence.
 * Audit: each mutating operation ATTEMPTS financial_audit_logs INSERT with
 *   who/what/when/school/old/new (mocked supabase payload pin).
 * Immutability: finalized payroll + audit rows reject mutation (error path).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { financeService } from '../modules/finance/financeService';
import { expenseService } from '../modules/expenses/expenseService';
import { payrollService } from '../modules/payroll/payrollService';
import { hrService } from '../modules/hr/hrService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const TEST_ACTOR_ID = 'test-actor-1';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}
function forceMockEnv() {
  process.env.NODE_ENV = 'test';
}

type CapturedOp = { table: string; op: string; payload?: any };
let captured: CapturedOp[] = [];

/** Chainable supabase mock supporting select/insert/update + single/maybeSingle/then. */
function mockChain(table: string, singleData: any) {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn((payload: any) => {
    captured.push({ table, op: 'insert', payload });
    return chain;
  });
  chain.update = vi.fn((payload: any) => {
    captured.push({ table, op: 'update', payload });
    return chain;
  });
  chain.delete = vi.fn(() => {
    captured.push({ table, op: 'delete' });
    return chain;
  });
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(async () => ({ data: singleData, error: null }));
  chain.maybeSingle = vi.fn(async () => ({ data: singleData, error: null }));
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: singleData, error: null }).then(resolve, reject);
  return chain;
}

function mockLiveSuccess() {
  (supabase.from as any).mockImplementation((table: string) => {
    captured.push({ table, op: 'from' });
    if (table === 'fee_payments') {
      return mockChain(table, {
        id: '11111111-1111-4111-8111-111111111111',
        school_id: 's1',
        student_id: 'stud-x',
        amount: 100,
        receipt_number: 'REC-202609-0001',
        status: 'fully_allocated',
        unallocated_amount: 0,
      });
    }
    if (table === 'school_expenses') {
      return mockChain(table, {
        id: '22222222-2222-4222-8222-222222222222',
        school_id: 's1',
        amount: 50000,
        status: 'recorded',
      });
    }
    if (table === 'school_payroll_runs') {
      return mockChain(table, {
        id: '33333333-3333-4333-8333-333333333333',
        school_id: 's1',
        status: 'calculated',
      });
    }
    if (table === 'financial_audit_logs') {
      return mockChain(table, { id: 'audit-1' });
    }
    // T1: audit helper resolves people.id from the auth uid (people_auth_read).
    // This fixture maps the test auth actor to its people row.
    if (table === 'people') {
      return mockChain(table, { id: TEST_ACTOR_ID });
    }
    // payroll_tax_configurations / employee_payroll_profiles / leave / advance lists
    if (table === 'payroll_tax_configurations' || table === 'employee_payroll_profiles') {
      return mockChain(table, []);
    }
    return mockChain(table, table.includes('payroll') || table.includes('leave') || table.includes('advance') ? [] : { id: 'row-1' });
  });
}

function auditInserts() {
  return captured.filter((c) => c.table === 'financial_audit_logs' && c.op === 'insert');
}

function migrationSql(name: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations', name), 'utf8');
}

/** Fresh engine per test: re-evaluates the mock ledger (isolated charges/allocations). */
async function freshFinanceService() {
  vi.resetModules();
  const mod = await import('../modules/finance/financeService');
  return mod.financeService;
}

/** Pure invariant helper: amount = allocated + unallocated. */
function invariantHolds(amount: number, allocatedSum: number, unallocated: number): boolean {
  return amount === allocatedSum + unallocated;
}

beforeEach(() => {
  vi.resetAllMocks();
  captured = [];
});
afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

describe('D8 allocation invariant (mock engine)', () => {
  beforeEach(() => forceMockEnv());

  it('exact 100/100/0: engine allocates the full 100, zero credit', async () => {
    const svc = await freshFinanceService();
    const before = await svc.getStudentFeeStatement('stud-aurora');
    expect(before?.balance ?? 0).toBeGreaterThanOrEqual(100);
    const payment = await svc.recordPayment({
      schoolId: 'school-default',
      studentId: 'stud-aurora',
      amount: 100,
      paymentDate: '2026-09-05',
      paymentChannel: 'cash',
      paymentReference: `CASH-EXACT-${Date.now()}`,
    });
    expect(payment.amount).toBe(100);
    expect(payment.unallocatedAmount).toBe(0);
    expect(payment.status).toBe('fully_allocated');
    const allocated = payment.amount - payment.unallocatedAmount;
    expect(allocated).toBe(100);
    expect(invariantHolds(payment.amount, allocated, payment.unallocatedAmount)).toBe(true);
    const after = await svc.getStudentFeeStatement('stud-aurora');
    expect((after?.totalPaid ?? 0) - (before?.totalPaid ?? 0)).toBe(100);
  });

  it('partial 100/70/30: engine allocates 70, retains 30 credit', async () => {
    const svc = await freshFinanceService();
    const start = await svc.getStudentFeeStatement('stud-aurora');
    const outstanding = start?.balance ?? 0;
    expect(outstanding).toBeGreaterThan(100);
    // Sculpt outstanding down to exactly 70 via the real engine.
    await svc.recordPayment({
      schoolId: 'school-default',
      studentId: 'stud-aurora',
      amount: outstanding - 70,
      paymentDate: '2026-09-05',
      paymentChannel: 'cash',
      paymentReference: `CASH-SCULPT-${Date.now()}`,
    });
    const before = await svc.getStudentFeeStatement('stud-aurora');
    expect(before?.balance).toBe(70);
    const payment = await svc.recordPayment({
      schoolId: 'school-default',
      studentId: 'stud-aurora',
      amount: 100,
      paymentDate: '2026-09-05',
      paymentChannel: 'cash',
      paymentReference: `CASH-PARTIAL-${Date.now()}`,
    });
    expect(payment.amount).toBe(100);
    expect(payment.unallocatedAmount).toBe(30);
    expect(payment.status).toBe('partially_allocated');
    const allocated = payment.amount - payment.unallocatedAmount;
    expect(allocated).toBe(70);
    expect(invariantHolds(payment.amount, allocated, payment.unallocatedAmount)).toBe(true);
    const after = await svc.getStudentFeeStatement('stud-aurora');
    expect((after?.totalPaid ?? 0) - (before?.totalPaid ?? 0)).toBe(70);
    expect(after?.balance).toBe(0);
  });

  it('overpayment 100/60/40-credit: engine allocates 60, retains 40 credit', async () => {
    const svc = await freshFinanceService();
    const start = await svc.getStudentFeeStatement('stud-aurora');
    const outstanding = start?.balance ?? 0;
    expect(outstanding).toBeGreaterThan(100);
    // Sculpt outstanding down to exactly 60 via the real engine.
    await svc.recordPayment({
      schoolId: 'school-default',
      studentId: 'stud-aurora',
      amount: outstanding - 60,
      paymentDate: '2026-09-05',
      paymentChannel: 'cash',
      paymentReference: `CASH-SCULPT-${Date.now()}`,
    });
    const before = await svc.getStudentFeeStatement('stud-aurora');
    expect(before?.balance).toBe(60);
    const payment = await svc.recordPayment({
      schoolId: 'school-default',
      studentId: 'stud-aurora',
      amount: 100,
      paymentDate: '2026-09-05',
      paymentChannel: 'mobile_money',
      paymentReference: `MM-OVER-${Date.now()}`,
    });
    expect(payment.amount).toBe(100);
    expect(payment.unallocatedAmount).toBe(40);
    expect(payment.status).toBe('partially_allocated');
    const allocated = payment.amount - payment.unallocatedAmount;
    expect(allocated).toBe(60);
    expect(invariantHolds(payment.amount, allocated, payment.unallocatedAmount)).toBe(true);
    const after = await svc.getStudentFeeStatement('stud-aurora');
    expect((after?.totalPaid ?? 0) - (before?.totalPaid ?? 0)).toBe(60);
    expect(after?.balance).toBe(0);
  });

  it('multi-allocation: one payment spans 2 charges', async () => {
    const svc = await freshFinanceService();
    const before = await svc.getStudentFeeStatement('stud-aurora');
    const outstanding = before?.balance ?? 0;
    expect(outstanding).toBeGreaterThan(0);
    expect((before?.charges ?? []).length).toBeGreaterThanOrEqual(2);
    // Pay the full outstanding: must touch both tuition remainder + lunch.
    const payment = await svc.recordPayment({
      schoolId: 'school-default',
      studentId: 'stud-aurora',
      amount: outstanding,
      paymentDate: '2026-09-05',
      paymentChannel: 'bank_deposit',
      paymentReference: `BNK-MULTI-${Date.now()}`,
    });
    expect(payment.unallocatedAmount).toBe(0);
    expect(payment.status).toBe('fully_allocated');
    const allocated = payment.amount - payment.unallocatedAmount;
    expect(invariantHolds(payment.amount, allocated, payment.unallocatedAmount)).toBe(true);
    const after = await svc.getStudentFeeStatement('stud-aurora');
    const covered = (after?.charges ?? []).filter((c: any) => (c.paidAmount ?? 0) > 0);
    expect(covered.length).toBeGreaterThanOrEqual(2);
    expect((after?.totalPaid ?? 0) - (before?.totalPaid ?? 0)).toBe(allocated);
    for (const c of after?.charges ?? []) expect(c.balance).toBe(0);
    expect(after?.balance).toBe(0);
  });

  it('rejects zero and negative payments', async () => {
    await expect(
      financeService.recordPayment({
        schoolId: 'school-default',
        studentId: 'stud-amari',
        amount: 0,
        paymentDate: '2026-09-05',
        paymentChannel: 'cash',
        paymentReference: 'CASH-ZERO',
      })
    ).rejects.toThrow('Payment amount must be greater than zero.');
    await expect(
      financeService.recordPayment({
        schoolId: 'school-default',
        studentId: 'stud-amari',
        amount: -50,
        paymentDate: '2026-09-05',
        paymentChannel: 'cash',
        paymentReference: 'CASH-NEG',
      })
    ).rejects.toThrow('Payment amount must be greater than zero.');
  });

  it('derived balance comes from charges+allocations, not payment existence', async () => {
    const ghost = `stud-ghost-${Date.now()}`;
    const before = await financeService.getStudentFeeStatement(ghost);
    const beforePaid = before?.totalPaid ?? 0;
    const beforeBalance = before?.balance ?? 0;
    // Ghost has no charges: payment becomes full credit, balance unchanged.
    const payment = await financeService.recordPayment({
      schoolId: 'school-default',
      studentId: ghost,
      amount: 100,
      paymentDate: '2026-09-05',
      paymentChannel: 'cash',
      paymentReference: `CASH-GHOST-${Date.now()}`,
    });
    expect(payment.unallocatedAmount).toBe(100);
    expect(invariantHolds(payment.amount, 0, payment.unallocatedAmount)).toBe(true);
    const after = await financeService.getStudentFeeStatement(ghost);
    expect(after?.totalPaid ?? 0).toBe(beforePaid);
    expect(after?.balance ?? 0).toBe(beforeBalance);
  });
});

describe('D9 audit coverage: services ATTEMPT audit write with who/what/when/school/old/new', () => {
  beforeEach(() => {
    forceProductionEnv();
    mockLiveSuccess();
    // Live paths resolve the actor via supabase.auth.getUser (best-effort).
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: TEST_ACTOR_ID } },
      error: null,
    });
  });

  function expectAuditFields(payload: any, entityType: string) {
    expect(payload).toBeDefined();
    // school (tenant scope)
    expect(payload.school_id ?? payload.schoolId).toBeDefined();
    // what
    expect(payload.entity_type ?? payload.entityType).toBeDefined();
    expect(String(payload.entity_type ?? payload.entityType)).toContain(entityType);
    expect(payload.entity_id ?? payload.entityId ?? payload.payment_id ?? payload.expense_id).toBeDefined();
    expect(payload.action).toBeDefined();
    // who (pinned non-null: live paths resolve via supabase.auth.getUser)
    expect(payload.performed_by).toBe(TEST_ACTOR_ID);
    // when
    expect(payload.performed_at ?? payload.performedAt ?? payload.created_at).toBeDefined();
    // old / new + reason (schema requires reason NOT NULL)
    expect('previous_data' in payload || 'previousData' in payload || 'old' in payload).toBe(true);
    expect('new_data' in payload || 'newData' in payload || 'new' in payload).toBe(true);
    expect(payload.reason).toBeDefined();
  }

  it('recordPayment attempts payment (+allocation) audit with required fields', async () => {
    await financeService.recordPayment({
      schoolId: 's1',
      studentId: 'stud-x',
      amount: 100,
      paymentDate: '2026-09-05',
      paymentChannel: 'cash',
      paymentReference: 'CASH-AUDIT-1',
    });
    const inserts = auditInserts();
    expect(inserts.length).toBeGreaterThan(0);
    const payload = inserts[0].payload?.constructor === Array ? inserts[0].payload[0] : inserts[0].payload;
    expectAuditFields(payload, 'payment');
  });

  it('recordExpense attempts expense audit with required fields', async () => {
    await expenseService.recordExpense({
      schoolId: 's1',
      categoryId: 'cat-lunch',
      amount: 50000,
      spentOn: '2026-09-05',
      paymentChannel: 'cash',
      recipientPayee: 'Test Supplier',
      description: 'Audit probe expense',
    });
    const inserts = auditInserts();
    expect(inserts.length).toBeGreaterThan(0);
    const payload = inserts[0].payload?.constructor === Array ? inserts[0].payload[0] : inserts[0].payload;
    expectAuditFields(payload, 'expense');
  });

  it('payroll lifecycle (create draft + status advance) attempts audit', async () => {
    await payrollService.createAndCalculateDraftRun('s1', 'period-2026-09');
    await payrollService.updateRunStatus('33333333-3333-4333-8333-333333333333', 'under_review');
    const inserts = auditInserts();
    expect(inserts.length).toBeGreaterThan(0);
    for (const ins of inserts) {
      const payload = ins.payload?.constructor === Array ? ins.payload[0] : ins.payload;
      expect(payload.school_id ?? payload.schoolId).toBeDefined();
      expect(payload.action).toBeDefined();
      // who pinned non-null via auth context
      expect(payload.performed_by).toBe(TEST_ACTOR_ID);
      expect(payload.performed_at).toBeDefined();
    }
    // updateRunStatus audit carries the authoritative previous/new statuses
    const statusAudit = inserts
      .map((i) => (i.payload?.constructor === Array ? i.payload[0] : i.payload))
      .find((p) => String(p.action ?? '').startsWith('status:'));
    expect(statusAudit).toBeDefined();
    expect(statusAudit.previous_data).toEqual({ status: 'calculated' });
    expect(statusAudit.new_data).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'under_review',
    });
    expect(statusAudit.school_id).toBe('s1');
  });

  it('salary advance + leave approvals attempt audit (who/when pinned)', async () => {
    await hrService.decideAdvanceRequest('adv-1', 'active', 'Approved for test');
    await hrService.decideLeaveRequest('req-leave-1', 'approved', 'Approved for test');
    const inserts = auditInserts();
    expect(inserts.length).toBeGreaterThan(0);
    for (const ins of inserts) {
      const payload = ins.payload?.constructor === Array ? ins.payload[0] : ins.payload;
      expect(payload.school_id ?? payload.schoolId).toBeDefined();
      expect(payload.action).toBeDefined();
      // who/when pinned non-null via auth context
      expect(payload.performed_by).toBe(TEST_ACTOR_ID);
      expect(payload.performed_at).toBeDefined();
    }
  });

  it('schema supports charge/adjustment/clearance audit entity types', () => {
    const sql = migrationSql('20260911000000_phase7_school_finance.sql').toLowerCase();
    expect(sql).toContain('financial_audit_logs');
    expect(sql).toContain('charge');
    expect(sql).toContain('allocation');
    expect(sql).toContain('adjustment');
    expect(sql).toContain('expense');
    expect(sql).toContain('clearance');
  });
});

describe('D8+D9 immutability: finalized payroll + audit rows reject mutation', () => {
  beforeEach(() => forceMockEnv());

  it('financial_audit_logs is guarded immutable in SQL', () => {
    const sql = migrationSql('20260911000000_phase7_school_finance.sql');
    expect(sql).toMatch(/prevent_financial_audit_mutation/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.financial_audit_logs/i);
  });

  it('finalized payroll guards exist in SQL and are never dropped', () => {
    const hr = migrationSql('20260911000001_phase7_payroll_and_hr.sql');
    expect(hr).toMatch(/guard_finalised_payroll_items/i);
    expect(hr).toMatch(/guard_payroll_run_status/i);
  });

  it('mock finalized run cannot be returned to draft (error path, status preserved)', async () => {
    const details = await payrollService.getPayrollRunDetails('run-2026-08');
    expect(details?.run.status).toBe('finalized');
    await expect(payrollService.updateRunStatus('run-2026-08', 'draft')).rejects.toThrow();
    const after = await payrollService.getPayrollRunDetails('run-2026-08');
    expect(after?.run.status).toBe('finalized');
  });

  it('services never issue update/delete against financial_audit_logs', async () => {
    forceProductionEnv();
    mockLiveSuccess();
    await financeService.recordPayment({
      schoolId: 's1',
      studentId: 'stud-x',
      amount: 50,
      paymentDate: '2026-09-05',
      paymentChannel: 'cash',
      paymentReference: 'CASH-NOMUT-1',
    });
    await expenseService.recordExpense({
      schoolId: 's1',
      categoryId: 'cat-lunch',
      amount: 10,
      spentOn: '2026-09-05',
      paymentChannel: 'cash',
      recipientPayee: 'X',
      description: 'no-mut probe',
    });
    const mutating = captured.filter(
      (c) => c.table === 'financial_audit_logs' && (c.op === 'update' || c.op === 'delete')
    );
    expect(mutating).toEqual([]);
    // but inserts were attempted (append-only ledger usage)
    expect(auditInserts().length).toBeGreaterThan(0);
  });
});
