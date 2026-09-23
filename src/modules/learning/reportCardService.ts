/**
 * P2C-1 report card service — reads the one academic record
 * (learning_results + learning_activities + teacher_observations).
 * Never invents scores; thin evidence stays thin.
 */
import { supabase } from '../../lib/supabase';
import {
  buildSubjectReport,
  buildTermReportCard,
  pct,
  type ObjectiveScore,
  type ReportAssessmentLine,
  type SubjectReport,
  type TermReportCard,
} from './reportCardDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

async function resolveStudentId(studentIdOrEmail: string): Promise<string> {
  const isUUID = (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  if (isUUID(studentIdOrEmail)) return studentIdOrEmail;
  const { data: people, error } = await supabase.from('people').select('id').eq('email', studentIdOrEmail);
  if (error) throw new Error(`reportCard.resolveStudentId: ${error.message}`);
  const ids = [...new Set(((people ?? []) as any[]).map((p) => String(p.id)))];
  if (!ids.length) throw new Error(`reportCard: no person for ${studentIdOrEmail}`);
  const { data: students, error: sErr } = await supabase.from('students').select('id, admission_number').in('person_id', ids);
  if (sErr) throw new Error(`reportCard.resolveStudentId(students): ${sErr.message}`);
  const rows = (students ?? []) as any[];
  if (rows.length !== 1) throw new Error(`reportCard: cannot resolve unique student for ${studentIdOrEmail}`);
  return String(rows[0].id);
}

/**
 * H2: resolve the reporting window from the school's academic year (is_current).
 * Never invent a rolling 90-day "term". Fallback is labelled honestly.
 */
export async function currentAcademicWindow(schoolId: string): Promise<{
  fromIso: string;
  toIso: string;
  termLabel: string;
}> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const canQuery =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as any).env?.VITE_SUPABASE_URL) &&
    !(import.meta as any).env?.VITE_SUPABASE_URL?.includes('placeholder');
  if (canQuery) {
    const { data: year, error } = await supabase
      .from('academic_years')
      .select('id, name, start_date, end_date')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .maybeSingle();
    if (!error && year) {
      return {
        fromIso: String(year.start_date).slice(0, 10),
        toIso: String(year.end_date).slice(0, 10),
        termLabel: String(year.name),
      };
    }
  }
  const from = new Date(now.getTime() - 90 * 86400000);
  return {
    fromIso: iso(from),
    toIso: iso(now),
    termLabel: `Fallback window ${iso(from)} → ${iso(now)} (no current academic year)`,
  };
}

