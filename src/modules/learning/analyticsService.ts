/**
 * P2B-1 analytics service — reads the academic record and attaches
 * EvidenceRef rows to every claim. Never invents scores (AI-free).
 */
import { supabase } from '../../lib/supabase';
import {
  buildStudentAnalytics,
  type EvidenceRef,
  type StudentAnalytics,
} from './analyticsDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

export const analyticsService = {
  /**
   * Teacher-facing student analytics with evidence citations.
   * expectedCount = roster rows (student_submissions) for this school's assignments.
   */
  async getStudentAnalytics(studentId: string, schoolId: string): Promise<StudentAnalytics> {
    if (isMockEnv()) {
      return buildStudentAnalytics({ studentId, expectedCount: 0, resultRows: [], objectives: [] });
    }

    const { data: results, error: resErr } = await supabase
      .from('learning_results')
      .select(
        'id, score, max_score, marked_at, result_source, feedback, learning_activity_id, assignment_id, quiz_id, rubric_marks, activity:learning_activities!learning_results_learning_activity_id_fkey(title)',
      )
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .order('marked_at', { ascending: false })
      .limit(50);
    if (resErr) throw new Error(`analytics.results: ${resErr.message}`);

    const { data: roster, error: rosErr } = await supabase
      .from('student_submissions')
      .select('id, assignment_id')
      .eq('school_id', schoolId)
      .eq('student_id', studentId);
    if (rosErr) throw new Error(`analytics.roster: ${rosErr.message}`);

    const resultRows = ((results ?? []) as any[]).map((r) => {
      const activity = Array.isArray(r.activity) ? r.activity[0] : r.activity;
      return {
        id: String(r.id),
        score: r.score == null ? null : Number(r.score),
        maxScore: r.max_score == null ? null : Number(r.max_score),
        label: activity?.title
          ? String(activity.title)
          : r.quiz_id
            ? 'Quiz'
            : r.assignment_id
              ? 'Assignment'
              : 'Result',
        at: r.marked_at ? String(r.marked_at) : null,
        rubricMarks: Array.isArray(r.rubric_marks) ? r.rubric_marks : [],
      };
    });

    // Objective rows from rubric_marks (same chain as report cards).
    type Obj = StudentAnalytics['objectives'][number];
    const objAcc = new Map<string, Obj>();
    for (const row of resultRows) {
      for (const m of row.rubricMarks as any[]) {
        const code = String(m.criterionId ?? m.criterionTitle ?? 'criterion');
        const prev =
          objAcc.get(code) ??
          ({
            objectiveCode: code,
            objectiveTitle: m.criterionTitle ? String(m.criterionTitle) : null,
            pct: null,
            evidenceCount: 0,
            evidence: [] as EvidenceRef[],
          } as Obj);
        prev.evidenceCount += 1;
        prev.evidence.push({
          kind: 'learning_result',
          id: row.id,
          label: row.label,
          at: row.at,
        });
        objAcc.set(code, prev);
      }
    }

    return buildStudentAnalytics({
      studentId,
      expectedCount: ((roster ?? []) as any[]).length,
      resultRows,
      objectives: [...objAcc.values()],
    });
  },
};
