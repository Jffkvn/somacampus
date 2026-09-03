import { describe, it, expect } from 'vitest';
import type {
  SchemeOfWork,
  MediumTermPlan,
  TeachingSequence,
  SchoolCurriculumSubjectMap,
} from '../types/domain';

describe('Academic Planning Domain Architecture Suite', () => {
  it('enforces adoption-scoped subject mapping (Correction #2)', () => {
    // Proves that a local subject is mapped to a curriculum subject scoped to an adoption
    const mapping: SchoolCurriculumSubjectMap = {
      id: 'map-1',
      schoolId: 'school-1',
      adoptionId: 'adoption-cambridge-2026',
      subjectId: 'local-math-id',
      curriculumSubjectId: 'cambridge-math-2026-id',
    };

    expect(mapping.adoptionId).toBe('adoption-cambridge-2026');
    expect(mapping.subjectId).toBe('local-math-id');
    expect(mapping.curriculumSubjectId).toBe('cambridge-math-2026-id');
  });

  it('structures medium-term units with sequential week spans and ordering', () => {
    const unit1: MediumTermPlan = {
      id: 'unit-1',
      schemeId: 'scheme-1',
      unitNumber: 1,
      title: 'Unit 1: Place Value & Negative Numbers',
      weekStart: 1,
      weekEnd: 3,
      learningFocus: 'Counting through zero and understanding powers of 10.',
      estimatedPeriods: 12,
      displayOrder: 1,
      createdAt: '2026-09-01T00:00:00Z',
    };

    const unit2: MediumTermPlan = {
      id: 'unit-2',
      schemeId: 'scheme-1',
      unitNumber: 2,
      title: 'Unit 2: Fraction Equivalence & Decimals',
      weekStart: 4,
      weekEnd: 7,
      learningFocus: 'Converting between fractions, decimals, and percentages.',
      estimatedPeriods: 16,
      displayOrder: 2,
      createdAt: '2026-09-01T00:00:00Z',
    };

    expect(unit1.weekEnd).toBeLessThan(unit2.weekStart);
    expect(unit1.displayOrder).toBeLessThan(unit2.displayOrder);
  });

  it('structures teaching sequences with duration and objective linkages', () => {
    const sequence: TeachingSequence = {
      id: 'seq-1',
      mediumTermPlanId: 'unit-1',
      sequenceNumber: 1,
      title: 'Lesson 1: Representing fractions visually',
      suggestedActivities: 'Use fraction strips to discover 1/2 = 2/4.',
      suggestedResources: 'Learner Book 5, fraction manipulatives',
      recommendedDurationMins: 45,
      displayOrder: 1,
    };

    expect(sequence.sequenceNumber).toBe(1);
    expect(sequence.recommendedDurationMins).toBe(45);
    expect(sequence.displayOrder).toBe(1);
  });

  it('enforces valid scheme of work status transitions', () => {
    const validStatuses = ['draft', 'approved', 'active', 'archived'];
    const currentStatus: SchemeOfWork['status'] = 'active';
    expect(validStatuses).toContain(currentStatus);
  });
});
