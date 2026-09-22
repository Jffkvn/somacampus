/**
 * P3-F results slip — compact official output (print-first design).
 * Same gradebook + grading formula as term reports; slip is the
 * one-page “statement of results” a parent/bursar can file.
 */
import {
  buildTermOverall,
  type GradingScale,
  type SubjectMark,
  type TermOverall,
} from './gradingDomain';

export interface ResultsSlipInput {
  schoolName: string;
  schoolCode?: string | null;
  learnerName: string;
  admissionNumber?: string | null;
  className?: string | null;
  termLabel: string;
  examTitle?: string | null;
  marks: SubjectMark[];
  issuedByTitle?: string | null;
}

export interface ResultsSlipSnapshot {
  kind: 'results_slip';
  schoolName: string;
  schoolCode: string | null;
  learnerName: string;
  admissionNumber: string | null;
  className: string | null;
  termLabel: string;
  examTitle: string | null;
  formula: GradingScale['formula'];
  subjects: TermOverall['subjects'];
  overallValue: number | null;
  overallLabel: string | null;
  divisionLabel: string | null;
  issuedByTitle: string | null;
  footer: string;
}

/** One-page slip payload (frozen on issue — same immutability law). */
export function buildResultsSlip(
  scale: GradingScale,
  input: ResultsSlipInput,
): { snapshot: ResultsSlipSnapshot; overall: TermOverall } {
  const overall = buildTermOverall(scale, input.marks);
  const snapshot: ResultsSlipSnapshot = {
    kind: 'results_slip',
    schoolName: input.schoolName,
    schoolCode: input.schoolCode ?? null,
    learnerName: input.learnerName,
    admissionNumber: input.admissionNumber ?? null,
    className: input.className ?? null,
    termLabel: input.termLabel,
    examTitle: input.examTitle ?? null,
    formula: overall.formula,
    subjects: overall.subjects,
    overallValue: overall.value,
    overallLabel: overall.label,
    divisionLabel: overall.division,
    issuedByTitle: input.issuedByTitle ?? 'Head Teacher',
    footer: 'Official results slip · issued academic record · not a national examination certificate',
  };
  return { snapshot, overall };
}
