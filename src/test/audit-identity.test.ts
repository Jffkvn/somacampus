/**
 * T1 review-fix (tests-first, RED):
 *
 * VERIFIED FACT: financial_audit_logs.performed_by REFERENCES people(id), NOT
 * auth.users.id. The helper currently passes the raw auth uid -> FK violation,
 * zero audit rows written live. people has a people_auth_read SELECT policy
 * (authenticated can read), so the helper must resolve people.id from the
 * auth uid via people.select(id).eq(auth_user_id, uid).maybeSingle().
 *
 * Also: the live recordPayment path inserts fee_payments only — no
 * payment_allocations rows, no unallocated_amount/status computation. The mock
 * path owns the full waterfall engine (oldest-due-first, outstanding computed
 * from existing allocations since student_charges has no paid column). The
 * live path must mirror it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { writeFinancialAudit } from '../lib/financialAudit';
import { financeService } from '../modules/finance/financeService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const AUTH_UID = 'auth-uid-AAA';
const PEOPLE_ID = 'people-BBB';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

type CapturedOp = { table: string; op: string; payload?: any };
let captured: CapturedOp[] = [];

interface TableStub {
  awaitData?: any;
  singleData?: any;
  maybeData?: any;
  maybeError?: any;
}

/** Chainable supabase mock: `await query` resolves awaitData; single/maybeSingle pinned. */
function mockChain(table: string, stub: TableStub) {
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
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(async () => ({ data: stub.singleData, error: null }));
  chain.maybeSingle = vi.fn(async () => ({ data: stub.maybeData ?? null, error: stub.maybeError ?? null }));
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: stub.awaitData ?? null, error: null }).then(resolve, reject);
  return chain;
}

function mockTables(stubs: Record<string, TableStub>) {
  (supabase.from as any).mockImplementation((table: string) => {
    captured.push({ table, op: 'from' });
    return mockChain(table, stubs[table] ?? { awaitData: null, singleData: { id: `${table}-row` } });
  });
}

function auditPayloads() {
  return captured
    .filter((c) => c.table === 'financial_audit_logs' && c.op === 'insert')
    .map((c) => (c.payload?.constructor === Array ? c.payload[0] : c.payload));
}

const CHARGES = [
  { id: 'chg-old', school_id: 's1', student_id: 'stud-x', amount: 70, due_date: '2026-08-01' },
  { id: 'chg-new', school_id: 's1', student_id: 'stud-x', amount: 60, due_date: '2026-09-01' },
];

const PAYMENT_ROW = {
  id: 'pay-1',
  school_id: 's1',
  student_id: 'stud-x',
  amount: 100,
  receipt_number: 'REC-202609-0099',
  status: 'fully_allocated',
  unallocated_amount: 0,
};

function mockAuthUid() {
  (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: AUTH_UID } }, error: null });
}

function baseStubs(overrides: Record<string, TableStub> = {}): Record<string, TableStub> {
  return {
    people: { maybeData: { id: PEOPLE_ID } },
    student_charges: { awaitData: CHARGES },
    payment_allocations: { awaitData: [] },
    fee_payments: { singleData: PAYMENT_ROW },
    financial_audit_logs: { singleData: { id: 'audit-1' } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  captured = [];
  forceProductionEnv();
});
afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
  vi.restoreAllMocks();
});

describe('T1(a): audit helper resolves people.id from the auth uid', () => {
  it('sends people.id as performed_by, NOT the raw auth uid', async () => {
    mockAuthUid();
    mockTables(baseStubs());
    await writeFinancialAudit({
      schoolId: 's1',
      entityType: 'payment',
      entityId: 'pay-1',
      action: 'create',
      reason: 'probe',
      previousData: null,
      newData: { id: 'pay-1' },
    });
    const payloads = auditPayloads();
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads[0].performed_by).toBe(PEOPLE_ID);
    expect(payloads[0].performed_by).not.toBe(AUTH_UID);
  });

  it('explicit performedBy still wins (no people lookup)', async () => {
    mockAuthUid();
    mockTables(baseStubs());
    await writeFinancialAudit({
      schoolId: 's1',
      entityType: 'payment',
      entityId: 'pay-1',
      action: 'create',
      performedBy: 'explicit-person-1',
      reason: 'probe',
      previousData: null,
      newData: { id: 'pay-1' },
    });
    const payloads = auditPayloads();
    expect(payloads[0].performed_by).toBe('explicit-person-1');
    const peopleFroms = captured.filter((c) => c.table === 'people');
    expect(peopleFroms).toEqual([]);
  });
});

