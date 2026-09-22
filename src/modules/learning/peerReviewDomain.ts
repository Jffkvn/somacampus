/**
 * P2D-3 structured peer review (pure). FORMATIVE ONLY.
 * Hard rule: peer output never becomes a gradebook score without an
 * explicit later teacher confirmation (separate from this module).
 */

export interface PeerReviewPrompt {
  id: string;
  prompt: string;
}

export interface PeerReviewTask {
  id: string;
  title: string;
  instructions: string | null;
  prompts: PeerReviewPrompt[];
  isPublished: boolean;
}

export interface PeerReviewResponse {
  id: string;
  taskId: string;
  authorStudentId: string;
  workStudentId: string;
  answers: Record<string, string>;
  isHidden: boolean;
}

/** Default teacher-owned prompts (charter: structured, not free comments). */
export const DEFAULT_PEER_PROMPTS: PeerReviewPrompt[] = [
  { id: 'well', prompt: 'What was done well?' },
  { id: 'improve', prompt: 'What could improve?' },
  { id: 'reasoning', prompt: 'Did they explain their reasoning? Quote one line.' },
  { id: 'suggestion', prompt: 'Give one specific suggestion.' },
];

export function validatePeerResponse(input: {
  authorStudentId: string;
  workStudentId: string;
  prompts: PeerReviewPrompt[];
  answers: Record<string, string>;
}): void {
  if (!input.authorStudentId || !input.workStudentId) {
    throw new Error('peerReview: author and work student are required');
  }
  if (input.authorStudentId === input.workStudentId) {
    throw new Error('peerReview: cannot review your own work');
  }
  if (!input.prompts?.length) {
    throw new Error('peerReview: teacher prompts are required (no free-form-only review)');
  }
  const missing = input.prompts.filter((p) => !String(input.answers?.[p.id] ?? '').trim());
  if (missing.length) {
    throw new Error(`peerReview: answer every prompt (${missing.map((m) => m.id).join(', ')})`);
  }
}

/**
 * Explicit guard: this module never produces gradebook rows.
 * Returns false always — call sites must not write learning_results.
 */
export function peerReviewWritesGradebook(): false {
  return false;
}
