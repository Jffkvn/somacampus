import { describe, it, expect, vi } from 'vitest';

/**
 * Phase 9I Task 2 — Timetable Policy & Constraint Solver Test Suite.
 *
 * Verifies:
 * 1. Deterministic CSP solver mathematically produces 0 hard conflicts
 * 2. Class quotas and teacher daily limits are respected
 * 3. Soft preferences (Math morning, PE afternoon) are scored
 * 4. Conflict diagnostics ("Why can't you generate a perfect timetable?")
 * 5. Combined physical + online workload calculation
 * 6. Historical timetable pattern analysis
 * 7. Hierarchical policy resolution (Teacher override -> School default)
 * 8. Quota derivation from Phase 6 Schemes of Work
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
} from '../modules/planning/timetableSolverService';
// eslint-disable-next-line import/first
import { timetablePolicyService } from '../modules/planning/timetablePolicyService';
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
      classSlots.add(key);
    }

    // Verify quotas satisfied
    const p4MathCount = result.assignments.filter((a) => a.classId === 'cls-p4' && a.subjectId === 'sub-math').length;
    expect(p4MathCount).toBe(5);
    const p5MathCount = result.assignments.filter((a) => a.classId === 'cls-p5' && a.subjectId === 'sub-math').length;
    expect(p5MathCount).toBe(5);
  });

  it('(2) Solver scores soft preferences and prioritizes morning Math', () => {
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

    // Check Math sessions are all morning
    const mathAssignments = result.assignments.filter((a) => a.subjectId === 'sub-math');
    for (const m of mathAssignments) {
      expect(m.slot.isMorning).toBe(true);
    }

    // Check PE sessions are all afternoon
    const peAssignments = result.assignments.filter((a) => a.subjectId === 'sub-pe');
    for (const p of peAssignments) {
      expect(p.slot.isAfternoon).toBe(true);
    }
  });

  it('(3) Constraint Conflict Diagnostic pinpoints bottlenecks when over-constrained', () => {
    // Force over-constrained scenario: Sarah only has 5 weekdays, single morning slots per day, but asked for 8 morning periods
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

  it('(4) Combined physical + online workload calculates correctly and flags cap breaches', () => {
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

    // Busy Bob has 22 physical periods (exceeds 20) and 6 online sessions (exceeds 5)
    // Normal Nina has 15 physical periods (3 per day across 5 days) and 2 online sessions
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

  it('(5) Historical timetable pattern analyzer extracts empirical recurring preferences', () => {
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
    expect(mathPattern.detectedWindow).toBe('MORNING');
    expect(mathPattern.percentage).toBe(100);

    const pePattern = patterns.find((p) => p.subjectId === 'sub-pe')!;
    expect(pePattern).toBeDefined();
    expect(pePattern.detectedWindow).toBe('AFTERNOON');
    expect(pePattern.percentage).toBe(100);
  });

  it('(6) Hierarchical policy resolution: Teacher override supersedes School default', () => {
    const policies: SchoolTimetablePolicy[] = [
      {
        id: 'pol-default',
        schoolId: 'sch-1',
        scopeType: 'school_default',
        rules: {
          maxPeriodsPerDay: 6,
          maxPeriodsPerWeek: 28,
          maxConsecutivePeriods: 3,
          minBreakMinutes: 30,
          maxOnlineSessionsPerDay: 2,
          maxOnlineSessionsPerWeek: 8,
          maxCombinedTeachingHoursPerDay: 7.0,
        },
        isActive: true,
      },
      {
        id: 'pol-teacher',
        schoolId: 'sch-1',
        scopeType: 'teacher',
        targetEmployeeId: 't-parttime',
        rules: {
          maxPeriodsPerDay: 3,
          maxPeriodsPerWeek: 12,
          maxConsecutivePeriods: 2,
          minBreakMinutes: 45,
          maxOnlineSessionsPerDay: 1,
          maxOnlineSessionsPerWeek: 3,
          maxCombinedTeachingHoursPerDay: 4.0,
        },
        isActive: true,
      },
    ];

    const defaultRules = timetablePolicyService.resolveEffectiveRules(policies, 't-regular');
    expect(defaultRules.maxPeriodsPerDay).toBe(6);
    expect(defaultRules.maxPeriodsPerWeek).toBe(28);

    const partTimeRules = timetablePolicyService.resolveEffectiveRules(policies, 't-parttime');
    expect(partTimeRules.maxPeriodsPerDay).toBe(3);
    expect(partTimeRules.maxPeriodsPerWeek).toBe(12);
  });

  it('(7) Quota derivation derives weekly periods from Phase 6 scheme of work', () => {
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

  it('(8) publishTimetableAtomic calls Supabase RPC and returns success payload', async () => {
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
});
