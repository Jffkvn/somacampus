import { describe, it, expect, vi, beforeEach } from 'vitest';
import { timetablePolicyService } from '../modules/planning/timetablePolicyService';
import { timetableSolverService } from '../modules/planning/timetableSolverService';
import type {
  TeacherOfficialSubject,
  SchoolTimetablePolicy,
} from '../types/domain';

// Mock Supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { supabase } from '../lib/supabase';

describe('Official Teaching Subjects & Teaching Allocation Architecture', () => {
  const schoolId = 'sch-uganda-primary-1';
  const academicYearId = 'ay-2026';

  // Official Teaching Staff
  const teacherFlorence = { id: 't-florence', name: 'Mrs. Florence' };
  const teacherDavid = { id: 't-david', name: 'Mr. David' };

  // Official Teaching Subjects:
  // Florence: Mathematics
  // David: English, History
  const officialSubjects: TeacherOfficialSubject[] = [
    {
      id: 'tos-1',
      schoolId,
      teacherId: teacherFlorence.id,
      subjectId: 'sub-math',
      subjectName: 'Mathematics',
    },
    {
      id: 'tos-2',
      schoolId,
      teacherId: teacherDavid.id,
      subjectId: 'sub-eng',
      subjectName: 'English',
    },
    {
      id: 'tos-3',
      schoolId,
      teacherId: teacherDavid.id,
      subjectId: 'sub-hist',
      subjectName: 'History',
    },
  ];

  const classes = [
    { id: 'cls-p4', name: 'Primary 4' },
    { id: 'cls-p5', name: 'Primary 5' },
  ];

  const subjects = [
    { id: 'sub-math', name: 'Mathematics' },
    { id: 'sub-eng', name: 'English' },
    { id: 'sub-hist', name: 'History' },
    { id: 'sub-sci', name: 'Science' },
  ];

  const policies: SchoolTimetablePolicy[] = [
    {
      id: 'pol-default',
      schoolId,
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
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('1. Official Teaching Subjects Qualification Rule', () => {
    it('allows assigning teachers strictly to their appointed official teaching subjects', async () => {
      // Mock db check for official subject
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'teacher_official_subjects') {
          const chain: any = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 'tos-1' },
            error: null,
          });
          return chain;
        }
        if (table === 'teaching_allocations') {
          const chain: any = {};
          chain.insert = vi.fn().mockReturnValue(chain);
          chain.select = vi.fn().mockReturnValue(chain);
          chain.single = vi.fn().mockResolvedValue({
            data: {
              id: 'alloc-1',
              school_id: schoolId,
              academic_year_id: academicYearId,
              class_id: 'cls-p4',
              subject_id: 'sub-math',
              teacher_id: teacherFlorence.id,
              periods_per_week: 5,
              status: 'reviewed',
              allocation_source: 'human',
              proposal_reason: 'Management planning meeting',
            },
            error: null,
          });
          return chain;
        }
        return {};
      });

      const alloc = await timetablePolicyService.saveTeachingAllocation({
        schoolId,
        academicYearId,
        classId: 'cls-p4',
        subjectId: 'sub-math',
        teacherId: teacherFlorence.id,
        periodsPerWeek: 5,
        status: 'reviewed',
        allocationSource: 'human',
      });

      expect(alloc.id).toBe('alloc-1');
      expect(alloc.teacherId).toBe(teacherFlorence.id);
      expect(alloc.subjectId).toBe('sub-math');
    });

    it('rejects allocation when a teacher is not qualified/appointed for that subject', async () => {
      // Florence does NOT teach Science
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'teacher_official_subjects') {
          const chain: any = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: null, // Empty -> not qualified
            error: null,
          });
          return chain;
        }
        return {};
      });

      await expect(
        timetablePolicyService.saveTeachingAllocation({
          schoolId,
          academicYearId,
          classId: 'cls-p4',
          subjectId: 'sub-sci', // Science
          teacherId: teacherFlorence.id, // Florence
          periodsPerWeek: 4,
          status: 'draft',
          allocationSource: 'human',
        }),
      ).rejects.toThrow(/not officially appointed/i);
    });
  });

  describe('2. Workflow B: AI-Assisted Teaching Plan Generation', () => {
    it('creates qualified draft proposals and reports unassigned demands without fake modulo fallbacks', () => {
      // Schemes of Work defining weekly quotas from Medium-Term Plans
      const schemesOfWork = [
        {
          class_id: 'cls-p4',
          subject_id: 'sub-math',
          medium_term_plans: [{ estimated_periods: 50, week_start: 1, week_end: 10 }], // 5 periods/week
        },
        {
          class_id: 'cls-p5',
          subject_id: 'sub-math',
          medium_term_plans: [{ estimated_periods: 50, week_start: 1, week_end: 10 }], // 5 periods/week
        },
        {
          class_id: 'cls-p4',
          subject_id: 'sub-eng',
          medium_term_plans: [{ estimated_periods: 40, week_start: 1, week_end: 10 }], // 4 periods/week
        },
        {
          class_id: 'cls-p5',
          subject_id: 'sub-hist',
          medium_term_plans: [{ estimated_periods: 30, week_start: 1, week_end: 10 }], // 3 periods/week
        },
        // Science has a scheme of work, but NO TEACHER has Science in official subjects!
        {
          class_id: 'cls-p4',
          subject_id: 'sub-sci',
          medium_term_plans: [{ estimated_periods: 40, week_start: 1, week_end: 10 }], // 4 periods/week
        },
        // P5 English has NO SCHEME OF WORK -> missing curriculum quota
      ];

      const result = timetablePolicyService.generateTeachingPlanDraftWithAi({
        schoolId,
        academicYearId,
        classes,
        subjects,
        teachers: [teacherFlorence, teacherDavid],
        officialSubjects,
        schemesOfWork,
        policies,
      });

      // 1. Check valid draft allocations
      expect(result.draftAllocations.length).toBeGreaterThan(0);

      // Florence must be assigned to P4 Math and P5 Math (only teacher appointed for Math)
      const florenceAllocations = result.draftAllocations.filter((d) => d.teacherId === teacherFlorence.id);
      expect(florenceAllocations).toHaveLength(2);
      expect(florenceAllocations.every((a) => a.subjectId === 'sub-math')).toBe(true);
      expect(florenceAllocations[0].allocationSource).toBe('ai_draft');
      expect(florenceAllocations[0].proposalReason).toContain('Official Mathematics subject');

      // David must be assigned to P4 English and P5 History
      const davidAllocations = result.draftAllocations.filter((d) => d.teacherId === teacherDavid.id);
      expect(davidAllocations).toHaveLength(2);
      expect(davidAllocations.map((a) => a.subjectId).sort()).toEqual(['sub-eng', 'sub-hist']);

      // 2. Check unassigned detections (NO fake teacher modulo fallback, NO fake 4-periods fallback)
      expect(result.unassigned.length).toBeGreaterThan(0);

      // P4 Science has no qualified teachers appointed
      const unassignedScience = result.unassigned.find((u) => u.subjectId === 'sub-sci');
      expect(unassignedScience).toBeDefined();
      expect(unassignedScience?.reason).toContain('No teachers have Science recorded in their Official Teaching Subjects');

      // P5 English has no Scheme of Work periods
      const unassignedMissingScheme = result.unassigned.find(
        (u) => u.classId === 'cls-p5' && u.subjectId === 'sub-eng',
      );
      expect(unassignedMissingScheme).toBeDefined();
      expect(unassignedMissingScheme?.reason).toContain('No weekly teaching requirement found in Schemes of Work');
    });

    it('enforces teacher maximum weekly limits during AI planning', () => {
      // Policy with strict cap: 6 periods/week max for all teachers
      const strictPolicies: SchoolTimetablePolicy[] = [
        {
          id: 'pol-strict',
          schoolId,
          scopeType: 'school_default',
          rules: {
            maxPeriodsPerDay: 4,
            maxPeriodsPerWeek: 6, // Low cap
            maxConsecutivePeriods: 2,
            minBreakMinutes: 30,
            maxOnlineSessionsPerDay: 0,
            maxOnlineSessionsPerWeek: 0,
            maxCombinedTeachingHoursPerDay: 4,
          },
          isActive: true,
        },
      ];

      const schemesOfWork = [
        {
          class_id: 'cls-p4',
          subject_id: 'sub-math',
          medium_term_plans: [{ estimated_periods: 50, week_start: 1, week_end: 10 }], // 5 periods
        },
        {
          class_id: 'cls-p5',
          subject_id: 'sub-math',
          medium_term_plans: [{ estimated_periods: 50, week_start: 1, week_end: 10 }], // 5 periods
        },
      ];

      const result = timetablePolicyService.generateTeachingPlanDraftWithAi({
        schoolId,
        academicYearId,
        classes,
        subjects: [{ id: 'sub-math', name: 'Mathematics' }],
        teachers: [teacherFlorence],
        officialSubjects,
        schemesOfWork,
        policies: strictPolicies,
      });

      // Florence takes P4 Math (5 periods <= 6 cap)
      expect(result.draftAllocations).toHaveLength(1);
      expect(result.draftAllocations[0].classId).toBe('cls-p4');

      // P5 Math (5 periods) would push Florence to 10 periods > 6 cap -> Reported unassigned!
      expect(result.unassigned).toHaveLength(1);
      expect(result.unassigned[0].classId).toBe('cls-p5');
      expect(result.unassigned[0].reason).toContain('would exceed their maximum weekly teaching limits');
    });
  });

  describe('3. Authoritative Approval State Machine & RPC Projection', () => {
    it('approves teaching allocations atomically via RPC and updates compatibility projection', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          approved_count: 3,
          school_id: schoolId,
        },
        error: null,
      });

      const res = await timetablePolicyService.approveTeachingAllocationsAtomic(
        ['alloc-1', 'alloc-2', 'alloc-3'],
        'emp-principal-1',
      );

      expect(supabase.rpc).toHaveBeenCalledWith('approve_teaching_allocations_atomic', {
        p_allocation_ids: ['alloc-1', 'alloc-2', 'alloc-3'],
        p_approved_by: 'emp-principal-1',
      });
      expect(res.success).toBe(true);
      expect(res.approvedCount).toBe(3);
    });
  });

  describe('4. Deterministic CSP Solver Invariants', () => {
    it('blocks timetable generation when requirements have unallocated or unapproved staff', () => {
      const requirementsWithUnassigned = [
        {
          classId: 'cls-p4',
          className: 'P4',
          subjectId: 'sub-math',
          subjectName: 'Mathematics',
          teacherId: 't-florence',
          teacherName: 'Mrs. Florence',
          periodsPerWeek: 5,
          isAllocated: true,
        },
        {
          classId: 'cls-p4',
          className: 'P4',
          subjectId: 'sub-sci',
          subjectName: 'Science',
          teacherId: '',
          teacherName: 'UNASSIGNED',
          periodsPerWeek: 4,
          isAllocated: false, // Unallocated!
        },
      ];

      const result = timetableSolverService.solveTimetable({
        requirements: requirementsWithUnassigned,
      });

      expect(result.feasible).toBe(false);
      expect(result.diagnostics.status).toBe('INFEASIBLE');
      expect(result.diagnostics.unassignedPeriodsCount).toBe(4);
      expect(result.diagnostics.bottlenecks[0].description).toContain('P4 Science has no approved teacher allocation');
      expect(result.assignments).toHaveLength(0);
    });

    it('generates a 0-conflict schedule when all requirements have approved staff and valid quotas', () => {
      const validRequirements = [
        {
          classId: 'cls-p4',
          className: 'P4',
          subjectId: 'sub-math',
          subjectName: 'Mathematics',
          teacherId: 't-florence',
          teacherName: 'Mrs. Florence',
          periodsPerWeek: 5,
          isAllocated: true,
        },
        {
          classId: 'cls-p4',
          className: 'P4',
          subjectId: 'sub-eng',
          subjectName: 'English',
          teacherId: 't-david',
          teacherName: 'Mr. David',
          periodsPerWeek: 5,
          isAllocated: true,
        },
        {
          classId: 'cls-p5',
          className: 'P5',
          subjectId: 'sub-hist',
          subjectName: 'History',
          teacherId: 't-david',
          teacherName: 'Mr. David',
          periodsPerWeek: 4,
          isAllocated: true,
        },
      ];

      const result = timetableSolverService.solveTimetable({
        requirements: validRequirements,
        policies,
      });

      expect(result.feasible).toBe(true);
      expect(result.diagnostics.status).toBe('COMPLIANT');
      expect(result.scorecard.hardViolationsCount).toBe(0);
      expect(result.assignments.length).toBe(14); // 5 + 5 + 4
    });
  });
});
