/**
 * Slice 2 Task 2C — HR Approvals & Invariant Bug Fixes Test Suite
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hrService } from '../modules/hr/hrService';
import { buildEffectiveLeaveBalances } from '../modules/hr/effectiveLeaveBalances';
import { LeaveType, LeaveEntitlement, LeaveRequest } from '../types/domain';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('../lib/financialAudit', () => ({
  writeFinancialAudit: vi.fn().mockResolvedValue({ id: 'audit-1' }),
}));

import { writeFinancialAudit } from '../lib/financialAudit';

describe('HR Approvals & Carried Bug Fixes (Slice 2)', () => {
  let tableResponses: Record<string, unknown> = {};

  const builderFor = (table: string) => {
    let lastInserted: unknown = null;
    const respond = () => {
      const r = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.is = vi.fn(() => b);
    b.or = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.insert = vi.fn((row: unknown) => {
      lastInserted = row;
      return b;
    });
    b.update = vi.fn(() => b);
    b.single = vi.fn(() => {
      // Mirror Supabase insert→select→single semantics: an insert in this
      // chain echoes the inserted row.
      if (lastInserted) {
        return Promise.resolve({ data: lastInserted, error: null });
      }
      const r = tableResponses[table] as { data?: unknown; error?: unknown } | undefined;
      if (Array.isArray(r?.data)) {
        return Promise.resolve({ data: r.data[0] ?? null, error: r.error ?? null });
      }
      return respond();
    });
    b.maybeSingle = vi.fn(() => (b.single as ReturnType<typeof vi.fn>)());
    (b as { then: unknown }).then = (res: unknown, rej: unknown) =>
      respond().then(res as never, rej as never);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    mockRpc.mockResolvedValue({ data: null, error: null });
    tableResponses = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('(1) getPendingApprovals queries role/department (no phantom job_title) and maps employee names', async () => {
    tableResponses.leave_requests = {
      data: [
        {
          id: 'req-1',
          school_id: 'school-1',
          employee_id: 'emp-1',
          leave_type_id: 'lt-1',
          start_date: '2026-10-01',
          end_date: '2026-10-02',
          working_days: 2,
          day_portion: 'full',
          reason: 'Doctor appointment',
          status: 'pending',
          leave_type: { name: 'Sick Leave' },
          employee: {
            role: 'teacher',
            department: 'Science',
            person: { first_name: 'David', last_name: 'Otim' },
          },
        },
      ],
      error: null,
    };

    tableResponses.staff_advances = {
      data: [
        {
          id: 'adv-1',
          school_id: 'school-1',
          employee_id: 'emp-1',
          amount: 400000,
          num_instalments: 2,
          monthly_deduction: 200000,
          reason: 'Emergency repair',
          status: 'pending',
          employee: {
            role: 'teacher',
            department: 'Science',
            person: { first_name: 'David', last_name: 'Otim' },
          },
        },
      ],
      error: null,
    };

    const pending = await hrService.getPendingApprovals('school-1');
    expect(pending.leaveRequests).toHaveLength(1);
    expect(pending.leaveRequests[0].employeeName).toBe('David Otim');
    expect(pending.leaveRequests[0].leaveTypeName).toBe('Sick Leave');
    expect(pending.advances).toHaveLength(1);
    expect(pending.advances[0].employeeName).toBe('David Otim');
    expect(mockFrom).toHaveBeenCalledWith('leave_requests');
    expect(mockFrom).toHaveBeenCalledWith('staff_advances');
  });

  it('(2) decideLeaveRequest updates status, records decided_by and decided_at, and logs financial audit', async () => {
    tableResponses.leave_requests = {
      data: { id: 'req-1', school_id: 'school-1', status: 'pending' },
      error: null,
    };

    const ok = await hrService.decideLeaveRequest('req-1', 'approved', 'All classes covered', 'principal-uid');
    expect(ok).toBe(true);
    expect(writeFinancialAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        entityType: 'leave_request',
        entityId: 'req-1',
        action: 'approved',
        newData: expect.objectContaining({
          status: 'approved',
          decided_by: 'principal-uid',
        }),
      })
    );
  });

  it('(3) decideLeaveRequest prevents re-deciding an already finalized request', async () => {
    tableResponses.leave_requests = {
      data: { id: 'req-1', school_id: 'school-1', status: 'approved' },
      error: null,
    };

    await expect(
      hrService.decideLeaveRequest('req-1', 'rejected', 'Changed my mind', 'principal-uid')
    ).rejects.toThrow(/already been decided/i);
  });

  it('(4) decideAdvanceRequest updates status, records decided_by, and blocks re-decisions', async () => {
    tableResponses.staff_advances = {
      data: { id: 'adv-1', school_id: 'school-1', status: 'pending' },
      error: null,
    };

    const ok = await hrService.decideAdvanceRequest('adv-1', 'active', 'Approved per policy', 'principal-uid');
    expect(ok).toBe(true);
    expect(writeFinancialAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'staff_advance',
        entityId: 'adv-1',
        action: 'active',
        newData: expect.objectContaining({
          status: 'active',
          decided_by: 'principal-uid',
        }),
      })
    );

    // Block re-decision
    tableResponses.staff_advances = {
      data: { id: 'adv-1', school_id: 'school-1', status: 'active' },
      error: null,
    };
    await expect(
      hrService.decideAdvanceRequest('adv-1', 'rejected', 'Revoking', 'principal-uid')
    ).rejects.toThrow(/already been decided/i);
  });

  it('(5) submitAdvanceRequest enforces the 50% salary cap', async () => {
    tableResponses.staff_advances = {
      data: [],
      error: null,
    };

    // Base salary 2,000,000 -> 50% cap is 1,000,000
    // Requesting 1,200,000 must throw Policy Invariant Violation
    await expect(
      hrService.submitAdvanceRequest({
        schoolId: 'school-1',
        employeeId: 'emp-1',
        amount: 1200000,
        numInstalments: 3,
        reason: 'Large advance',
        baseSalary: 2000000,
      })
    ).rejects.toThrow(/Policy Invariant Violation.*50% monthly salary cap/i);

    // Requesting 900,000 is under the cap and must proceed to insert
    tableResponses.staff_advances = {
      data: [],
      error: null,
    };
    await expect(
      hrService.submitAdvanceRequest({
        schoolId: 'school-1',
        employeeId: 'emp-1',
        amount: 900000,
        numInstalments: 3,
        reason: 'Valid advance',
        baseSalary: 2000000,
      })
    ).resolves.toBeDefined();
  });

  it('(6) buildEffectiveLeaveBalances counts approved requests toward usedDays', () => {
    const leaveTypes: LeaveType[] = [
      {
        id: 'lt-annual',
        schoolId: 'school-1',
        code: 'annual',
        name: 'Annual Leave',
        isPaid: true,
        defaultEntitlementDays: 21,
        requiresEvidence: false,
        color: '#059669',
        displayOrder: 1,
      },
    ];

    const entitlements: LeaveEntitlement[] = [
      {
        id: 'ent-1',
        schoolId: 'school-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-annual',
        leaveYear: 2026,
        entitledDays: 21,
        usedDays: 0,
      },
    ];

    const requests: LeaveRequest[] = [
      {
        id: 'req-approved',
        schoolId: 'school-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-annual',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        workingDays: 3,
        dayPortion: 'full',
        reason: 'Vacation',
        status: 'approved',
        createdAt: '2026-08-15T00:00:00Z',
        updatedAt: '2026-08-20T00:00:00Z',
      },
      {
        id: 'req-pending',
        schoolId: 'school-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-annual',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        workingDays: 2,
        dayPortion: 'full',
        reason: 'Rest',
        status: 'pending',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const balances = buildEffectiveLeaveBalances(leaveTypes, entitlements, requests);
    const annual = balances.find((b) => b.code === 'annual')!;

    expect(annual.entitledDays).toBe(21);
    expect(annual.usedDays).toBe(3); // from approved request
    expect(annual.pendingDays).toBe(2); // from pending request
    expect(annual.availableDays).toBe(16); // 21 - 3 - 2 = 16
  });
});
