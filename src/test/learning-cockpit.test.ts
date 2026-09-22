import { describe, it, expect } from 'vitest';
import {
  buildStudentCockpit,
  buildTeacherCockpit,
  buildAtRisk,
  buildMarkingQueue,
  classifyWorkItem,
} from '../modules/learning/learningCockpitDomain';
import type { WorkSeed, MarkingSeed, RiskSeed } from '../modules/learning/learningCockpitDomain';

describe('Digital Learning Spine — student cockpit buckets (M6)', () => {
  const today = '2026-09-22';

  const seeds: WorkSeed[] = [
    {
      id: 'a1',
      source: 'assignment',
      title: 'Fractions worksheet',
      dueDate: '2026-09-22',
      submissionState: null,
    },
    {
      id: 'a2',
      source: 'assignment',
      title: 'Overdue essay',
      dueDate: '2026-09-15',
      submissionState: null,
    },
    {
      id: 'a3',
      source: 'activity',
      title: 'Reading pack',
      dueDate: '2026-09-25',
      activityType: 'RESOURCE',
    },
    {
      id: 'a4',
      source: 'assignment',
      title: 'Marked quiz',
      dueDate: '2026-09-10',
      submissionState: 'reviewed',
      hasResult: true,
      score: 8,
      maxScore: 10,
      feedback: 'Strong method. Watch units.',
    },
    {
      id: 'a5',
      source: 'assignment',
      title: 'Handed in lab',
      dueDate: '2026-09-18',
      submissionState: 'submitted',
    },
  ];

  it('classifies today / overdue / due / reviewed / submitted', () => {
    expect(classifyWorkItem(seeds[0], today).bucket).toBe('today');
    expect(classifyWorkItem(seeds[1], today).bucket).toBe('overdue');
    expect(classifyWorkItem(seeds[2], today).bucket).toBe('due');
    expect(classifyWorkItem(seeds[3], today).bucket).toBe('reviewed');
    expect(classifyWorkItem(seeds[4], today).bucket).toBe('submitted');
  });

  it('builds Student Today cockpit with Today · Learning · Due · Overdue · Feedback · Progress · Next', () => {
    const cockpit = buildStudentCockpit(seeds, today);
    expect(cockpit.today.map((i) => i.id)).toEqual(['a1']);
    expect(cockpit.overdue.map((i) => i.id)).toEqual(['a2']);
    expect(cockpit.due.map((i) => i.id)).toContain('a1');
    expect(cockpit.due.map((i) => i.id)).toContain('a3');
    expect(cockpit.learning).toHaveLength(5);
    expect(cockpit.feedback).toHaveLength(1);
    expect(cockpit.feedback[0].text).toContain('Strong method');
    expect(cockpit.progress.total).toBe(5);
    expect(cockpit.progress.reviewed).toBe(1);
    // Progress ≠ completion: reviewed / total, not submitted / total.
    expect(cockpit.progress.completionPct).toBe(20);
    expect(cockpit.next?.id).toBe('a1');
  });

  it('treats assigned-today work as Today even without a due date', () => {
    const item = classifyWorkItem(
      { id: 'n1', source: 'activity', title: 'New resource', assignedDate: today, activityType: 'RESOURCE' },
      today,
    );
    expect(item.bucket).toBe('today');
  });
});

describe('Digital Learning Spine — teacher marking queue + at-risk (M6)', () => {
  const now = Date.parse('2026-09-22T12:00:00Z');

  const marking: MarkingSeed[] = [
    {
      submissionId: 's1',
      studentId: 'stu-1',
      studentName: 'Amina',
      assignmentId: 'as1',
      learningActivityId: null,
      title: 'Fractions',
      state: 'submitted',
      attempt: 1,
      submittedAt: '2026-09-20T09:00:00Z',
      late: false,
      photoCount: 2,
    },
    {
      submissionId: 's2',
      studentId: 'stu-2',
      studentName: 'Brian',
      assignmentId: 'as2',
      learningActivityId: null,
      title: 'Essay',
      state: 'late',
      attempt: 2,
      submittedAt: '2026-09-18T09:00:00Z',
      late: true,
      photoCount: 1,
    },
    {
      submissionId: 's3',
      studentId: 'stu-3',
      assignmentId: 'as3',
      learningActivityId: null,
      title: 'Done work',
      state: 'reviewed',
      attempt: 1,
      submittedAt: '2026-09-01T09:00:00Z',
      late: false,
      photoCount: 1,
    },
  ];

  const risks: RiskSeed[] = [
    {
      studentId: 'stu-9',
      studentName: 'Chloe',
      overdueCount: 3,
      lateCount: 1,
      missingCount: 0,
      unmarkedCount: 0,
    },
    {
      studentId: 'stu-8',
      studentName: 'Dan',
      overdueCount: 0,
      lateCount: 0,
      missingCount: 0,
      unmarkedCount: 1,
    },
  ];

  it('queues only in-flight photo submissions, late first', () => {
    const queue = buildMarkingQueue(marking, now);
    expect(queue.map((q) => q.submissionId)).toEqual(['s2', 's1']);
    expect(queue[0].waitedDays).toBeGreaterThanOrEqual(4);
    expect(queue[0].photoCount).toBe(1);
  });

  it('flags at-risk only on deterministic thresholds (no AI scoring)', () => {
    const atRisk = buildAtRisk(risks);
    expect(atRisk.map((a) => a.studentId)).toEqual(['stu-9']);
    expect(atRisk[0].riskReasons[0]).toContain('overdue');
    // unmarked alone is not enough for risk in P0 foundation
    expect(atRisk.find((a) => a.studentId === 'stu-8')).toBeUndefined();
  });

  it('builds teacher cockpit stats', () => {
    const cockpit = buildTeacherCockpit(marking, risks, now);
    expect(cockpit.stats.toMark).toBe(2);
    expect(cockpit.stats.overdueMissing).toBe(3);
    expect(cockpit.stats.atRiskStudents).toBe(1);
    expect(cockpit.markingQueue).toHaveLength(2);
  });
});
