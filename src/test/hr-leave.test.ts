/**
 * SomaCampus Phase 7: HR Leave & Salary Advance Invariant Test Suite
 *
 * Verifies:
 * - Effective leave balance calculation with in-flight pending request deductions
 * - Working days calculation skipping weekends (Saturdays/Sundays) and public holidays
 * - Half-day leave shape constraint: single date with 0.5 working days
 * - Single open salary advance invariant (max 1 pending/active advance per employee)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildEffectiveLeaveBalances } from '../modules/hr/effectiveLeaveBalances';
import { hrService } from '../modules/hr/hrService';
import { LeaveType, LeaveEntitlement, LeaveRequest, PublicHoliday } from '../types/domain';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('../lib/financialAudit', () => ({
  writeFinancialAudit: vi.fn().mockResolvedValue({ id: 'audit-1' }),
}));

const LIVE_URL = 'https://test.supabase.co';
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
  b.upsert = vi.fn(() => b);
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
  mockFrom.mockImplementation((table: string) => builderFor(table));
  tableResponses = {};
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const stubLiveEnv = () => {
  vi.stubEnv('VITE_SUPABASE_URL', LIVE_URL);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
};

describe('HR Leave & Salary Advance Invariant Suite', () => {
  const mockLeaveTypes: LeaveType[] = [
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
    {
      id: 'lt-sick',
      schoolId: 'school-1',
      code: 'sick',
      name: 'Sick Leave',
      isPaid: true,
      defaultEntitlementDays: 30,
      requiresEvidence: true,
      color: '#dc2626',
      displayOrder: 2,
    },
  ];

  describe('Effective Leave Balances', () => {
    it('returns default entitlement when no explicit balance exists', () => {
      const balances = buildEffectiveLeaveBalances(mockLeaveTypes, [], []);
      const annual = balances.find((b) => b.code === 'annual');
      expect(annual?.entitledDays).toBe(21);
      expect(annual?.usedDays).toBe(0);
      expect(annual?.pendingDays).toBe(0);
      expect(annual?.availableDays).toBe(21);
      expect(annual?.isDefault).toBe(true);
    });

    it('subtracts used days and pending in-flight requests from available balance', () => {
      const entitlements: LeaveEntitlement[] = [
        {
          id: 'ent-1',
          schoolId: 'school-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-annual',
          leaveYear: 2026,
          entitledDays: 25, // employee-specific quota
          usedDays: 5,
        },
      ];

      const pendingRequests: LeaveRequest[] = [
        {
          id: 'req-1',
          schoolId: 'school-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-annual',
          startDate: '2026-09-10',
          endDate: '2026-09-12',
          workingDays: 3,
          dayPortion: 'full',
          reason: 'Family event',
          status: 'pending',
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
        {
          id: 'req-2',
          schoolId: 'school-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-annual',
          startDate: '2026-09-15',
          endDate: '2026-09-15',
          workingDays: 0.5,
          dayPortion: 'morning',
          reason: 'Morning medical visit',
          status: 'pending',
          createdAt: '2026-09-02T00:00:00Z',
          updatedAt: '2026-09-02T00:00:00Z',
        },
      ];

      const balances = buildEffectiveLeaveBalances(mockLeaveTypes, entitlements, pendingRequests);
      const annual = balances.find((b) => b.code === 'annual');

      expect(annual?.entitledDays).toBe(25);
      expect(annual?.usedDays).toBe(5);
      expect(annual?.pendingDays).toBe(3.5);
      // Available = 25 - 5 - 3.5 = 16.5
      expect(annual?.availableDays).toBe(16.5);
      expect(annual?.isDefault).toBe(false);
    });

    it('ignores rejected or withdrawn requests when computing pending days', () => {
      const requests: LeaveRequest[] = [
        {
          id: 'req-rej',
          schoolId: 'school-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-annual',
          startDate: '2026-09-10',
          endDate: '2026-09-12',
          workingDays: 3,
          dayPortion: 'full',
          reason: 'Trip',
          status: 'rejected',
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      ];

      const balances = buildEffectiveLeaveBalances(mockLeaveTypes, [], requests);
      const annual = balances.find((b) => b.code === 'annual');
      expect(annual?.pendingDays).toBe(0);
      expect(annual?.availableDays).toBe(21);
    });
  });

  describe('Working Days Calculation', () => {
    it('returns 0.5 for morning or afternoon half-day', () => {
      expect(hrService.calculateWorkingDays('2026-09-08', '2026-09-08', 'morning')).toBe(0.5);
      expect(hrService.calculateWorkingDays('2026-09-08', '2026-09-08', 'afternoon')).toBe(0.5);
    });

    it('excludes weekends when counting whole days across a date range', () => {
      // 2026-09-04 is Friday, 2026-09-07 is Monday.
      // Friday, Saturday, Sunday, Monday = 4 calendar days, but exactly 2 working days.
      const days = hrService.calculateWorkingDays('2026-09-04', '2026-09-07', 'full');
      expect(days).toBe(2);
    });

    it('excludes Uganda Independence Day public holiday when passed explicitly (2026-10-09 is Friday)', () => {
      // 2026-10-08 (Thursday) to 2026-10-09 (Friday)
      // Normally 2 days, but 10-09 is a passed-in holiday, so only 1 working day.
      const holidays: PublicHoliday[] = [
        { id: 'hol-1', holidayDate: '2026-10-09', name: 'Uganda Independence Day', isActive: true },
      ];
      const days = hrService.calculateWorkingDays('2026-10-08', '2026-10-09', 'full', holidays);
      expect(days).toBe(1);
    });

    it('defaults to weekends-only computation when no holidays are passed (no mock defaults)', () => {
      // 2026-10-08 (Thursday) to 2026-10-09 (Friday): both weekdays -> 2 days.
      const days = hrService.calculateWorkingDays('2026-10-08', '2026-10-09', 'full');
      expect(days).toBe(2);
    });
  });

  describe('Half-Day Leave Shape Invariant', () => {
    it('rejects half-day requests spanning multiple dates', async () => {
      await expect(
        hrService.submitLeaveRequest({
          schoolId: 'school-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-annual',
          startDate: '2026-09-10',
          endDate: '2026-09-11',
          dayPortion: 'morning',
          reason: 'Spanning multiple days with half-day flag',
        })
      ).rejects.toThrow('A half-day leave request must be on a single date.');
    });

    it('mock env: writes throw instead of mutating in-memory fakes', async () => {
      await expect(
        hrService.submitLeaveRequest({
          schoolId: 'school-1',
          employeeId: 'emp-new',
          leaveTypeId: 'lt-annual',
          startDate: '2026-09-22',
          endDate: '2026-09-22',
          dayPortion: 'morning',
          reason: 'Dentist appointment',
        })
      ).rejects.toThrow(/mock environment/);
    });

    it('live: accepts valid half-day request on a single date (holidays fetched, throw on DB error)', async () => {
      stubLiveEnv();
      tableResponses.public_holidays = { data: [], error: null };
      tableResponses.leave_types = {
        data: [
          {
            id: 'lt-annual',
            school_id: 'school-1',
            code: 'annual',
            name: 'Annual Leave',
            is_paid: true,
            default_entitlement_days: 21,
            requires_evidence: false,
            color: '#059669',
            display_order: 1,
          },
        ],
        error: null,
      };
      const req = await hrService.submitLeaveRequest({
        schoolId: 'school-1',
        employeeId: 'emp-new',
        leaveTypeId: 'lt-annual',
        startDate: '2026-09-22',
        endDate: '2026-09-22',
        dayPortion: 'morning',
        reason: 'Dentist appointment',
      });

      expect(req.workingDays).toBe(0.5);
      expect(req.dayPortion).toBe('morning');
      expect(req.status).toBe('pending');
    });

    it('live: holiday-table DB error throws (never fail-open)', async () => {
      stubLiveEnv();
      tableResponses.public_holidays = { data: null, error: new Error('DB down') };
      await expect(
        hrService.submitLeaveRequest({
          schoolId: 'school-1',
          employeeId: 'emp-new',
          leaveTypeId: 'lt-annual',
          startDate: '2026-09-22',
          endDate: '2026-09-23',
          dayPortion: 'full',
          reason: 'Two days',
        })
      ).rejects.toThrow();
    });
  });

  describe('Mock-env read honesty', () => {
    it('reads resolve to empty (no seeded fakes)', async () => {
      await expect(hrService.getLeaveTypes('school-1')).resolves.toEqual([]);
      await expect(hrService.getSchoolHolidays('school-1')).resolves.toEqual([]);
      await expect(hrService.getMyLeaveRequests('emp-1', 'school-1')).resolves.toEqual([]);
      await expect(hrService.getMyAdvances('emp-1', 'school-1')).resolves.toEqual([]);
      await expect(
        hrService.getPendingApprovals('school-1')
      ).resolves.toEqual({ leaveRequests: [], advances: [] });
      await expect(hrService.getEffectiveBalances('school-1', 'emp-1')).resolves.toEqual([]);
      await expect(hrService.getEmployeePayrollProfiles('school-1')).resolves.toEqual([]);
    });

    it('writes throw in mock env (no fake writes)', async () => {
      await expect(
        hrService.submitAdvanceRequest({
          schoolId: 'school-1',
          employeeId: 'emp-fresh',
          amount: 300000,
          numInstalments: 2,
          reason: 'Urgent',
        })
      ).rejects.toThrow(/mock environment/);
      await expect(hrService.decideLeaveRequest('req-1', 'approved')).rejects.toThrow(/mock environment/);
      await expect(hrService.decideAdvanceRequest('adv-1', 'active')).rejects.toThrow(/mock environment/);
      await expect(
        hrService.saveLeaveType({ schoolId: 'school-1', name: 'X', code: 'x' })
      ).rejects.toThrow(/mock environment/);
      await expect(
        hrService.upsertPayrollProfile({ schoolId: 'school-1', employeeId: 'emp-1', baseSalary: 100 })
      ).rejects.toThrow(/mock environment/);
      await expect(
        hrService.upsertLeaveEntitlement({
          schoolId: 'school-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-annual',
          entitledDays: 5,
        })
      ).rejects.toThrow(/mock environment/);
    });
  });

  describe('Single Open Salary Advance Invariant', () => {
    it('live: enforces that an employee with an active advance cannot request a second concurrent advance', async () => {
      stubLiveEnv();
      tableResponses.staff_advances = {
        data: [
          {
            id: 'adv-1',
            school_id: 'school-1',
            employee_id: 'emp-teacher-1',
            amount: 500000,
            balance_remaining: 333334,
            monthly_deduction: 166666,
            num_instalments: 3,
            reason: 'Medical treatment deposit',
            status: 'active',
            created_at: '2026-08-10T14:00:00Z',
            updated_at: '2026-08-28T16:00:00Z',
          },
        ],
        error: null,
      };
      await expect(
        hrService.submitAdvanceRequest({
          schoolId: 'school-1',
          employeeId: 'emp-teacher-1',
          amount: 300000,
          numInstalments: 2,
          reason: 'Another urgent advance',
        })
      ).rejects.toThrow(/Policy Invariant Violation: You already have an active or pending salary advance/);
    });

    it('live: permits an employee with no open advance to submit one', async () => {
      stubLiveEnv();
      tableResponses.staff_advances = { data: [], error: null };
      const adv = await hrService.submitAdvanceRequest({
        schoolId: 'school-1',
        employeeId: 'emp-bursar-1',
        amount: 600000,
        numInstalments: 3,
        reason: 'Emergency house repair',
      });

      expect(adv.amount).toBe(600000);
      expect(adv.monthlyDeduction).toBe(200000);
      expect(adv.status).toBe('pending');
    });
  });
});
