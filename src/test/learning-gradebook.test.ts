import { describe, it, expect } from 'vitest';
import {
  computeRubricTotal,
  buildRubricMarks,
  gradebookService,
} from '../modules/learning/gradebookService';
import type { RubricCriterion } from '../modules/learning/gradebookService';

describe('Digital Learning Spine — rubric marking (M5)', () => {
  const criteria: RubricCriterion[] = [
    {
      id: 'understanding',
      title: 'Understanding',
      levels: [
        { value: 0, label: 'Not yet', points: 0 },
        { value: 1, label: 'Developing', points: 1 },
        { value: 2, label: 'Secure', points: 2 },
        { value: 3, label: 'Excellent', points: 3 },
      ],
    },
    {
      id: 'method',
      title: 'Method',
      levels: [
        { value: 0, label: 'Not yet', points: 0 },
        { value: 1, label: 'Developing', points: 1 },
        { value: 2, label: 'Secure', points: 2 },
        { value: 3, label: 'Excellent', points: 3 },
      ],
    },
    {
      id: 'accuracy',
      title: 'Accuracy',
      levels: [
        { value: 0, label: 'Not yet', points: 0 },
        { value: 1, label: 'Developing', points: 1 },
        { value: 2, label: 'Secure', points: 2 },
        { value: 3, label: 'Excellent', points: 3 },
      ],
    },
  ];

  it('sums selected criterion level points deterministically', () => {
    const marks = buildRubricMarks(criteria, {
      understanding: 3,
      method: 3,
      accuracy: 2,
    });
    expect(marks).toHaveLength(3);
    expect(computeRubricTotal(marks)).toBe(8);
  });

  it('skips criteria the teacher did not tap', () => {
    const marks = buildRubricMarks(criteria, { understanding: 2 });
    expect(marks).toHaveLength(1);
    expect(computeRubricTotal(marks)).toBe(2);
  });

  it('returns zero for empty marks', () => {
    expect(computeRubricTotal([])).toBe(0);
    expect(computeRubricTotal(null)).toBe(0);
  });

  it('rejects recording without an activity or assignment target', async () => {
    await expect(
      gradebookService.recordResult({
        schoolId: 's1',
        studentId: 'stu-1',
        markedBy: 't1',
        feedback: 'Good effort',
      }),
    ).rejects.toThrow(/learningActivityId or assignmentId is required/);
  });

  it('derives score from rubric marks when resultSource is rubric', () => {
    const marks = buildRubricMarks(criteria, { understanding: 1, method: 1, accuracy: 1 });
    // AI rule: score is only the sum of teacher-tapped points.
    expect(computeRubricTotal(marks)).toBe(3);
  });

  it('P2A-3 weighted total is explicit and deterministic', () => {
    expect(
      computeRubricTotal([
        { criterionId: 'a', criterionTitle: 'A', level: 2, label: 'S', points: 2, weight: 2 },
        { criterionId: 'b', criterionTitle: 'B', level: 1, label: 'D', points: 1, weight: 1 },
      ]),
    ).toBe(5);
  });
});
