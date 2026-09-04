/**
 * SomaCampus Phase 7: HR Leave & Salary Advance Invariant Test Suite
 *
 * Verifies:
 * - Effective leave balance calculation with in-flight pending request deductions
 * - Working days calculation skipping weekends (Saturdays/Sundays) and public holidays
 * - Half-day leave shape constraint: single date with 0.5 working days
 * - Single open salary advance invariant (max 1 pending/active advance per employee)
 */

import { describe, it, expect } from 'vitest';
import { buildEffectiveLeaveBalances } from '../modules/hr/effectiveLeaveBalances';
import { hrService } from '../modules/hr/hrService';
import { LeaveType, LeaveEntitlement, LeaveRequest } from '../types/domain';

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

    it('excludes Uganda Independence Day public holiday (2026-10-09 is Friday)', () => {
      // 2026-10-08 (Thursday) to 2026-10-09 (Friday)
      // Normally 2 days, but 10-09 is a seeded holiday, so only 1 working day.
      const days = hrService.calculateWorkingDays('2026-10-08', '2026-10-09', 'full');
      expect(days).toBe(1);
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

    it('accepts valid half-day request on a single date', async () => {
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
  });

  describe('Single Open Salary Advance Invariant', () => {
    it('enforces that an employee with an active advance cannot request a second concurrent advance', async () => {
      // emp-teacher-1 already has an active advance in mockAdvances
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

    it('permits an employee with no open advance to submit one', async () => {
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
