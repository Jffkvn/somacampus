import { describe, it, expect } from 'vitest';

/**
 * Phase 9 Governance INTENT MODEL Suite (NOT live-DB proof).
 *
 * These tests assert governance INTENT using local JS helper models only —
 * they never touch Postgres and therefore do NOT verify live RLS policies,
 * triggers, or RPC security. Real RLS verification lives in the live probes
 * (scripts/inspect-*-live.ts and *-live.test.ts suites against a live database).
 *
 * Intent models covered:
 * 1. Multi-tenant isolation for official teaching subjects and allocations.
 * 2. Teacher financial firewall: Teachers cannot query student financial balances or peer compensation rules.
 * 3. Teaching allocation approval authorization (leadership only; teachers rejected).
 * 4. Timetable approval atomic guard: Rejects approval if hard constraint violations > 0.
 * 5. Online offer acceptance authorization: Only student, parent, or admissions can accept.
 * 6. Online booking atomic confirmation: Validates offering assignment.
 * 7. Sessional compensation resolution: Queries historical effective date, not CURRENT_DATE.
 */

describe('Phase 9 Governance INTENT (not live-DB proof)', () => {
  const schoolA = 'sch-uganda-001';
  const schoolB = 'sch-kenya-002';

  describe('1. Multi-Tenant Isolation & Cross-Tenant FK Integrity', () => {
    interface DbRow {
      id: string;
      school_id: string;
      [key: string]: any;
    }

    // Model database RLS filter
    function queryWithTenantContext<T extends DbRow>(
      tableData: T[],
      callerSchoolId: string,
    ): T[] {
      return tableData.filter((row) => row.school_id === callerSchoolId);
    }

    // Model DB trigger: check_teaching_allocation_tenant_integrity
    function validateAllocationCrossTenant(
      allocation: DbRow,
      classRow: DbRow,
      subjectRow: DbRow,
      teacherRow: DbRow,
    ) {
      if (classRow.school_id !== allocation.school_id) {
        throw new Error('Cross-tenant violation: class belongs to different school');
      }
      if (subjectRow.school_id !== allocation.school_id) {
        throw new Error('Cross-tenant violation: subject belongs to different school');
      }
      if (teacherRow.school_id !== allocation.school_id) {
        throw new Error('Cross-tenant violation: teacher belongs to different school');
      }
      return true;
    }

    it('isolates official teaching subjects and allocations by school_id', () => {
      const allAllocations: DbRow[] = [
        { id: 'alloc-1', school_id: schoolA, class_id: 'cls-1', teacher_id: 't-1' },
        { id: 'alloc-2', school_id: schoolA, class_id: 'cls-2', teacher_id: 't-2' },
        { id: 'alloc-3', school_id: schoolB, class_id: 'cls-3', teacher_id: 't-3' },
      ];

      const schoolAResults = queryWithTenantContext(allAllocations, schoolA);
      expect(schoolAResults).toHaveLength(2);
      expect(schoolAResults.every((r) => r.school_id === schoolA)).toBe(true);

      const schoolBResults = queryWithTenantContext(allAllocations, schoolB);
      expect(schoolBResults).toHaveLength(1);
      expect(schoolBResults[0].id).toBe('alloc-3');
    });

    it('rejects cross-tenant references in teaching allocations', () => {
      const allocInSchoolA = { id: 'alloc-x', school_id: schoolA };
      const classInSchoolA = { id: 'cls-1', school_id: schoolA };
      const subjectInSchoolA = { id: 'sub-1', school_id: schoolA };
      const teacherInSchoolB = { id: 't-2', school_id: schoolB }; // Foreign school!

      expect(() =>
        validateAllocationCrossTenant(
          allocInSchoolA,
          classInSchoolA,
          subjectInSchoolA,
          teacherInSchoolB,
        ),
      ).toThrow(/Cross-tenant violation: teacher belongs to different school/);
    });
  });

  describe('2. Teacher Financial Firewall Invariant', () => {
    type UserRole = 'admin' | 'principal' | 'bursar' | 'teacher' | 'parent';

    interface UserContext {
      userId: string;
      employeeId?: string;
      role: UserRole;
      schoolId: string;
    }

    interface StudentFeeAccount {
      studentId: string;
      schoolId: string;
      totalBilled: number;
      totalPaid: number;
      outstandingBalance: number;
    }

    function queryStudentFees(
      accounts: StudentFeeAccount[],
      user: UserContext,
    ): StudentFeeAccount[] {
      // RLS Policy: Only administrative/financial roles can view fee balances
      const allowedRoles: UserRole[] = ['admin', 'principal', 'bursar'];
      if (!allowedRoles.includes(user.role)) {
        return []; // Teachers receive 0 rows
      }
      return accounts.filter((a) => a.schoolId === user.schoolId);
    }

    it('firewalls teachers from accessing student fee accounts and arrears', () => {
      const accounts: StudentFeeAccount[] = [
        { studentId: 'stu-1', schoolId: schoolA, totalBilled: 1500000, totalPaid: 500000, outstandingBalance: 1000000 },
        { studentId: 'stu-2', schoolId: schoolA, totalBilled: 1500000, totalPaid: 1500000, outstandingBalance: 0 },
      ];

      const teacherUser: UserContext = {
        userId: 'usr-teacher-1',
        employeeId: 'emp-1',
        role: 'teacher',
        schoolId: schoolA,
      };

      const principalUser: UserContext = {
        userId: 'usr-principal-1',
        employeeId: 'emp-admin',
        role: 'principal',
        schoolId: schoolA,
      };

      // Teacher receives ZERO financial records
      const teacherView = queryStudentFees(accounts, teacherUser);
      expect(teacherView).toHaveLength(0);

      // Principal receives all records
      const principalView = queryStudentFees(accounts, principalUser);
      expect(principalView).toHaveLength(2);
    });
  });

  describe('3. Teaching Allocation & Timetable Approval Authorization', () => {
    function approveTeachingAllocationsRpc(
      allocationIds: string[],
      callerRole: string,
      hasQualifications: boolean,
    ) {
      const authorizedRoles = ['admin', 'principal', 'director'];
      if (!authorizedRoles.includes(callerRole)) {
        throw new Error('Permission denied: Only school leadership can approve teaching allocations.');
      }
      if (!hasQualifications) {
        throw new Error('Validation failed: Some allocations reference unqualified teachers.');
      }
      return {
        success: true,
        approvedCount: allocationIds.length,
      };
    }

    it('permits school leadership to approve allocations and rejects teachers', () => {
      // Leadership approval succeeds
      const res = approveTeachingAllocationsRpc(['alloc-1', 'alloc-2'], 'principal', true);
      expect(res.success).toBe(true);
      expect(res.approvedCount).toBe(2);

      // Teacher attempt is blocked by RLS/RPC security
      expect(() =>
        approveTeachingAllocationsRpc(['alloc-1'], 'teacher', true),
      ).toThrow(/Only school leadership can approve teaching allocations/);
    });

    it('rejects timetable approval when hard constraint violations exist', () => {
      function approveTimetableRpc(
        _timetableId: string,
        callerRole: string,
        hardViolationsCount: number,
      ) {
        const authorizedRoles = ['admin', 'principal', 'director'];
        if (!authorizedRoles.includes(callerRole)) {
          throw new Error('Permission denied: Only school leadership can approve timetables.');
        }
        if (hardViolationsCount > 0) {
          throw new Error(`Cannot approve timetable with ${hardViolationsCount} hard constraint violations.`);
        }
        return { success: true, status: 'approved' };
      }

      // Compliant timetable approves
      const ok = approveTimetableRpc('tt-1', 'principal', 0);
      expect(ok.status).toBe('approved');

      // Violating timetable is blocked
      expect(() =>
        approveTimetableRpc('tt-2', 'principal', 2),
      ).toThrow(/Cannot approve timetable with 2 hard constraint violations/);
    });
  });

  describe('4. Online Offer & Booking Atomic Guards', () => {
    function acceptOnlineOfferRpc(params: {
      offerId: string;
      callerUserId: string;
      studentUserId: string;
      parentUserIds: string[];
      isSchoolStaff: boolean;
      status: string;
    }) {
      if (params.status !== 'OFFERED') {
        throw new Error(`Offer cannot be accepted from status: ${params.status}`);
      }

      const isAuthorized =
        params.callerUserId === params.studentUserId ||
        params.parentUserIds.includes(params.callerUserId) ||
        params.isSchoolStaff;

      if (!isAuthorized) {
        throw new Error('Unauthorized: You cannot accept an offer for this learner.');
      }

      return { success: true, status: 'ACCEPTED' };
    }

    it('authorizes student or their registered parent to accept online offer, blocking unrelated users', () => {
      const offer = {
        offerId: 'off-1',
        studentUserId: 'usr-student-alex',
        parentUserIds: ['usr-parent-john'],
        status: 'OFFERED',
      };

      // 1. Alex accepts own offer -> OK
      const r1 = acceptOnlineOfferRpc({
        ...offer,
        callerUserId: 'usr-student-alex',
        isSchoolStaff: false,
      });
      expect(r1.status).toBe('ACCEPTED');

      // 2. Parent accepts -> OK
      const r2 = acceptOnlineOfferRpc({
        ...offer,
        callerUserId: 'usr-parent-john',
        isSchoolStaff: false,
      });
      expect(r2.status).toBe('ACCEPTED');

      // 3. Unrelated parent/user -> REJECTED
      expect(() =>
        acceptOnlineOfferRpc({
          ...offer,
          callerUserId: 'usr-unrelated-stranger',
          isSchoolStaff: false,
        }),
      ).toThrow(/Unauthorized: You cannot accept an offer for this learner/);
    });

    it('enforces that confirmed online booking matches teacher offering assignment', () => {
      function confirmOnlineBookingRpc(params: {
        bookingOfferingId: string;
        teacherOfferingIds: string[];
      }) {
        if (!params.teacherOfferingIds.includes(params.bookingOfferingId)) {
          throw new Error('Teacher is not assigned to this online offering.');
        }
        return { success: true, status: 'confirmed' };
      }

      const assigned = confirmOnlineBookingRpc({
        bookingOfferingId: 'offering-cambridge-math',
        teacherOfferingIds: ['offering-cambridge-math', 'offering-cambridge-sci'],
      });
      expect(assigned.status).toBe('confirmed');

      expect(() =>
        confirmOnlineBookingRpc({
          bookingOfferingId: 'offering-french',
          teacherOfferingIds: ['offering-cambridge-math'],
        }),
      ).toThrow(/Teacher is not assigned to this online offering/);
    });
  });

  describe('5. Historical Payroll Rate Resolution Invariant', () => {
    it('queries compensation rates strictly against session date, preventing retrospective distortion', () => {
      interface RateRule {
        id: string;
        model: string;
        amount: number;
        effectiveFrom: string;
        effectiveTo: string | null;
      }

      const rateHistory: RateRule[] = [
        { id: 'r1', model: 'per_session', amount: 35000, effectiveFrom: '2025-09-01', effectiveTo: '2026-02-28' },
        { id: 'r2', model: 'per_session', amount: 45000, effectiveFrom: '2026-03-01', effectiveTo: null },
      ];

      function resolveRateForSession(sessionDate: string): number {
        const rule = rateHistory.find(
          (r) =>
            r.effectiveFrom <= sessionDate &&
            (r.effectiveTo === null || r.effectiveTo >= sessionDate),
        );
        if (!rule) throw new Error('No active compensation rule found');
        return rule.amount;
      }

      // Session held on 2026-01-20
      const janRate = resolveRateForSession('2026-01-20');
      expect(janRate).toBe(35000);

      // Session held on 2026-05-15
      const mayRate = resolveRateForSession('2026-05-15');
      expect(mayRate).toBe(45000);
    });
  });
});
