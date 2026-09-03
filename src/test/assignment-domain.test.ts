import { describe, it, expect } from 'vitest';
import {
  validateAssignmentPayload,
  computeSubmissionMetrics,
  isFormalTrack,
  formatWorkReferenceLabel,
  type CreateAssignmentPayload,
} from '../modules/teaching/assignmentDomain';

describe('Assignment Domain Logic Suite', () => {
  const baseValidPayload: CreateAssignmentPayload = {
    schoolId: 'school-1',
    teacherId: 'teacher-1',
    classId: 'class-1',
    streamId: 'stream-1',
    subjectId: 'subject-1',
    lessonId: 'lesson-1',
    title: 'Fractions Practice Worksheet',
    instructions: 'Complete exercises 1 to 5 on page 42.',
    assignedDate: '2026-09-05',
    dueDate: '2026-09-07',
    submissionType: 'homework',
    evidenceTrack: 'diagnostic_evidence',
    maxScore: null,
  };

  it('validates a valid diagnostic assignment payload', () => {
    const res = validateAssignmentPayload(baseValidPayload);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects an assignment when due date is earlier than assigned date', () => {
    const res = validateAssignmentPayload({
      ...baseValidPayload,
      assignedDate: '2026-09-05',
      dueDate: '2026-09-04',
    });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Due date cannot be earlier than assigned date');
  });

  it('enforces single source of truth: formal graded work MUST specify a positive maxScore', () => {
    const invalidFormal = validateAssignmentPayload({
      ...baseValidPayload,
      evidenceTrack: 'formal_graded',
      maxScore: null,
    });
    expect(invalidFormal.isValid).toBe(false);
    expect(invalidFormal.errors).toContain('Formal graded assignments must have a maximum score greater than 0');

    const validFormal = validateAssignmentPayload({
      ...baseValidPayload,
      evidenceTrack: 'formal_graded',
      maxScore: 20,
    });
    expect(validFormal.isValid).toBe(true);
  });

  it('isFormalTrack returns true only for formal_graded assignments', () => {
    expect(isFormalTrack({ evidenceTrack: 'formal_graded' })).toBe(true);
    expect(isFormalTrack({ evidenceTrack: 'diagnostic_evidence' })).toBe(false);
  });

  it('correctly calculates participation vs submission metrics (CRITICAL PRODUCT RULE 5)', () => {
    // 20 students assigned:
    // 16 expected + submitted
    // 2 expected + missing
    // 1 excused + not submitted
    // 1 not_required
    const mockRoster = [
      ...Array.from({ length: 16 }, () => ({
        participationStatus: 'expected' as const,
        submissionStatus: 'submitted' as const,
        teacherReviewStatus: 'reviewed' as const,
      })),
      {
        participationStatus: 'expected' as const,
        submissionStatus: 'missing' as const,
        teacherReviewStatus: 'unreviewed' as const,
      },
      {
        participationStatus: 'expected' as const,
        submissionStatus: 'missing' as const,
        teacherReviewStatus: 'unreviewed' as const,
      },
      {
        participationStatus: 'excused' as const,
        submissionStatus: 'pending' as const,
        teacherReviewStatus: 'unreviewed' as const,
      },
      {
        participationStatus: 'not_required' as const,
        submissionStatus: 'pending' as const,
        teacherReviewStatus: 'unreviewed' as const,
      },
    ];

    const metrics = computeSubmissionMetrics(mockRoster);
    expect(metrics.expectedCount).toBe(18);
    expect(metrics.submittedCount).toBe(16);
    expect(metrics.missingCount).toBe(2); // Only expected missing! Excused and not_required are NEVER counted as missing.
    expect(metrics.excusedCount).toBe(1);
    expect(metrics.notRequiredCount).toBe(1);
    expect(metrics.reviewedCount).toBe(16);
  });

  it('formats work reference labels across extensible work types', () => {
    expect(
      formatWorkReferenceLabel({ workType: 'notebook', workReferenceLocation: 'Page 35, Ex 2' })
    ).toBe('Notebook: Page 35, Ex 2');

    expect(
      formatWorkReferenceLabel({ workType: 'oral' })
    ).toBe('Oral Presentation / Classroom recitation');

    expect(
      formatWorkReferenceLabel({ workType: 'photo_reference', workReferenceLocation: 'desk_photo_01.jpg' })
    ).toBe('Photo Work: desk_photo_01.jpg');

    expect(
      formatWorkReferenceLabel({ workType: 'written', workSummary: 'Answered in workbook' })
    ).toBe('Answered in workbook');
  });
});
