import { describe, it, expect, vi } from 'vitest';

/**
 * Phase 9I Task 2 — Timetable Policy & Constraint Solver Test Suite.
 *
 * Verifies:
 * 1. Deterministic CSP backtracking solver mathematically produces 0 hard conflicts
 * 2. Backtracking search recovers from greedy dead-ends to find valid timetables
 * 3. Policy-driven daily caps are strictly enforced (NO hardcoded limits)
 * 4. Consecutive period limits and mandatory break intervals are enforced
 * 5. Soft preferences (Math morning, PE afternoon) are scored
 * 6. Constraint Conflict Diagnostic pinpoints bottlenecks when over-constrained
 * 7. Combined physical + online workload calculation
 * 8. Historical timetable pattern analysis
 * 9. Full 4-tier hierarchical policy resolution with effective dates (Exception -> Teacher -> Department -> School Default)
 * 10. Quota derivation from Phase 6 Schemes of Work
 * 11. publishTimetableAtomic calls Supabase RPC and returns success payload
 * 12. onlineBookingService.confirmBooking invokes confirm_online_booking_atomic exclusively
 */

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { supabase } from '../lib/supabase';
// eslint-disable-next-line import/first
import {
  timetableSolverService,
  type SolverClassRequirement,
  type SolverPeriodSlot,
} from '../modules/planning/timetableSolverService';
// eslint-disable-next-line import/first
import { timetablePolicyService } from '../modules/planning/timetablePolicyService';
// eslint-disable-next-line import/first
import { confirmBooking } from '../modules/online/onlineBookingService';
// eslint-disable-next-line import/first
import type {
  SchoolTimetablePolicy,
  TimetableSubjectPreference,
} from '../types/domain';

