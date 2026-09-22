/**
 * P2A-1 quiz service — bank, quizzes, attempts.
 * Submit scores via submit_learning_quiz_attempt RPC (deterministic keys).
 * AI never writes score/grade/marks.
 */
import { supabase } from '../../lib/supabase';
import {
  scoreQuiz,
  validateQuestionKey,
  type QuizAnswers,
  type QuizQuestion,
  type QuizQuestionType,
} from './quizDomain';

export interface LearningQuiz {
  id: string;
  schoolId: string;
  teachingSequenceId: string | null;
  onlineOfferingId: string | null;
  learningActivityId: string | null;
  title: string;
  instructions: string | null;
  passMark: number | null;
  maxAttempts: number;
  isPublished: boolean;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  studentId: string;
  attemptNo: number;
  state: 'draft' | 'submitted' | 'scored';
  answers: QuizAnswers;
  score: number | null;
  maxScore: number | null;
}

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapQuestion(r: any): QuizQuestion {
  return {
    id: r.id,
    questionType: r.question_type,
    prompt: r.prompt,
    options: r.options ?? [],
    answerKey: r.answer_key ?? {},
    defaultMarks: Number(r.default_marks ?? 1),
  };
}

function mapQuiz(r: any): LearningQuiz {
  return {
    id: r.id,
    schoolId: r.school_id,
    teachingSequenceId: r.teaching_sequence_id ?? null,
    onlineOfferingId: r.online_offering_id ?? null,
    learningActivityId: r.learning_activity_id ?? null,
    title: r.title,
    instructions: r.instructions ?? null,
    passMark: r.pass_mark == null ? null : Number(r.pass_mark),
    maxAttempts: Number(r.max_attempts ?? 1),
    isPublished: Boolean(r.is_published),
  };
}

function mapAttempt(r: any): QuizAttempt {
  return {
    id: r.id,
    quizId: r.quiz_id,
    studentId: r.student_id,
    attemptNo: Number(r.attempt_no ?? 1),
    state: r.state,
    answers: r.answers ?? {},
    score: r.score == null ? null : Number(r.score),
    maxScore: r.max_score == null ? null : Number(r.max_score),
  };
}

