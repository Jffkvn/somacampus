/**
 * P3-C issued term reports — immutable snapshots.
 * Live academic data ≠ issued historical document.
 */
import { supabase } from '../../lib/supabase';
import {
  buildTermOverall,
  type GradingScale,
  type SubjectMark,
  type TermOverall,
} from './gradingDomain';

export type ReportKind = 'term_report' | 'results_slip';

export interface IssuedReport {
  id: string;
  schoolId: string;
  studentId: string;
  termLabel: string;
  reportKind: ReportKind;
  snapshot: Record<string, unknown>;
  formula: GradingScale['formula'];
  overallValue: number | null;
  overallLabel: string | null;
  divisionLabel: string | null;
  issuedAt: string;
  version: number;
}

export interface ReportSnapshotInput {
  schoolName: string;
  learnerName: string;
  admissionNumber?: string | null;
  className?: string | null;
  termLabel: string;
  marks: SubjectMark[];
  teacherComment?: string | null;
  headComment?: string | null;
  attendance?: { presentDays?: number | null; absentDays?: number | null };
}

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

export function buildReportSnapshot(
  scale: GradingScale,
  input: ReportSnapshotInput,
): { snapshot: Record<string, unknown>; overall: TermOverall } {
  const overall = buildTermOverall(scale, input.marks);
  const snapshot = {
    kind: 'term_report' as const,
    schoolName: input.schoolName,
    learnerName: input.learnerName,
    admissionNumber: input.admissionNumber ?? null,
    className: input.className ?? null,
    termLabel: input.termLabel,
    formula: overall.formula,
    subjects: overall.subjects,
    overallValue: overall.value,
    overallLabel: overall.label,
    divisionLabel: overall.division,
    teacherComment: input.teacherComment ?? null,
    headComment: input.headComment ?? null,
    attendance: input.attendance ?? null,
    issuedFrom: 'learning_results+grading_scales',
  };
  return { snapshot, overall };
}

function mapIssued(r: any): IssuedReport {
  return {
    id: r.id,
    schoolId: r.school_id,
    studentId: r.student_id,
    termLabel: r.term_label,
    reportKind: r.report_kind,
    snapshot: r.snapshot ?? {},
    formula: r.formula,
    overallValue: r.overall_value == null ? null : Number(r.overall_value),
    overallLabel: r.overall_label ?? null,
    divisionLabel: r.division_label ?? null,
    issuedAt: r.issued_at,
    version: Number(r.version ?? 1),
  };
}

export const issuedReportService = {
  async issue(input: {
    schoolId: string;
    studentId: string;
    scale: GradingScale;
    report: ReportSnapshotInput;
    reportKind?: ReportKind;
  }): Promise<IssuedReport> {
    const { snapshot, overall } = buildReportSnapshot(input.scale, input.report);
    if (isMockEnv()) throw new Error('issuedReport.issue: unavailable without live database');
    const { data, error } = await supabase.rpc('issue_term_report', {
      p_school_id: input.schoolId,
      p_student_id: input.studentId,
      p_term_label: input.report.termLabel,
      p_report_kind: input.reportKind ?? 'term_report',
      p_snapshot: snapshot,
      p_formula: overall.formula,
      p_overall_value: overall.value,
      p_overall_label: overall.label,
      p_division_label: overall.division,
    });
    if (error || !data) throw new Error(`issuedReport.issue: ${error?.message ?? 'no row'}`);
    const { data: row, error: readErr } = await supabase
      .from('issued_reports')
      .select('*')
      .eq('id', data)
      .maybeSingle();
    if (readErr) throw new Error(`issuedReport.issue(read): ${readErr.message}`);
    return mapIssued(row);
  },

  async listForStudent(studentId: string): Promise<IssuedReport[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('issued_reports')
      .select('*')
      .eq('student_id', studentId)
      .order('issued_at', { ascending: false });
    if (error) throw new Error(`issuedReport.listForStudent: ${error.message}`);
    return (data ?? []).map(mapIssued);
  },

  async get(id: string): Promise<IssuedReport | null> {
    if (isMockEnv()) return null;
    const { data, error } = await supabase.from('issued_reports').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`issuedReport.get: ${error.message}`);
    return data ? mapIssued(data) : null;
  },
};
