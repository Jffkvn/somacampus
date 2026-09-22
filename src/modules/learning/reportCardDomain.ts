/**
 * P2C-1 report cards — pure assembly from the live academic record.
 * One gradebook. No second reporting system. Progress ≠ completion.
 * If evidence is thin, say so (never invent mastery).
 */

export interface ObjectiveScore {
  objectiveCode: string | null;
  objectiveTitle: string | null;
  score: number | null;
  maxScore: number | null;
  pct: number | null;
  evidenceCount: number;
}

export interface ReportAssessmentLine {
  title: string;
  resultSource: string;
  score: number | null;
  maxScore: number | null;
  feedback: string | null;
  markedAt: string | null;
}

export interface SubjectReport {
  subjectName: string;
  averagePct: number | null;
  objectives: ObjectiveScore[];
  assessments: ReportAssessmentLine[];
  strengths: string[];
  nextSteps: string[];
  /** Honest when there is not enough scored work. */
  evidenceLevel: 'strong' | 'thin' | 'none';
}

export interface TermReportCard {
  schoolName: string;
  learnerName: string;
  admissionNumber: string | null;
  termLabel: string;
  generatedAt: string;
  subjects: SubjectReport[];
  teacherComment: string | null;
  engagementNotes: string[];
  attendance: {
    presentDays: number | null;
    absentDays: number | null;
    note: string;
  };
}

export function pct(score: number | null, maxScore: number | null): number | null {
  if (score == null || maxScore == null || maxScore <= 0) return null;
  return Math.round((score / maxScore) * 1000) / 10;
}

export function evidenceLevelFor(count: number): SubjectReport['evidenceLevel'] {
  if (count <= 0) return 'none';
  if (count < 3) return 'thin';
  return 'strong';
}

/** Strengths / next steps from objective pct — deterministic, no AI grades. */
export function deriveStrengthsAndNextSteps(objectives: ObjectiveScore[]): {
  strengths: string[];
  nextSteps: string[];
} {
  const labeled = objectives.filter((o) => o.pct != null);
  const strengths = labeled
    .filter((o) => o.pct! >= 75)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, 3)
    .map((o) => o.objectiveTitle ?? o.objectiveCode ?? 'Objective');
  const nextSteps = labeled
    .filter((o) => o.pct! < 60)
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))
    .slice(0, 3)
    .map((o) => o.objectiveTitle ?? o.objectiveCode ?? 'Objective');
  return { strengths, nextSteps };
}

export function averagePct(objectives: ObjectiveScore[]): number | null {
  const vals = objectives.map((o) => o.pct).filter((p): p is number => p != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export function buildSubjectReport(input: {
  subjectName: string;
  objectives: ObjectiveScore[];
  assessments: ReportAssessmentLine[];
}): SubjectReport {
  const { strengths, nextSteps } = deriveStrengthsAndNextSteps(input.objectives);
  const evidenceCount = input.assessments.filter((a) => a.score != null).length;
  const fromObjectives = averagePct(input.objectives);
  const assessmentPcts = input.assessments
    .map((a) => pct(a.score, a.maxScore))
    .filter((p): p is number => p != null);
  const fromAssessments = assessmentPcts.length
    ? Math.round((assessmentPcts.reduce((a, b) => a + b, 0) / assessmentPcts.length) * 10) / 10
    : null;
  return {
    subjectName: input.subjectName,
    averagePct: fromObjectives ?? fromAssessments,
    objectives: input.objectives,
    assessments: input.assessments,
    strengths,
    nextSteps,
    evidenceLevel: evidenceLevelFor(evidenceCount),
  };
}

export function buildTermReportCard(input: {
  schoolName: string;
  learnerName: string;
  admissionNumber?: string | null;
  termLabel: string;
  subjects: SubjectReport[];
  teacherComment?: string | null;
  engagementNotes?: string[];
  attendance?: { presentDays?: number | null; absentDays?: number | null };
}): TermReportCard {
  return {
    schoolName: input.schoolName,
    learnerName: input.learnerName,
    admissionNumber: input.admissionNumber ?? null,
    termLabel: input.termLabel,
    generatedAt: new Date().toISOString(),
    subjects: input.subjects,
    teacherComment: input.teacherComment?.trim() || null,
    engagementNotes: input.engagementNotes ?? [],
    attendance: {
      presentDays: input.attendance?.presentDays ?? null,
      absentDays: input.attendance?.absentDays ?? null,
      note: 'Attendance shown when the school records it for this term.',
    },
  };
}