export const quizService = {
  async createQuestion(input: {
    schoolId: string;
    questionType: QuizQuestionType;
    prompt: string;
    options?: unknown;
    answerKey: Record<string, unknown>;
    defaultMarks?: number;
    createdBy?: string | null;
  }): Promise<QuizQuestion> {
    validateQuestionKey(input);
    if (isMockEnv()) throw new Error('quiz.createQuestion: unavailable without live database');
    const { data, error } = await supabase
      .from('learning_quiz_questions')
      .insert({
        school_id: input.schoolId,
        question_type: input.questionType,
        prompt: input.prompt.trim(),
        options: input.options ?? [],
        answer_key: input.answerKey,
        default_marks: input.defaultMarks ?? 1,
        created_by: input.createdBy ?? null,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`quiz.createQuestion: ${error?.message ?? 'no row'}`);
    return mapQuestion(data);
  },

  async listQuestions(schoolId: string): Promise<QuizQuestion[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('learning_quiz_questions')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`quiz.listQuestions: ${error.message}`);
    return (data ?? []).map(mapQuestion);
  },

  async createQuiz(input: {
    schoolId: string;
    title: string;
    instructions?: string | null;
    teachingSequenceId?: string | null;
    onlineOfferingId?: string | null;
    learningActivityId: string;
    passMark?: number | null;
    maxAttempts?: number;
    items: Array<{ questionId: string; marks?: number }>;
    isPublished?: boolean;
    createdBy?: string | null;
  }): Promise<LearningQuiz> {
    if (!input.title?.trim()) throw new Error('quiz.createQuiz: title is required');
    if (!input.learningActivityId) throw new Error('quiz.createQuiz: learningActivityId is required');
    if (!input.teachingSequenceId && !input.onlineOfferingId) {
      throw new Error('quiz.createQuiz: teachingSequenceId or onlineOfferingId is required');
    }
    if (!input.items?.length) throw new Error('quiz.createQuiz: at least one item is required');
    if (isMockEnv()) throw new Error('quiz.createQuiz: unavailable without live database');

    const { data, error } = await supabase
      .from('learning_quizzes')
      .insert({
        school_id: input.schoolId,
        title: input.title.trim(),
        instructions: input.instructions?.trim() || null,
        teaching_sequence_id: input.teachingSequenceId ?? null,
        online_offering_id: input.onlineOfferingId ?? null,
        learning_activity_id: input.learningActivityId,
        pass_mark: input.passMark ?? null,
        max_attempts: input.maxAttempts ?? 1,
        is_published: input.isPublished ?? true,
        created_by: input.createdBy ?? null,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`quiz.createQuiz: ${error?.message ?? 'no row'}`);
    const quiz = mapQuiz(data);

    const itemRows = input.items.map((it, i) => ({
      quiz_id: quiz.id,
      question_id: it.questionId,
      sort_order: i,
      marks: it.marks ?? 1,
    }));
    const { error: itemErr } = await supabase.from('learning_quiz_items').insert(itemRows);
    if (itemErr) throw new Error(`quiz.createQuiz(items): ${itemErr.message}`);
    return quiz;
  },

  /**
   * Load quiz + items for display. `includeAnswerKey` is teacher-only —
   * students must never receive keys (AI/learners never write or see grades).
   */
  async getQuizWithQuestions(
    quizId: string,
    opts: { includeAnswerKey?: boolean } = {},
  ): Promise<{
    quiz: LearningQuiz;
    items: Array<{ question: QuizQuestion; marks: number; sortOrder: number }>;
  } | null> {
    if (isMockEnv()) return null;
    const { data: quizRow, error } = await supabase
      .from('learning_quizzes')
      .select('*')
      .eq('id', quizId)
      .maybeSingle();
    if (error) throw new Error(`quiz.getQuiz: ${error.message}`);
    if (!quizRow) return null;

    const questionSelect = opts.includeAnswerKey
      ? 'question:learning_quiz_questions(*)'
      : 'question:learning_quiz_questions(id, question_type, prompt, options, default_marks)';
    const { data: itemRows, error: itemErr } = await supabase
      .from('learning_quiz_items')
      .select(`question_id, marks, sort_order, ${questionSelect}`)
      .eq('quiz_id', quizId)
      .order('sort_order', { ascending: true });
    if (itemErr) throw new Error(`quiz.getQuiz(items): ${itemErr.message}`);

    return {
      quiz: mapQuiz(quizRow),
      items: ((itemRows ?? []) as any[])
        .filter((r) => r.question)
        .map((r) => ({
          question: mapQuestion({ ...r.question, answer_key: r.question.answer_key ?? {} }),
          marks: Number(r.marks ?? 1),
          sortOrder: Number(r.sort_order ?? 0),
        })),
    };
  },

  /** Start (or resume) a draft attempt — weak-network friendly. */
  async startOrResumeAttempt(input: {
    schoolId: string;
    quizId: string;
    studentId: string;
  }): Promise<QuizAttempt> {
    if (isMockEnv()) throw new Error('quiz.startAttempt: unavailable without live database');
    const { data: attemptId, error } = await supabase.rpc('start_learning_quiz_attempt', {
      p_school_id: input.schoolId,
      p_quiz_id: input.quizId,
      p_student_id: input.studentId,
    });
    if (error || !attemptId) throw new Error(`quiz.startAttempt: ${error?.message ?? 'no row'}`);
    const { data, error: readErr } = await supabase
      .from('learning_quiz_attempts')
      .select('*')
      .eq('id', attemptId)
      .maybeSingle();
    if (readErr) throw new Error(`quiz.startAttempt(read): ${readErr.message}`);
    return mapAttempt(data);
  },

  async saveDraft(attemptId: string, answers: QuizAnswers): Promise<void> {
    if (isMockEnv()) throw new Error('quiz.saveDraft: unavailable without live database');
    const { error } = await supabase
      .from('learning_quiz_attempts')
      .update({ answers, updated_at: new Date().toISOString() })
      .eq('id', attemptId)
      .eq('state', 'draft');
    if (error) throw new Error(`quiz.saveDraft: ${error.message}`);
  },

  /** Submit → deterministic score → learning_results (result_source = quiz). */
  async submitAttempt(attemptId: string, answers: QuizAnswers): Promise<QuizAttempt> {
    if (isMockEnv()) throw new Error('quiz.submitAttempt: unavailable without live database');
    const { error } = await supabase.rpc('submit_learning_quiz_attempt', {
      p_attempt_id: attemptId,
      p_answers: answers,
    });
    if (error) throw new Error(`quiz.submitAttempt: ${error.message}`);
    const { data, error: readErr } = await supabase
      .from('learning_quiz_attempts')
      .select('*')
      .eq('id', attemptId)
      .maybeSingle();
    if (readErr) throw new Error(`quiz.submitAttempt(read): ${readErr.message}`);
    return mapAttempt(data);
  },

  /** Client-side preview of the same deterministic scorer (UI feedback). */
  previewScore: scoreQuiz,
};
