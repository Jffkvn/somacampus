import { describe, it, expect } from 'vitest';
import type { StudentIntervention } from '../types/domain';

describe('Intervention Curriculum Relational FK Architecture Suite (Correction #3)', () => {
  it('supports canonical curriculumObjectiveId UUID on StudentIntervention domain model', () => {
    const intervention: StudentIntervention = {
      id: 'intervention-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      teacherId: 'teacher-1',
      classId: 'class-1',
      subjectId: 'subject-1',
      learningArea: 'Fractions & Percentages',
      curriculumObjectiveId: '4c9247e3-4d1e-4d7b-91c7-9ffb88beebc1', // Canonical UUID FK
      curriculumObjectiveCode: '5Nn.01',
      curriculumObjectiveTitle: 'Understand and convert equivalent fractions',
      reason: 'Friction identifying common denominators in word problems',
      strategyAction: 'Targeted small-group intervention using fraction walls',
      targetOutcome: '80% accuracy on fraction conversion assessment',
      startDate: '2026-09-01',
      targetDate: '2026-09-20',
      status: 'active',
      evidenceReferences: [],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    };

    expect(intervention.curriculumObjectiveId).toBe('4c9247e3-4d1e-4d7b-91c7-9ffb88beebc1');
    expect(intervention.curriculumObjectiveCode).toBe('5Nn.01');
    expect(intervention.curriculumObjectiveTitle).toBe('Understand and convert equivalent fractions');
  });

  it('maintains backwards compatibility for deprecated curriculumObjectiveRef during migration', () => {
    const legacyIntervention: StudentIntervention = {
      id: 'legacy-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      teacherId: 'teacher-1',
      classId: 'class-1',
      subjectId: 'subject-1',
      learningArea: 'Fractions',
      curriculumObjectiveRef: '5Nn.01', // Legacy text representation
      reason: 'Legacy support test',
      strategyAction: 'Practice worksheets',
      targetOutcome: 'Concept mastery',
      startDate: '2026-08-01',
      targetDate: '2026-08-20',
      status: 'completed',
      evidenceReferences: [],
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    };

    expect(legacyIntervention.curriculumObjectiveRef).toBe('5Nn.01');
    expect(legacyIntervention.curriculumObjectiveId).toBeUndefined();
  });
});
