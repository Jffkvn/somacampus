/**
 * P2D-3 peer review service — teacher tasks + structured learner responses.
 * FORMATIVE ONLY: never writes learning_results (see peerReviewDomain).
 */
import { supabase } from '../../lib/supabase';
import {
  peerReviewWritesGradebook,
  validatePeerResponse,
  type PeerReviewPrompt,
  type PeerReviewResponse,
  type PeerReviewTask,
} from './peerReviewDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapTask(r: any): PeerReviewTask {
  return {
    id: r.id,
    title: r.title,
    instructions: r.instructions ?? null,
    prompts: Array.isArray(r.prompts) ? r.prompts : [],
    isPublished: Boolean(r.is_published),
  };
}

function mapResponse(r: any): PeerReviewResponse {
  return {
    id: r.id,
    taskId: r.task_id,
    authorStudentId: r.author_student_id,
    workStudentId: r.work_student_id,
    answers: r.answers ?? {},
    isHidden: Boolean(r.is_hidden),
  };
}

export const peerReviewService = {
  async createTask(input: {
    schoolId: string;
    communityId?: string | null;
    title: string;
    instructions?: string | null;
    prompts: PeerReviewPrompt[];
    createdBy: string;
  }): Promise<PeerReviewTask> {
    if (!input.title?.trim()) throw new Error('peerReview.createTask: title is required');
    if (!input.prompts?.length) throw new Error('peerReview.createTask: prompts are required');
    if (isMockEnv()) throw new Error('peerReview.createTask: unavailable without live database');
    const { data, error } = await supabase
      .from('peer_review_tasks')
      .insert({
        school_id: input.schoolId,
        community_id: input.communityId ?? null,
        title: input.title.trim(),
        instructions: input.instructions?.trim() || null,
        prompts: input.prompts,
        is_published: true,
        created_by: input.createdBy,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`peerReview.createTask: ${error?.message ?? 'no row'}`);
    return mapTask(data);
  },

  async listTasks(schoolId: string): Promise<PeerReviewTask[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('peer_review_tasks')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`peerReview.listTasks: ${error.message}`);
    return (data ?? []).map(mapTask);
  },

  /** Structured response — formative; peerReviewWritesGradebook() === false. */
  async submitResponse(input: {
    schoolId: string;
    taskId: string;
    authorStudentId: string;
    workStudentId: string;
    prompts: PeerReviewPrompt[];
    answers: Record<string, string>;
  }): Promise<PeerReviewResponse> {
    validatePeerResponse(input);
    if (peerReviewWritesGradebook()) {
      throw new Error('peerReview: invariant violation — peer review never writes grades');
    }
    if (isMockEnv()) throw new Error('peerReview.submitResponse: unavailable without live database');
    const { data, error } = await supabase
      .from('peer_review_responses')
      .insert({
        school_id: input.schoolId,
        task_id: input.taskId,
        author_student_id: input.authorStudentId,
        work_student_id: input.workStudentId,
        answers: input.answers,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`peerReview.submitResponse: ${error?.message ?? 'no row'}`);
    return mapResponse(data);
  },

  async listResponsesForWork(taskId: string, workStudentId: string): Promise<PeerReviewResponse[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('peer_review_responses')
      .select('*')
      .eq('task_id', taskId)
      .eq('work_student_id', workStudentId)
      .eq('is_hidden', false);
    if (error) throw new Error(`peerReview.listResponses: ${error.message}`);
    return (data ?? []).map(mapResponse);
  },
};