export const reportCardService = {
  /**
   * Build a term report for one learner from live rows only.
   * Grouping: subject name on activities/assignments (fallback "General").
   */
  async buildForStudent(input: {
    studentIdOrEmail: string;
    schoolId: string;
    schoolName: string;
    termLabel: string;
    fromIso: string;
    toIso: string;
    teacherComment?: string | null;
    engagementNotes?: string[];
    attendance?: { presentDays?: number | null; absentDays?: number | null };
  }): Promise<TermReportCard> {
    if (isMockEnv()) {
      return buildTermReportCard({
        schoolName: input.schoolName,
        learnerName: 'Learner',
        termLabel: input.termLabel,
        subjects: [],
        teacherComment: input.teacherComment ?? null,
      });
    }

    const studentId = await resolveStudentId(input.studentIdOrEmail);
    const { data: studentRow, error: stErr } = await supabase
      .from('students')
      .select('id, admission_number, person:people!students_person_id_fkey(first_name, last_name)')
      .eq('id', studentId)
      .maybeSingle();
    if (stErr) throw new Error(`reportCard.student: ${stErr.message}`);
    const person = Array.isArray(studentRow?.person) ? studentRow.person[0] : studentRow?.person;
    const learnerName = [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim() || 'Learner';

    const { data: results, error: resErr } = await supabase
      .from('learning_results')
      .select(
        'id, score, max_score, feedback, marked_at, result_source, learning_activity_id, assignment_id, rubric_marks, activity:learning_activities!learning_results_learning_activity_id_fkey(id, title, activity_type), assignment:assignments!learning_results_assignment_id_fkey(id, title, subjects(name))',
      )
      .eq('school_id', input.schoolId)
      .eq('student_id', studentId)
      .gte('marked_at', `${input.fromIso}T00:00:00Z`)
      .lte('marked_at', `${input.toIso}T23:59:59Z`)
      .order('marked_at', { ascending: true });
    if (resErr) throw new Error(`reportCard.results: ${resErr.message}`);

    const rows = ((results ?? []) as any[]) ?? [];
    type Bucket = { subjectName: string; objectives: Map<string, ObjectiveScore>; assessments: ReportAssessmentLine[] };
    const buckets = new Map<string, Bucket>();

    const bucketFor = (subjectName: string): Bucket => {
      let b = buckets.get(subjectName);
      if (!b) {
        b = { subjectName, objectives: new Map(), assessments: [] };
        buckets.set(subjectName, b);
      }
      return b;
    };

    for (const r of rows) {
      const activity = Array.isArray(r.activity) ? r.activity[0] : r.activity;
      const assignment = Array.isArray(r.assignment) ? r.assignment[0] : r.assignment;
      const subjectName =
        assignment?.subjects?.name ??
        (activity?.activity_type ? String(activity.activity_type) : 'General');
      const title = activity?.title ?? assignment?.title ?? 'Assessment';
      const b = bucketFor(String(subjectName));

      b.assessments.push({
        title: String(title),
        resultSource: String(r.result_source ?? 'score'),
        score: r.score == null ? null : Number(r.score),
        maxScore: r.max_score == null ? null : Number(r.max_score),
        feedback: r.feedback ? String(r.feedback) : null,
        markedAt: r.marked_at ? String(r.marked_at) : null,
      });

      // Objective rollup from rubric_marks criterion titles (deterministic).
      const marks = Array.isArray(r.rubric_marks) ? r.rubric_marks : [];
      for (const m of marks as any[]) {
        const code = m.criterionId ?? m.criterionTitle ?? 'criterion';
        const key = String(code);
        const prev =
          b.objectives.get(key) ??
          ({
            objectiveCode: m.criterionId ? String(m.criterionId) : null,
            objectiveTitle: m.criterionTitle ? String(m.criterionTitle) : String(code),
            score: 0,
            maxScore: 0,
            pct: null,
            evidenceCount: 0,
          } as ObjectiveScore);
        const earned = Number(m.points ?? 0);
        const w = m.weight == null ? 1 : Number(m.weight);
        // H1: ceiling must come from the rubric (maxPoints), never from earned points.
        const ceilingRaw = m.maxPoints != null ? Number(m.maxPoints) : null;
        prev.score = Number(prev.score ?? 0) + earned * w;
        if (ceilingRaw != null && ceilingRaw > 0) {
          prev.maxScore = Number(prev.maxScore ?? 0) + ceilingRaw * w;
        }
        prev.evidenceCount += 1;
        b.objectives.set(key, prev);
      }
    }

    const subjects: SubjectReport[] = [...buckets.values()].map((b) => {
      // Recompute pct per objective from assessment-level totals when present
      const objectives = [...b.objectives.values()].map((o) => {
        const max = o.maxScore != null && o.maxScore > 0 ? o.maxScore : null;
        return {
          ...o,
          maxScore: max,
          pct: pct(o.score, max),
        };
      });
      return buildSubjectReport({
        subjectName: b.subjectName,
        objectives,
        assessments: b.assessments,
      });
    });

    // H3: when the school has a grading scale, recompute subject grades via P3 engine.
    let finalSubjects = subjects;
    {
      const { data: scaleRow } = await supabase
        .from('grading_scales')
        .select('*')
        .eq('school_id', input.schoolId)
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (scaleRow) {
        const scale = {
          id: String(scaleRow.id),
          schoolId: String(scaleRow.school_id),
          name: String(scaleRow.name),
          formula: (scaleRow.formula ?? 'mean') as 'mean' | 'total' | 'aggregate_division',
          bands: Array.isArray(scaleRow.bands) ? scaleRow.bands : [],
          subjectWeights: scaleRow.subject_weights ?? {},
          divisions: Array.isArray(scaleRow.divisions) ? scaleRow.divisions : [],
          rounding: (scaleRow.rounding ?? 'whole') as 'whole' | 'one_decimal',
        };
        const { buildSubjectResults } = await import('./gradingDomain');
        finalSubjects = subjects.map((s) => {
          const graded = buildSubjectResults(
            scale,
            s.assessments
              .filter((a) => a.score != null && a.maxScore != null)
              .map((a) => ({
                subjectCode: s.subjectName,
                subjectName: s.subjectName,
                score: Number(a.score),
                maxScore: Number(a.maxScore),
              })),
          );
          if (!graded.length) return s;
          const pct = graded.reduce((a, g) => a + g.pct, 0) / graded.length;
          return {
            ...s,
            averagePct: Math.round(pct * 10) / 10,
            assessments: s.assessments.map((a, i) => ({
              ...a,
              // keep raw marks; grade columns live on graded[]
              ...{ _grade: graded[i]?.grade ?? null },
            })),
          };
        });
      }
    }

    return buildTermReportCard({
      schoolName: input.schoolName,
      learnerName,
      admissionNumber: studentRow?.admission_number ?? null,
      termLabel: input.termLabel,
      subjects: finalSubjects,
      teacherComment: input.teacherComment ?? null,
      engagementNotes: input.engagementNotes ?? [],
      attendance: input.attendance,
    });
  },
};