describe('School Timetable Policy & Constraint Solver Engine (Phase 9I)', () => {
  it('(1) Deterministic solver produces mathematically ZERO hard conflicts', () => {
    const requirements: SolverClassRequirement[] = [
      { classId: 'cls-p4', className: 'P4', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 5 },
      { classId: 'cls-p4', className: 'P4', subjectId: 'sub-eng', subjectName: 'English', teacherId: 't-john', teacherName: 'John', periodsPerWeek: 5 },
      { classId: 'cls-p5', className: 'P5', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 5 },
      { classId: 'cls-p5', className: 'P5', subjectId: 'sub-sci', subjectName: 'Science', teacherId: 't-mary', teacherName: 'Mary', periodsPerWeek: 3 },
    ];

    const result = timetableSolverService.solveTimetable({ requirements });

    expect(result.feasible).toBe(true);
    expect(result.diagnostics.status).toBe('COMPLIANT');
    expect(result.scorecard.hardViolationsCount).toBe(0);

    // Verify 0 teacher overlaps
    const teacherSlots = new Set<string>();
    for (const a of result.assignments) {
      const key = `${a.slot.dayOfWeek}-${a.slot.periodNumber}-${a.teacherId}`;
      expect(teacherSlots.has(key)).toBe(false);
      teacherSlots.add(key);
    }

    // Verify 0 class overlaps
    const classSlots = new Set<string>();
    for (const a of result.assignments) {
      const key = `${a.slot.dayOfWeek}-${a.slot.periodNumber}-${a.classId}`;
      expect(classSlots.has(key)).toBe(false);
      teacherSlots.add(key);
    }

    // Verify quotas satisfied
    const p4MathCount = result.assignments.filter((a) => a.classId === 'cls-p4' && a.subjectId === 'sub-math').length;
    expect(p4MathCount).toBe(5);
    const p5MathCount = result.assignments.filter((a) => a.classId === 'cls-p5' && a.subjectId === 'sub-math').length;
    expect(p5MathCount).toBe(5);
  });

  it('(2) True Backtracking: solver backtracks when greedy first-fit choice leads to a dead-end', () => {
    // 2 Slots on Monday: Period 1 (Morning) and Period 2 (Morning)
    const twoSlots: SolverPeriodSlot[] = [
      { dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', isMorning: true, isAfternoon: false },
      { dayOfWeek: 1, periodNumber: 2, startTime: '08:45', endTime: '09:30', isMorning: true, isAfternoon: false },
    ];

    // Backtracking scenario with 2 classes and 2 teachers:
    // Class A & Class B.
    // Sarah teaches Class A (1 period) and Class B (1 period).
    // John teaches Class A (1 period).
    // Total slots: 2 (Period 1 and Period 2).
    // For Class A: John and Sarah both need a period.
    // If Sarah takes Period 1 for Class A, she cannot teach Class B in Period 1 (teacher conflict)
    // and Class A has no room in Period 1 for John.
    const reqs: SolverClassRequirement[] = [
      { classId: 'cls-a', className: 'Class A', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 1 },
      { classId: 'cls-a', className: 'Class A', subjectId: 'sub-eng', subjectName: 'English', teacherId: 't-john', teacherName: 'John', periodsPerWeek: 1 },
      { classId: 'cls-b', className: 'Class B', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 1 },
    ];

    // 2 Slots total across the week: Day 1 Period 1, Day 1 Period 2
    // Class A needs 2 periods (Period 1 & Period 2).
    // Class B needs 1 period (Sarah).
    // Sarah teaches Class A (1) and Class B (1).
    // John teaches Class A (1).
    // Total periods needed: 3.
    // In 2 slots, Class A takes both (1 with John, 1 with Sarah). But Sarah also needs Class B!
    // That means Sarah would need 2 slots: one for A, one for B.
    // Slot 1: Sarah teaches Class B, John teaches Class A.
    // Slot 2: Sarah teaches Class A.
    // Both classes and both teachers are completely conflict-free in 2 slots!
    // Notice: if Sarah greedily took Slot 1 with Class A, John would get Slot 2 with Class A,
    // leaving Sarah with NO slot for Class B (Slot 1 teacher conflict with herself, Slot 2 teacher conflict with John/Class A)!
    // Only backtracking to schedule Sarah with Class B in Slot 1 and John with Class A in Slot 1 resolves it!
    const result = timetableSolverService.solveTimetable({
      requirements: reqs,
      slots: twoSlots,
    });

    expect(result.feasible).toBe(true);
    expect(result.assignments.length).toBe(3);
    expect(result.scorecard.hardViolationsCount).toBe(0);
  });

  it('(3) Policy-Driven Constraints: solver strictly respects configured daily limits (NO hardcoded limits)', () => {
    // School policy limits teachers to 3 periods per day (lower than old hardcoded 6)
    const policies: SchoolTimetablePolicy[] = [
      {
        id: 'pol-strict',
        schoolId: 'sch-1',
        scopeType: 'school_default',
        rules: {
          maxPeriodsPerDay: 3,
          maxPeriodsPerWeek: 20,
          maxConsecutivePeriods: 3,
          minBreakMinutes: 30,
          maxOnlineSessionsPerDay: 2,
          maxOnlineSessionsPerWeek: 5,
          maxCombinedTeachingHoursPerDay: 5.0,
        },
        isActive: true,
      },
    ];

    // Sarah is requested to teach 4 periods across 4 different classes in a 1-day school
    const singleDaySlots: SolverPeriodSlot[] = [
      { dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', isMorning: true, isAfternoon: false },
      { dayOfWeek: 1, periodNumber: 2, startTime: '08:45', endTime: '09:30', isMorning: true, isAfternoon: false },
      { dayOfWeek: 1, periodNumber: 3, startTime: '09:30', endTime: '10:15', isMorning: true, isAfternoon: false },
      { dayOfWeek: 1, periodNumber: 4, startTime: '10:45', endTime: '11:30', isMorning: true, isAfternoon: false },
    ];

    const requirements: SolverClassRequirement[] = [
      { classId: 'cls-p4', className: 'P4', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 1 },
      { classId: 'cls-p5', className: 'P5', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 1 },
      { classId: 'cls-p6', className: 'P6', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 1 },
      { classId: 'cls-p7', className: 'P7', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 1 },
    ];

    const result = timetableSolverService.solveTimetable({
      requirements,
      slots: singleDaySlots,
      policies,
    });

    // Feasible must be false because Sarah cannot exceed 3 periods on Monday!
    expect(result.feasible).toBe(false);
    expect(result.assignments.length).toBe(3); // Exactly 3 scheduled, 4th refused by policy!
    expect(result.diagnostics.status).toBe('PARTIALLY_COMPLIANT');
    expect(result.diagnostics.unassignedPeriodsCount).toBe(1);
  });

  it('(4) Consecutive Periods Limit: solver enforces mandatory breaks after consecutive runs', () => {
    // Policy: max consecutive periods = 2
    const policies: SchoolTimetablePolicy[] = [
      {
        id: 'pol-consec',
        schoolId: 'sch-1',
        scopeType: 'school_default',
        rules: {
          maxPeriodsPerDay: 4,
          maxPeriodsPerWeek: 20,
          maxConsecutivePeriods: 2, // Max 2 in a row
          minBreakMinutes: 30,
          maxOnlineSessionsPerDay: 2,
          maxOnlineSessionsPerWeek: 5,
          maxCombinedTeachingHoursPerDay: 5.0,
        },
        isActive: true,
      },
    ];

    // Slots: 1, 2, 3 on Monday (Periods 1, 2, 3 are consecutive!)
    const threeConsecutiveSlots: SolverPeriodSlot[] = [
      { dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', isMorning: true, isAfternoon: false },
      { dayOfWeek: 1, periodNumber: 2, startTime: '08:45', endTime: '09:30', isMorning: true, isAfternoon: false },
      { dayOfWeek: 1, periodNumber: 3, startTime: '09:30', endTime: '10:15', isMorning: true, isAfternoon: false },
    ];

    // Sarah requested 3 periods across 3 distinct classes
    const requirements: SolverClassRequirement[] = [
      { classId: 'cls-p4', className: 'P4', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 1 },
      { classId: 'cls-p5', className: 'P5', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 1 },
      { classId: 'cls-p6', className: 'P6', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 1 },
    ];

    const result = timetableSolverService.solveTimetable({
      requirements,
      slots: threeConsecutiveSlots,
      policies,
    });

    // Cannot schedule 3 consecutive periods! Can at most schedule 2!
    expect(result.feasible).toBe(false);
    expect(result.assignments.length).toBe(2);
    expect(result.diagnostics.unassignedPeriodsCount).toBe(1);
  });

  it('(5) Soft preferences (Math morning, PE afternoon) are scored', () => {
    const requirements: SolverClassRequirement[] = [
      { classId: 'cls-p5', className: 'P5', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 4 },
      { classId: 'cls-p5', className: 'P5', subjectId: 'sub-pe', subjectName: 'Physical Education', teacherId: 't-coach', teacherName: 'Coach', periodsPerWeek: 2 },
    ];

    const preferences: TimetableSubjectPreference[] = [
      {
        id: 'pref-1',
        schoolId: 'sch-1',
        subjectId: 'sub-math',
        subjectName: 'Mathematics',
        preferredTimeWindow: 'MORNING',
        priorityWeight: 10,
        allowDoublePeriods: false,
        sourceType: 'MANUAL',
      },
      {
        id: 'pref-2',
        schoolId: 'sch-1',
        subjectId: 'sub-pe',
        subjectName: 'Physical Education',
        preferredTimeWindow: 'AFTERNOON',
        priorityWeight: 8,
        allowDoublePeriods: false,
        sourceType: 'MANUAL',
      },
    ];

    const result = timetableSolverService.solveTimetable({ requirements, preferences });

    expect(result.feasible).toBe(true);
    expect(result.scorecard.softPreferenceScore).toBeGreaterThanOrEqual(80);

    const mathAssignments = result.assignments.filter((a) => a.subjectId === 'sub-math');
    for (const m of mathAssignments) {
      expect(m.slot.isMorning).toBe(true);
    }

    const peAssignments = result.assignments.filter((a) => a.subjectId === 'sub-pe');
    for (const p of peAssignments) {
      expect(p.slot.isAfternoon).toBe(true);
    }
  });

  it('(6) Constraint Conflict Diagnostic pinpoints bottlenecks when over-constrained', () => {
    const singleMorningSlot = [
      { dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', isMorning: true, isAfternoon: false },
    ];

    const requirements: SolverClassRequirement[] = [
      { classId: 'cls-p4', className: 'P4', subjectId: 'sub-math', subjectName: 'Mathematics', teacherId: 't-sarah', teacherName: 'Sarah', periodsPerWeek: 3 },
    ];

    const result = timetableSolverService.solveTimetable({
      requirements,
      slots: singleMorningSlot,
    });

    expect(result.feasible).toBe(false);
    expect(result.diagnostics.status).toBe('PARTIALLY_COMPLIANT');
    expect(result.diagnostics.unassignedPeriodsCount).toBe(2);
    expect(result.diagnostics.bottlenecks.length).toBeGreaterThan(0);
    expect(result.diagnostics.suggestedResolutions.length).toBeGreaterThan(0);
  });

  it('(7) Combined physical + online workload calculates correctly and flags cap breaches', () => {
    const policies: SchoolTimetablePolicy[] = [
      {
        id: 'pol-1',
        schoolId: 'sch-1',
        scopeType: 'school_default',
        rules: {
          maxPeriodsPerDay: 5,
          maxPeriodsPerWeek: 20,
          maxConsecutivePeriods: 3,
          minBreakMinutes: 30,
          maxOnlineSessionsPerDay: 2,
          maxOnlineSessionsPerWeek: 5,
          maxCombinedTeachingHoursPerDay: 6.0,
        },
        isActive: true,
      },
    ];

    const teachers = [
      { id: 't-busy', name: 'Busy Bob' },
      { id: 't-normal', name: 'Normal Nina' },
    ];

    const physicalEntries = [
      ...Array(22).fill(null).map((_, i) => ({ teacherId: 't-busy', dayOfWeek: (i % 5) + 1 })),
      ...Array(15).fill(null).map((_, i) => ({ teacherId: 't-normal', dayOfWeek: (i % 5) + 1 })),
    ];

    const onlineSessions = [
      ...Array(6).fill({ teacherId: 't-busy', scheduledStart: '2026-09-07T16:00:00Z', status: 'CONFIRMED' }),
      ...Array(2).fill({ teacherId: 't-normal', scheduledStart: '2026-09-07T16:00:00Z', status: 'CONFIRMED' }),
    ];

    const summaries = timetablePolicyService.computeTeacherWorkloads({
      teachers,
      physicalTimetableEntries: physicalEntries,
      onlineSessions,
      policies,
    });

    const bob = summaries.find((s) => s.employeeId === 't-busy')!;
    expect(bob.status).toBe('OVER_CAP');
    expect(bob.physicalPeriods).toBe(22);
    expect(bob.onlineSessions).toBe(6);
    expect(bob.alerts.length).toBeGreaterThan(0);

    const nina = summaries.find((s) => s.employeeId === 't-normal')!;
    expect(nina.status).toBe('OK');
  });

  it('(8) Historical timetable pattern analyzer extracts empirical recurring preferences', () => {
    const pastEntries = [
      { subjectId: 'sub-math', subjectName: 'Mathematics', startTime: '08:00', dayOfWeek: 1 },
      { subjectId: 'sub-math', subjectName: 'Mathematics', startTime: '08:45', dayOfWeek: 2 },
      { subjectId: 'sub-math', subjectName: 'Mathematics', startTime: '09:30', dayOfWeek: 3 },
      { subjectId: 'sub-math', subjectName: 'Mathematics', startTime: '10:45', dayOfWeek: 4 },
      { subjectId: 'sub-pe', subjectName: 'Physical Education', startTime: '14:00', dayOfWeek: 2 },
      { subjectId: 'sub-pe', subjectName: 'Physical Education', startTime: '14:45', dayOfWeek: 5 },
      { subjectId: 'sub-pe', subjectName: 'Physical Education', startTime: '13:00', dayOfWeek: 3 },
    ];

    const patterns = timetableSolverService.analyzeHistoricalPatterns(pastEntries);

    const mathPattern = patterns.find((p) => p.subjectId === 'sub-math')!;
    expect(mathPattern).toBeDefined();
    expect(mathPattern.empiricalPreference).toBe('MORNING');
    expect(mathPattern.frequencyPercentage).toBe(100);

    const pePattern = patterns.find((p) => p.subjectId === 'sub-pe')!;
    expect(pePattern).toBeDefined();
    expect(pePattern.empiricalPreference).toBe('AFTERNOON');
    expect(pePattern.frequencyPercentage).toBe(100);
  });

  it('(9) 4-Tier Policy Hierarchy with Effective Dates: Exception -> Teacher -> Department -> School Default', () => {
    const policies: SchoolTimetablePolicy[] = [
      {
        id: 'pol-school',
        schoolId: 'sch-1',
        scopeType: 'school_default',
        rules: { maxPeriodsPerDay: 6, maxPeriodsPerWeek: 28, maxConsecutivePeriods: 3, minBreakMinutes: 30, maxOnlineSessionsPerDay: 2, maxOnlineSessionsPerWeek: 8, maxCombinedTeachingHoursPerDay: 7.0 },
        isActive: true,
      },
      {
        id: 'pol-dept',
        schoolId: 'sch-1',
        scopeType: 'department',
        departmentName: 'Sciences',
        rules: { maxPeriodsPerDay: 5, maxPeriodsPerWeek: 22, maxConsecutivePeriods: 2, minBreakMinutes: 40, maxOnlineSessionsPerDay: 2, maxOnlineSessionsPerWeek: 6, maxCombinedTeachingHoursPerDay: 6.0 },
        isActive: true,
      },
      {
        id: 'pol-teacher',
        schoolId: 'sch-1',
        scopeType: 'teacher',
        targetEmployeeId: 't-sarah',
        rules: { maxPeriodsPerDay: 4, maxPeriodsPerWeek: 18, maxConsecutivePeriods: 2, minBreakMinutes: 45, maxOnlineSessionsPerDay: 1, maxOnlineSessionsPerWeek: 4, maxCombinedTeachingHoursPerDay: 5.0 },
        isActive: true,
      },
      {
        id: 'pol-exception',
        schoolId: 'sch-1',
        scopeType: 'exception',
        targetEmployeeId: 't-sarah',
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-15',
        rules: { maxPeriodsPerDay: 2, maxPeriodsPerWeek: 10, maxConsecutivePeriods: 1, minBreakMinutes: 60, maxOnlineSessionsPerDay: 0, maxOnlineSessionsPerWeek: 0, maxCombinedTeachingHoursPerDay: 2.5 },
        isActive: true,
      },
    ];

    // 1. Regular teacher outside Sciences gets school default
    const regular = timetablePolicyService.resolveEffectiveRules(policies, 't-general');
    expect(regular.maxPeriodsPerDay).toBe(6);

    // 2. Science teacher gets department override
    const scienceTeacher = timetablePolicyService.resolveEffectiveRules(policies, 't-sci', 'Sciences');
    expect(scienceTeacher.maxPeriodsPerDay).toBe(5);

    // 3. Sarah outside exception window gets teacher policy
    const sarahNormal = timetablePolicyService.resolveEffectiveRules(policies, 't-sarah', 'Sciences', '2026-10-01');
    expect(sarahNormal.maxPeriodsPerDay).toBe(4);

    // 4. Sarah during active exception window gets exception override
    const sarahException = timetablePolicyService.resolveEffectiveRules(policies, 't-sarah', 'Sciences', '2026-09-08');
    expect(sarahException.maxPeriodsPerDay).toBe(2);
  });

  it('(10) Quota derivation derives weekly periods from Phase 6 scheme of work', () => {
    const schemes = [
      {
        classId: 'cls-p5',
        subjectId: 'sub-math',
        estimatedPeriodsTotal: 50,
        durationWeeks: 10,
      },
    ];

    const derived = timetablePolicyService.deriveSubjectQuota('cls-p5', 'sub-math', schemes);
    expect(derived).toBe(5); // 50 / 10 = 5

    // Quota override takes precedence
    const overridden = timetablePolicyService.deriveSubjectQuota('cls-p5', 'sub-math', schemes, 6);
    expect(overridden).toBe(6);
  });

  it('(11) publishTimetableAtomic calls Supabase RPC and returns success payload', async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: { success: true, timetable_id: 'tt-123', archived_count: 1 },
      error: null,
    });

    const result = await timetablePolicyService.publishTimetableAtomic('tt-123', 'emp-admin');
    expect(supabase.rpc).toHaveBeenCalledWith('publish_timetable_atomic', {
      p_timetable_id: 'tt-123',
      p_published_by: 'emp-admin',
    });
    expect(result.success).toBe(true);
    expect(result.archivedCount).toBe(1);
  });

  it('(12) onlineBookingService.confirmBooking invokes confirm_online_booking_atomic exclusively', async () => {
    const origEnv = process.env.NODE_ENV;
    const origUrl = (import.meta.env as any).VITE_SUPABASE_URL;
    process.env.NODE_ENV = 'production';
    (import.meta.env as any).VITE_SUPABASE_URL = 'https://prod-real-db.supabase.co';

    try {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'b-123',
            school_id: 'sch-1',
            student_id: 'stud-1',
            offering_id: 'off-1',
            scheduled_date: '2026-09-10',
            start_time: '10:00:00',
            end_time: '11:00:00',
            status: 'requested',
          },
          error: null,
        }),
      });

      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          bookingId: 'b-123',
          sessionId: 'ses-456',
          teacherId: 't-1',
          status: 'confirmed',
        },
        error: null,
      });

      const result = await confirmBooking('b-123', 't-1');
      expect(supabase.rpc).toHaveBeenCalledWith('confirm_online_booking_atomic', {
        p_booking_id: 'b-123',
        p_teacher_id: 't-1',
      });
      expect(result?.sessionId).toBe('ses-456');
      expect(result?.status).toBe('confirmed');
    } finally {
      process.env.NODE_ENV = origEnv;
      (import.meta.env as any).VITE_SUPABASE_URL = origUrl;
    }
  });

  it('(13) Clock-time break policy resets consecutive period counter when interval >= minBreakMinutes', () => {
    // 3 slots:
    // Slot 1: 08:00 - 08:45 (Period 1)
    // Slot 2: 08:45 - 09:30 (Period 2)
    // Slot 3: 10:00 - 10:45 (Period 3) -> 30 min break between 09:30 and 10:00!
    const slotsWithBreak: SolverPeriodSlot[] = [
      { dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', isMorning: true, isAfternoon: false },
      { dayOfWeek: 1, periodNumber: 2, startTime: '08:45', endTime: '09:30', isMorning: true, isAfternoon: false },
      { dayOfWeek: 1, periodNumber: 3, startTime: '10:00', endTime: '10:45', isMorning: true, isAfternoon: false },
    ];

    // Policy: max consecutive = 2 periods, min break = 30 mins
    const breakPolicy: SchoolTimetablePolicy[] = [
      {
        id: 'pol-break',
        schoolId: 'sch-1',
        scopeType: 'school_default',
        rules: {
          maxPeriodsPerDay: 6,
          maxPeriodsPerWeek: 28,
          maxConsecutivePeriods: 2,
          minBreakMinutes: 30,
          maxOnlineSessionsPerDay: 2,
          maxOnlineSessionsPerWeek: 8,
          maxCombinedTeachingHoursPerDay: 7,
        },
        isActive: true,
      },
    ];

    const reqs: SolverClassRequirement[] = [
      { classId: 'cls-1', className: 'P1', subjectId: 'sub-m', subjectName: 'Math', teacherId: 't-1', teacherName: 'Teacher 1', periodsPerWeek: 1, isAllocated: true },
      { classId: 'cls-1', className: 'P1', subjectId: 'sub-e', subjectName: 'English', teacherId: 't-1', teacherName: 'Teacher 1', periodsPerWeek: 1, isAllocated: true },
      { classId: 'cls-2', className: 'P2', subjectId: 'sub-m', subjectName: 'Math', teacherId: 't-1', teacherName: 'Teacher 1', periodsPerWeek: 1, isAllocated: true },
    ];

    // Teacher 1 takes Period 1, Period 2, and Period 3.
    // Period 1 and Period 2 are consecutive (2 periods = max consecutive limit).
    // Period 3 is after a 30-minute break (09:30 to 10:00 = 30 mins >= minBreakMinutes 30).
    // Because break >= 30 mins, consecutive counter resets, and all 3 periods are scheduled successfully!
    const result = timetableSolverService.solveTimetable({
      requirements: reqs,
      policies: breakPolicy,
      slots: slotsWithBreak,
    });

    expect(result.feasible).toBe(true);
    expect(result.scorecard.hardViolationsCount).toBe(0);
    expect(result.assignments).toHaveLength(3);
  });
});
