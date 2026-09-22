import { describe, it, expect } from 'vitest';
import {
  learningCoachService,
  validateCoachConfirmation,
} from '../modules/learning/learningCoachService';
import type { CoachConfirmation } from '../modules/learning/learningCoachService';

describe('Digital Learning Spine — Learning Coach (P1)', () => {
  it('hours_sign_off requires non-negative hours', () => {
    expect(() =>
      validateCoachConfirmation({
        schoolId: 's1',
        studentId: 'stu-1',
        assignmentId: 'ca-1',
        confirmationKind: 'hours_sign_off',
        confirmedByPersonId: 'person-1',
        hours: null,
      }),
    ).toThrow(/hours/i);

    expect(() =>
      validateCoachConfirmation({
        schoolId: 's1',
        studentId: 'stu-1',
        assignmentId: 'ca-1',
        confirmationKind: 'hours_sign_off',
        confirmedByPersonId: 'person-1',
        hours: -1,
      }),
    ).toThrow(/hours/i);

    expect(() =>
      validateCoachConfirmation({
        schoolId: 's1',
        studentId: 'stu-1',
        assignmentId: 'ca-1',
        confirmationKind: 'hours_sign_off',
        confirmedByPersonId: 'person-1',
        hours: 1.5,
      }),
    ).not.toThrow();
  });

  it('offline_work_verify does not require hours', () => {
    expect(() =>
      validateCoachConfirmation({
        schoolId: 's1',
        studentId: 'stu-1',
        assignmentId: 'ca-1',
        confirmationKind: 'offline_work_verify',
        confirmedByPersonId: 'person-1',
      }),
    ).not.toThrow();
  });

  it('sums only hours_sign_off rows inside the week window (deterministic)', () => {
    const rows: CoachConfirmation[] = [
      {
        id: '1',
        schoolId: 's1',
        studentId: 'stu-1',
        assignmentId: 'ca-1',
        confirmationKind: 'hours_sign_off',
        confirmedOn: '2026-09-21',
        hours: 1.5,
        note: null,
        learningActivityId: null,
        confirmedBy: 'p1',
      },
      {
        id: '2',
        schoolId: 's1',
        studentId: 'stu-1',
        assignmentId: 'ca-1',
        confirmationKind: 'hours_sign_off',
        confirmedOn: '2026-09-22',
        hours: 2,
        note: null,
        learningActivityId: null,
        confirmedBy: 'p1',
      },
      {
        id: '3',
        schoolId: 's1',
        studentId: 'stu-1',
        assignmentId: 'ca-1',
        confirmationKind: 'offline_work_verify',
        confirmedOn: '2026-09-22',
        hours: 99,
        note: null,
        learningActivityId: null,
        confirmedBy: 'p1',
      },
      {
        id: '4',
        schoolId: 's1',
        studentId: 'stu-1',
        assignmentId: 'ca-1',
        confirmationKind: 'hours_sign_off',
        confirmedOn: '2026-09-10',
        hours: 4,
        note: null,
        learningActivityId: null,
        confirmedBy: 'p1',
      },
    ];
    expect(learningCoachService.sumSignedHours(rows, '2026-09-21', '2026-09-27')).toBe(3.5);
    expect(learningCoachService.sumSignedHours(rows, '2026-09-01', '2026-09-30')).toBe(7.5);
  });
});
