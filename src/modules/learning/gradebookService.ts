/**
 * Digital Learning Spine — rubric marking + minimal gradebook (M5).
 *
 * Charter: docs/plans/2026-09-22-digital-learning-spine.md §10
 * AI never writes score/grade/marks. Teacher owns every human-marked result.
 * Score is the deterministic sum of selected criterion level points.
 */
import { supabase } from '../../lib/supabase';

export interface RubricLevel {
  value: number;
  label: string;
  points: number;
}

export interface RubricCriterion {
  id: string;
  title: string;
  /** P2A-3 explicit weight (default 1). Total = Σ(points × weight). */
  weight?: number;
  levels: RubricLevel[];
}

export interface LearningRubric {
  id: string;
  schoolId: string;
  title: string;
  description: string | null;
  criteria: RubricCriterion[];
  isActive: boolean;
}

export interface RubricMark {
  criterionId: string;
  criterionTitle: string;
  level: number;
  label: string;
  points: number;
  weight?: number;
  /** Criterion ceiling (max level points) — never derived from earned points. */
  maxPoints?: number;
  comment?: string | null;
  evidencePath?: string | null;
}

export interface LearningResult {
  id: string;
  schoolId: string;
  studentId: string;
  learningActivityId: string | null;
  assignmentId: string | null;
  submissionId: string | null;
  learningRubricId: string | null;
  resultSource: 'rubric' | 'score' | 'observation' | 'quiz';
  score: number | null;
  maxScore: number | null;
  feedback: string | null;
  rubricMarks: RubricMark[] | null;
  markedBy: string;
  markedAt: string;
}

export interface RecordResultInput {
  schoolId: string;
  studentId: string;
  markedBy: string;
  learningActivityId?: string | null;
  assignmentId?: string | null;
  submissionId?: string | null;
  learningRubricId?: string | null;
  resultSource?: 'rubric' | 'score' | 'observation';
  score?: number | null;
  maxScore?: number | null;
  feedback?: string | null;
  rubricMarks?: RubricMark[] | null;
}

/** Deterministic weighted total (weight defaults to 1). Never AI-inferred. */
export function computeRubricTotal(marks: RubricMark[] | null | undefined): number {
  if (!marks?.length) return 0;
  return marks.reduce((sum, m) => {
    const w = m.weight == null ? 1 : Number(m.weight);
    return sum + (Number(m.points) || 0) * w;
  }, 0);
}

/** Teacher taps one level per criterion → normalized mark rows. */
export function buildRubricMarks(
  criteria: RubricCriterion[],
  selected: Record<string, number>,
): RubricMark[] {
  const marks: RubricMark[] = [];
  for (const c of criteria) {
    const levelValue = selected[c.id];
    if (levelValue === undefined || levelValue === null) continue;
    const level = c.levels.find((l) => l.value === levelValue);
    if (!level) continue;
    const maxPoints = Math.max(...c.levels.map((l) => Number(l.points) || 0), 0);
    marks.push({
      criterionId: c.id,
      criterionTitle: c.title,
      level: level.value,
      label: level.label,
      points: level.points,
      weight: c.weight == null ? 1 : Number(c.weight),
      maxPoints,
    });
  }
  return marks;
}

function mapRubric(r: any): LearningRubric {
  return {
    id: r.id,
    schoolId: r.school_id,
    title: r.title,
    description: r.description ?? null,
    criteria: (r.criteria ?? []).map((c: any) => ({
      id: c.id,
      title: c.title,
      levels: (c.levels ?? []).map((l: any) => ({
        value: Number(l.value),
        label: l.label,
        points: Number(l.points),
      })),
    })),
    isActive: Boolean(r.is_active),
  };
}

function mapResult(r: any): LearningResult {
  return {
    id: r.id,
    schoolId: r.school_id,
    studentId: r.student_id,
    learningActivityId: r.learning_activity_id ?? null,
    assignmentId: r.assignment_id ?? null,
    submissionId: r.submission_id ?? null,
    learningRubricId: r.learning_rubric_id ?? null,
    resultSource: r.result_source,
    score: r.score === null || r.score === undefined ? null : Number(r.score),
    maxScore: r.max_score === null || r.max_score === undefined ? null : Number(r.max_score),
    feedback: r.feedback ?? null,
    rubricMarks: r.rubric_marks ?? null,
    markedBy: r.marked_by,
    markedAt: r.marked_at,
  };
}

