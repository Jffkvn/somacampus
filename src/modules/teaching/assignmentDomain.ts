import type {
  Assignment,
  StudentSubmission,
  EvidenceTrack,
  SubmissionType,
} from '../../types/domain';

export interface CreateAssignmentPayload {
  schoolId: string;
  teacherId: string;
  classId: string;
  streamId?: string | null;
  subjectId: string;
  lessonId?: string | null;
  title: string;
  instructions: string;
  assignedDate: string;
  dueDate: string;
  submissionType: SubmissionType;
  evidenceTrack: EvidenceTrack;
  maxScore?: number | null;
}

export function validateAssignmentPayload(payload: Partial<CreateAssignmentPayload>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!payload.title || !payload.title.trim()) {
    errors.push('Assignment title is required');
  }
  if (!payload.instructions || !payload.instructions.trim()) {
    errors.push('Instructions are required');
  }
  if (!payload.classId) {
    errors.push('Class is required');
  }
  if (!payload.subjectId) {
    errors.push('Subject is required');
  }
  if (!payload.assignedDate) {
    errors.push('Assigned date is required');
  }
  if (!payload.dueDate) {
    errors.push('Due date is required');
  }
  if (payload.assignedDate && payload.dueDate && payload.dueDate < payload.assignedDate) {
    errors.push('Due date cannot be earlier than assigned date');
  }
  if (!payload.submissionType) {
    errors.push('Submission type is required');
  }
  if (!payload.evidenceTrack) {
    errors.push('Evidence track is required');
  }

  // Single source of truth rule: formal graded assignments must declare a valid positive max score
  if (payload.evidenceTrack === 'formal_graded') {
    if (payload.maxScore === undefined || payload.maxScore === null || payload.maxScore <= 0) {
      errors.push('Formal graded assignments must have a maximum score greater than 0');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function computeSubmissionMetrics(submissions: Array<Pick<StudentSubmission, 'participationStatus' | 'submissionStatus' | 'teacherReviewStatus'>>): {
  expectedCount: number;
  submittedCount: number;
  missingCount: number;
  excusedCount: number;
  notRequiredCount: number;
  reviewedCount: number;
} {
  let expectedCount = 0;
  let submittedCount = 0;
  let missingCount = 0;
  let excusedCount = 0;
  let notRequiredCount = 0;
  let reviewedCount = 0;

  for (const s of submissions) {
    if (s.participationStatus === 'expected') {
      expectedCount++;
      if (s.submissionStatus === 'submitted' || s.submissionStatus === 'late') {
        submittedCount++;
      } else if (s.submissionStatus === 'missing') {
        missingCount++;
      }
    } else if (s.participationStatus === 'excused') {
      excusedCount++;
      if (s.submissionStatus === 'submitted' || s.submissionStatus === 'late') {
        submittedCount++;
      }
    } else if (s.participationStatus === 'not_required') {
      notRequiredCount++;
    }

    if (s.teacherReviewStatus === 'reviewed') {
      reviewedCount++;
    }
  }

  return {
    expectedCount,
    submittedCount,
    missingCount,
    excusedCount,
    notRequiredCount,
    reviewedCount,
  };
}

export function isFormalTrack(assignment: Pick<Assignment, 'evidenceTrack'>): boolean {
  return assignment.evidenceTrack === 'formal_graded';
}

export function formatWorkReferenceLabel(sub: Pick<StudentSubmission, 'workType' | 'workReferenceLocation' | 'workSummary'>): string {
  if (sub.workSummary) return sub.workSummary;
  switch (sub.workType) {
    case 'notebook':
      return sub.workReferenceLocation ? `Notebook: ${sub.workReferenceLocation}` : 'Physical Notebook Work';
    case 'oral':
      return 'Oral Presentation / Classroom recitation';
    case 'photo_reference':
      return sub.workReferenceLocation ? `Photo Work: ${sub.workReferenceLocation}` : 'Photographed Student Work';
    case 'file_reference':
      return sub.workReferenceLocation ? `File: ${sub.workReferenceLocation}` : 'Document Submission';
    case 'captured_evidence':
      return 'Captured Classroom Evidence';
    case 'written':
    default:
      return 'Written Sheet / Classwork';
  }
}
