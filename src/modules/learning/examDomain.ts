/**
 * P3-B exam sitting + human mark entry (pure helpers).
 * Sitting is a container around results — never an exam hall.
 */

export type ExamDelivery = 'in_person_only' | 'pdf_allowed';
export type ExamStatus = 'draft' | 'marks_entered' | 'finalised';

export interface ExamSitting {
  id: string;
  schoolId: string;
  subjectId: string | null;
  classId: string | null;
  termLabel: string;
  title: string;
  examDate: string | null;
  maxMarks: number;
  venueNote: string | null;
  delivery: ExamDelivery;
  status: ExamStatus;
}

export interface ExamCandidate {
  studentId: string;
  studentName?: string | null;
  score: number | null;
  note?: string | null;
}

export function validateSitting(input: {
  title: string;
  termLabel: string;
  maxMarks: number;
  delivery?: ExamDelivery;
}): void {
  if (!input.title?.trim()) throw new Error('exam: title is required');
  if (!input.termLabel?.trim()) throw new Error('exam: termLabel is required');
  if (!(input.maxMarks > 0)) throw new Error('exam: maxMarks must be > 0');
  if (input.delivery && !['in_person_only', 'pdf_allowed'].includes(input.delivery)) {
    throw new Error('exam: delivery must be in_person_only or pdf_allowed');
  }
}

export function validateMark(score: number | null, maxMarks: number): void {
  if (score == null || Number.isNaN(Number(score))) {
    throw new Error('exam: score is required (human mark)');
  }
  if (Number(score) < 0 || Number(score) > maxMarks) {
    throw new Error(`exam: score must be between 0 and ${maxMarks}`);
  }
}

export function sittingStatusFromMarks(
  current: ExamStatus,
  candidates: ExamCandidate[],
): ExamStatus {
  if (current === 'finalised') return current;
  const any = candidates.some((c) => c.score != null);
  return any ? 'marks_entered' : 'draft';
}

export function pctFor(score: number | null, maxMarks: number): number | null {
  if (score == null || maxMarks <= 0) return null;
  return Math.round((score / maxMarks) * 1000) / 10;
}