export const gradebookService = {
  async createRubric(input: {
    schoolId: string;
    title: string;
    description?: string | null;
    criteria: RubricCriterion[];
    createdBy?: string | null;
  }): Promise<LearningRubric> {
    if (!input.title?.trim()) throw new Error('gradebook.createRubric: title is required');
    if (!input.criteria?.length) throw new Error('gradebook.createRubric: criteria are required');

    const { data, error } = await supabase
      .from('learning_rubrics')
      .insert({
        school_id: input.schoolId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        criteria: input.criteria,
        created_by: input.createdBy ?? null,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`gradebook.createRubric: ${error?.message ?? 'no row'}`);
    return mapRubric(data);
  },

  async listRubrics(schoolId: string): Promise<LearningRubric[]> {
    const { data, error } = await supabase
      .from('learning_rubrics')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`gradebook.listRubrics: ${error.message}`);
    return (data ?? []).map(mapRubric);
  },

  /**
   * Record a teacher-owned result. Score for rubric marks is computed
   * deterministically here and re-checked by the RPC — never AI-written.
   */
  async recordResult(input: RecordResultInput): Promise<LearningResult> {
    if (!input.learningActivityId && !input.assignmentId) {
      throw new Error('gradebook.recordResult: learningActivityId or assignmentId is required');
    }
    const resultSource = input.resultSource ?? (input.rubricMarks?.length ? 'rubric' : 'score');
    const localScore =
      resultSource === 'rubric' ? computeRubricTotal(input.rubricMarks) : (input.score ?? null);

    const { data, error } = await supabase.rpc('record_learning_result', {
      p_school_id: input.schoolId,
      p_student_id: input.studentId,
      p_marked_by: input.markedBy,
      p_learning_activity_id: input.learningActivityId ?? null,
      p_assignment_id: input.assignmentId ?? null,
      p_submission_id: input.submissionId ?? null,
      p_learning_rubric_id: input.learningRubricId ?? null,
      p_result_source: resultSource,
      p_score: localScore,
      p_max_score: input.maxScore ?? null,
      p_feedback: input.feedback ?? null,
      p_rubric_marks: input.rubricMarks ?? null,
    });
    if (error || !data) {
      throw new Error(`gradebook.recordResult: ${error?.message ?? 'no row'}`);
    }

    const { data: row, error: readErr } = await supabase
      .from('learning_results')
      .select('*')
      .eq('id', data)
      .maybeSingle();
    if (readErr) throw new Error(`gradebook.recordResult(read): ${readErr.message}`);
    return mapResult(row);
  },

  async listForStudent(studentId: string): Promise<LearningResult[]> {
    const { data, error } = await supabase
      .from('learning_results')
      .select('*')
      .eq('student_id', studentId)
      .order('marked_at', { ascending: false });
    if (error) throw new Error(`gradebook.listForStudent: ${error.message}`);
    return (data ?? []).map(mapResult);
  },

  async listForAssignment(assignmentId: string): Promise<LearningResult[]> {
    const { data, error } = await supabase
      .from('learning_results')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('marked_at', { ascending: false });
    if (error) throw new Error(`gradebook.listForAssignment: ${error.message}`);
    return (data ?? []).map(mapResult);
  },

  async listForActivity(learningActivityId: string): Promise<LearningResult[]> {
    const { data, error } = await supabase
      .from('learning_results')
      .select('*')
      .eq('learning_activity_id', learningActivityId)
      .order('marked_at', { ascending: false });
    if (error) throw new Error(`gradebook.listForActivity: ${error.message}`);
    return (data ?? []).map(mapResult);
  },

  /** P2A-3: teacher revise = new row + reason (history kept). */
  async reviseResult(input: {
    resultId: string;
    score?: number | null;
    feedback?: string | null;
    rubricMarks?: RubricMark[] | null;
    reason: string;
  }): Promise<string> {
    if (!input.reason?.trim()) {
      throw new Error('gradebook.reviseResult: override reason is required');
    }
    if (isMockEnv()) throw new Error('gradebook.reviseResult: unavailable without live database');
    const { data, error } = await supabase.rpc('revise_learning_result', {
      p_result_id: input.resultId,
      p_score: input.score ?? null,
      p_feedback: input.feedback ?? null,
      p_rubric_marks: input.rubricMarks ?? null,
      p_reason: input.reason.trim(),
    });
    if (error || !data) throw new Error(`gradebook.reviseResult: ${error?.message ?? 'no row'}`);
    return String(data);
  },

  /** P2A-3: second teacher moderation (never automatic). */
  async moderateResult(input: {
    resultId: string;
    state: 'approved' | 'changes_requested';
    note?: string | null;
  }): Promise<void> {
    if (isMockEnv()) throw new Error('gradebook.moderateResult: unavailable without live database');
    const { error } = await supabase.rpc('moderate_learning_result', {
      p_result_id: input.resultId,
      p_state: input.state,
      p_note: input.note ?? null,
    });
    if (error) throw new Error(`gradebook.moderateResult: ${error.message}`);
  },
};

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');
