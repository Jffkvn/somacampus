/**
 * Fee payment atomic RPC + expense category fail-closed contracts.
 *
 * - recordPayment live path calls record_fee_payment RPC once (no client
 *   waterfall), maps the JSONB result, and fails closed on fixture IDs.
 * - recordExpense rejects non-UUID categories (no silent fixture fallback).
 * - createCategory inserts school-scoped rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

import { financeService } from '../modules/finance/financeService';
import { expenseService } from '../modules/expenses/expenseService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}
function restoreEnv() {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
}

const SCHOOL = '22222222-2222-2222-2222-222222222222';
const STUDENT = '767d2e4a-6fec-47f0-a1d2-2cc50ec29771';

function chain(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    insert: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
}

describe('record_fee_payment RPC contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forceProductionEnv();
  });
  afterEach(() => {
    restoreEnv();
  });

  it('calls the atomic RPC once with school/student/amount payload', async () => {
    mockRpc.mockResolvedValue({
      data: {
        payment_id: 'pmt-1',
        receipt_number: 'RCP-20260910-abc123',
        status: 'fully_allocated',
        allocated: 800000,
        unallocated: 0,
        account_id: 'acc-1',
      },
      error: null,
    });
    const pmt = await financeService.recordPayment({
      schoolId: SCHOOL,
      studentId: STUDENT,
      amount: 800000,
      paymentDate: '2026-09-10',
      paymentChannel: 'bank_transfer',
      paymentReference: 'REF-1',
      payerName: 'Joseph Namukasa',
      payerPhone: '+256782334455',
      notes: 'Term 1',
    });
    expect(mockRpc).toHaveBeenCalledWith(
      'record_fee_payment',
      expect.objectContaining({
        p_school_id: SCHOOL,
        p_student_id: STUDENT,
        p_amount: 800000,
      })
    );
    expect(mockFrom).not.toHaveBeenCalled();
    expect(pmt.receiptNumber).toBe('RCP-20260910-abc123');
    expect(pmt.status).toBe('fully_allocated');
    expect(pmt.unallocatedAmount).toBe(0);
  });

  it('rejects fixture student IDs fail-closed (never sends stud-aurora to DB)', async () => {
    await expect(
      financeService.recordPayment({
        schoolId: SCHOOL,
        studentId: 'stud-aurora',
        amount: 800000,
        paymentDate: '2026-09-10',
        paymentChannel: 'bank_transfer',
        paymentReference: 'REF-1',
      })
    ).rejects.toThrow(/no pupil selected/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects non-UUID school IDs fail-closed', async () => {
    await expect(
      financeService.recordPayment({
        schoolId: 'school-default',
        studentId: STUDENT,
        amount: 800000,
        paymentDate: '2026-09-10',
        paymentChannel: 'bank_transfer',
        paymentReference: 'REF-1',
      })
    ).rejects.toThrow(/no school selected/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('surfaces RPC errors with cause text (no silent swallow)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'student is not enrolled' } });
    await expect(
      financeService.recordPayment({
        schoolId: SCHOOL,
        studentId: STUDENT,
        amount: 800000,
        paymentDate: '2026-09-10',
        paymentChannel: 'bank_transfer',
        paymentReference: 'REF-1',
      })
    ).rejects.toThrow(/student is not enrolled/);
  });
});

describe('expense category fail-closed contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forceProductionEnv();
  });
  afterEach(() => {
    restoreEnv();
  });

  it('recordExpense rejects empty category (never substitutes fixture UUID)', async () => {
    await expect(
      expenseService.recordExpense({
        schoolId: SCHOOL,
        categoryId: '',
        amount: 150000,
        spentOn: '2026-09-10',
        paymentChannel: 'mobile_money',
        recipientPayee: 'NWSC',
        description: 'Water Bill',
      })
    ).rejects.toThrow(/no expense category selected/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('createCategory inserts school-scoped rows', async () => {
    mockFrom.mockReturnValue(
      chain({ id: 'cat-1', school_id: SCHOOL, name: 'Water', code: 'WATER', created_at: '2026-01-01' })
    );
    const created = await expenseService.createCategory({ schoolId: SCHOOL, name: 'Water' });
    expect(mockFrom).toHaveBeenCalledWith('school_expense_categories');
    expect(created.id).toBe('cat-1');
    expect(created.code).toBe('WATER');
  });

  it('createCategory requires a name and a real school', async () => {
    await expect(expenseService.createCategory({ schoolId: SCHOOL, name: '  ' })).rejects.toThrow(
      /name is required/
    );
    await expect(expenseService.createCategory({ schoolId: 'x', name: 'Water' })).rejects.toThrow(
      /no school selected/
    );
  });
});
