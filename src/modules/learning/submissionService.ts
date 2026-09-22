/**
 * Digital Learning Spine — photo-first student submissions (M4).
 *
 * Charter: docs/plans/2026-09-22-digital-learning-spine.md §8
 * Photo-first, not photo-only. Weak/mobile connectivity. History preserved.
 */
import { supabase } from '../../lib/supabase';

export type SubmissionState =
  | 'draft'
  | 'submitted'
  | 'late'
  | 'missing'
  | 'revision_requested'
  | 'resubmitted'
  | 'reviewed';

export type SubmissionAttachmentKind = 'photo' | 'text' | 'pdf' | 'document' | 'audio' | 'video';

export interface SubmissionAttachment {
  id: string;
  kind: SubmissionAttachmentKind;
  storagePath: string | null;
  mime: string | null;
  byteSize: number | null;
  sortOrder: number;
}

export interface LearningSubmission {
  id: string;
  schoolId: string;
  assignmentId: string;
  studentId: string;
  state: SubmissionState;
  attempt: number;
  submittedAt: string | null;
  late: boolean;
  textBody: string | null;
  attachments: SubmissionAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface SubmitWorkInput {
  schoolId: string;
  assignmentId: string;
  studentId: string;
  textBody?: string | null;
  /** Already-uploaded storage paths (photo-first pipeline). */
  photoStoragePaths?: string[];
  /** Optional typed/PDF paths for older learners. */
  fileStoragePaths?: Array<{ path: string; kind: SubmissionAttachmentKind; mime?: string }>;
}

const BUCKET = 'student-submissions';

function mapSubmission(r: any): LearningSubmission {
  return {
    id: r.id,
    schoolId: r.school_id,
    assignmentId: r.assignment_id,
    studentId: r.student_id,
    state: r.state,
    attempt: Number(r.attempt ?? 1),
    submittedAt: r.submitted_at ?? null,
    late: Boolean(r.late),
    textBody: r.text_body ?? null,
    attachments: (r.attachments ?? []).map((a: any) => ({
      id: a.id,
      kind: a.kind,
      storagePath: a.storage_path ?? null,
      mime: a.mime ?? null,
      byteSize: a.byte_size ?? null,
      sortOrder: Number(a.sort_order ?? 0),
    })),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const submissionService = {
  /** Photo-first upload helper (already-compressed bytes from client). */
  async uploadWorkPhoto(
    schoolId: string,
    studentId: string,
    assignmentId: string,
    file: Blob,
    mime = 'image/jpeg',
  ): Promise<string> {
    const ext = mime.includes('png') ? 'png' : 'jpg';
    const path = `${schoolId}/${studentId}/${assignmentId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime });
    if (error) throw new Error(`submissionService.uploadWorkPhoto: ${error.message}`);
    return path;
  },

  /**
   * Submit or resubmit work. Preserves history via attempt increments.
   * Late flag is derived from assignment due_date at submit time.
   */
  async submitWork(input: SubmitWorkInput): Promise<LearningSubmission> {
    const attachments: Array<Record<string, unknown>> = [];
    let sort = 0;
    for (const p of input.photoStoragePaths ?? []) {
      attachments.push({
        kind: 'photo',
        storage_path: p,
        mime: 'image/jpeg',
        sort_order: sort++,
      });
    }
    for (const f of input.fileStoragePaths ?? []) {
      attachments.push({
        kind: f.kind,
        storage_path: f.path,
        mime: f.mime ?? null,
        sort_order: sort++,
      });
    }

    const { data, error } = await supabase.rpc('submit_learning_work', {
      p_school_id: input.schoolId,
      p_assignment_id: input.assignmentId,
      p_student_id: input.studentId,
      p_text_body: input.textBody ?? null,
      p_attachments: attachments,
    });

    if (error || !data) {
      throw new Error(`submissionService.submitWork: ${error?.message ?? 'no row'}`);
    }

    const { data: row, error: readErr } = await supabase
      .from('learning_submissions')
      .select('*, attachments:learning_submission_attachments(*)')
      .eq('id', data)
      .maybeSingle();
    if (readErr) throw new Error(`submissionService.submitWork(read): ${readErr.message}`);
    return mapSubmission(row);
  },

  async listForAssignment(assignmentId: string): Promise<LearningSubmission[]> {
    const { data, error } = await supabase
      .from('learning_submissions')
      .select('*, attachments:learning_submission_attachments(*)')
      .eq('assignment_id', assignmentId)
      .order('student_id', { ascending: true })
      .order('attempt', { ascending: false });
    if (error) throw new Error(`submissionService.listForAssignment: ${error.message}`);
    return (data ?? []).map(mapSubmission);
  },

  async listForStudent(studentId: string): Promise<LearningSubmission[]> {
    const { data, error } = await supabase
      .from('learning_submissions')
      .select('*, attachments:learning_submission_attachments(*)')
      .eq('student_id', studentId)
      .order('submitted_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error(`submissionService.listForStudent: ${error.message}`);
    return (data ?? []).map(mapSubmission);
  },

  /** Teacher marks reviewed / requests revision (state machine). */
  async markReview(
    submissionId: string,
    action: 'reviewed' | 'revision_requested',
  ): Promise<void> {
    const state = action === 'reviewed' ? 'reviewed' : 'revision_requested';
    const { error } = await supabase
      .from('learning_submissions')
      .update({
        state,
        reviewed_at: action === 'reviewed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId);
    if (error) throw new Error(`submissionService.markReview: ${error.message}`);
  },
};

export { BUCKET as STUDENT_SUBMISSIONS_BUCKET };