describe('T1(b): people lookup failure degrades gracefully', () => {
  it('performed_by null + warn, insert still attempted', async () => {
    mockAuthUid();
    mockTables(baseStubs({ people: { maybeData: null, maybeError: { message: 'boom' } } }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await writeFinancialAudit({
      schoolId: 's1',
      entityType: 'payment',
      entityId: 'pay-1',
      action: 'create',
      reason: 'probe',
      previousData: null,
      newData: { id: 'pay-1' },
    });
    const payloads = auditPayloads();
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads[0].performed_by).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('T1(c): live recordPayment delegates to the atomic record_fee_payment RPC', () => {
  const SCHOOL = '22222222-2222-2222-2222-222222222222';
  const STUDENT = '767d2e4a-6fec-47f0-a1d2-2cc50ec29771';
  let rpcCalls: Array<{ fn: string; args: any }> = [];

  function mockRpc(result: any) {
    rpcCalls = [];
    (supabase as any).rpc = vi.fn(async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return result;
    });
  }

  async function livePaymentRpc(amount: number) {
    return financeService.recordPayment({
      schoolId: SCHOOL,
      studentId: STUDENT,
      amount,
      paymentDate: '2026-09-05',
      paymentChannel: 'cash',
      paymentReference: `CASH-T1-${amount}`,
    });
  }

  it('issues exactly one RPC call with school/student/amount (no client waterfall)', async () => {
    mockRpc({
      data: {
        payment_id: 'pay-1',
        receipt_number: 'RCP-20260905-x1',
        status: 'fully_allocated',
        allocated: 100,
        unallocated: 0,
        account_id: 'acc-1',
      },
      error: null,
    });
    const pmt = await livePaymentRpc(100);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('record_fee_payment');
    expect(rpcCalls[0].args).toMatchObject({
      p_school_id: SCHOOL,
      p_student_id: STUDENT,
      p_amount: 100,
    });
    // No direct table writes from the client: atomicity lives server-side.
    expect(captured.filter((c) => c.op === 'insert')).toEqual([]);
    expect(pmt.status).toBe('fully_allocated');
    expect(pmt.unallocatedAmount).toBe(0);
    expect(pmt.receiptNumber).toBe('RCP-20260905-x1');
  });

  it('maps partial allocation + retained credit from the RPC result', async () => {
    mockRpc({
      data: {
        payment_id: 'pay-2',
        receipt_number: 'RCP-20260905-x2',
        status: 'partially_allocated',
        allocated: 130,
        unallocated: 70,
        account_id: 'acc-1',
      },
      error: null,
    });
    const pmt = await livePaymentRpc(200);
    expect(pmt.status).toBe('partially_allocated');
    expect(pmt.unallocatedAmount).toBe(70);
  });

  it('surfaces RPC failure with server text (allocation math is server-side)', async () => {
    mockRpc({ data: null, error: { message: 'student is not enrolled' } });
    await expect(livePaymentRpc(100)).rejects.toThrow(/student is not enrolled/);
  });

  it('rejects fixture IDs before any DB call', async () => {
    mockRpc({ data: null, error: null });
    await expect(
      financeService.recordPayment({
        schoolId: SCHOOL,
        studentId: 'stud-x',
        amount: 100,
        paymentDate: '2026-09-05',
        paymentChannel: 'cash',
        paymentReference: 'X',
      })
    ).rejects.toThrow(/no pupil selected/);
    expect(rpcCalls).toEqual([]);
  });
});
