/**
 * Advisory AI assistance — SomaCampus Phase 9I Task 1.
 *
 * DETERMINISTIC, pure, no I/O, no network, no secrets, no LLM provider.
 * Extends the Phase 8F aiDraftService pattern across the online operation:
 * (1) teacher matching suggestions (booking → rank eligible teachers by
 * subject fit + availability + no-conflict); (2) session preparation
 * summaries (prior notes + outstanding work + objectives, extractive);
 * (3) post-completion session summaries (human-approved before sharing);
 * (4) evidence summaries for parents (approved evidence only, advisory).
 *
 * Locked rules (mirroring aiDraftService):
 * - Advisory only: every output carries isAiDrafted: true and
 *   requiresHumanApproval: true. There is NO assign/send/share path in
 *   this module — callers route suggestions/summaries through human
 *   approve/dismiss UI. No autonomous actions anywhere.
 * - No invented facts: outputs are extractive (verbatim input phrases,
 *   counts derived from inputs). Prep keyPoints contain ONLY sanitised
 *   input sentences/titles/objectives.
 * - Banned diagnosis vocabulary (BANNED_WORDS, reused) never appears in
 *   any output. Parent summaries additionally reuse filterApprovedSources
 *   + sanitizeForParent (internal_only excluded, amounts redacted).
 * - Empty inputs → honest empty messages, never fabricated content.
 * - Mock convention: composers take explicit inputs and never read the DB,
 *   so there is no mock branch to lie — empty in, honest empty out.
 *
 * No migration needed: this module persists nothing (verified — no new
 * columns/tables; summaries are composed in memory and approved through
 * existing flows / local UI state).
 */

import {
  BANNED_WORDS,
  filterApprovedSources,
  sanitizeForParent,
  EMPTY_EVIDENCE_MESSAGE,
  type DraftSourceObservation,
} from '../communication/aiDraftService';

/* ------------------------------------------------------------------ */
/* Shared sanitiser (teacher-facing): banned words only, digits kept.  */
/* ------------------------------------------------------------------ */

/** Parent surfaces use sanitizeForParent (also redacts amounts); teacher
 *  surfaces keep counts/references (Q1–Q6) and strip diagnosis words only,
 *  reusing the same BANNED_WORDS vocabulary. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripBannedWords(text: string): string {
  let out = (text ?? '').trim().replace(/\s+/g, ' ');
  for (const word of BANNED_WORDS) {
    const w = word.toLowerCase();
    const stem = w === 'diagnose' || w === 'diagnosed' ? 'diagnos(?:e|ed)' : w === 'diagnosis' ? 'diagnos(?:is|es)' : `${escapeRegExp(w)}s?`;
    out = out.replace(new RegExp(`\\b(${stem})\\b`, 'gi'), '[removed]');
  }
  return out.replace(/[ \t]+/g, ' ').trim();
}

function sentenceOf(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/* ------------------------------------------------------------------ */
/* (1) Teacher matching suggestions.                                   */
/* ------------------------------------------------------------------ */

export interface TeacherCandidate {
  id: string;
  displayName?: string;
  subjectIds: string[];
  available: boolean;
  hasConflict: boolean;
}

export interface TeacherSuggestion {
  teacherId: string;
  displayName?: string;
  score: number;
  reasons: string[];
  /** Subject fit + available + conflict-free. Ineligible rows are still
   *  listed (transparent ranking) but must not be assigned. */
  eligible: boolean;
}

export interface TeacherMatchResult {
  requiredSubjectId: string;
  suggestions: TeacherSuggestion[];
  /** Set when no candidates were supplied — honest empty, never fabricated. */
  emptyMessage?: string;
  isAiDrafted: true;
  requiresHumanApproval: true;
}

export const EMPTY_MATCH_MESSAGE = 'No teacher candidates supplied — no suggestions made.';

/**
 * Rank eligible teachers for a booking: subject fit first, then
 * conflict-free, then available. Deterministic (score desc, id asc).
 * Advisory: the caller must get human approval before any assignment.
 */
export function suggestTeachers(
  requiredSubjectId: string,
  candidates: TeacherCandidate[],
): TeacherMatchResult {
  const subjectId = (requiredSubjectId ?? '').trim();
  if (!subjectId) {
    throw new Error('onlineAiService.suggestTeachers requires a subject id');
  }
  const rows = candidates ?? [];
  if (rows.length === 0) {
    return {
      requiredSubjectId: subjectId,
      suggestions: [],
      emptyMessage: EMPTY_MATCH_MESSAGE,
      isAiDrafted: true,
      requiresHumanApproval: true,
    };
  }
  const suggestions = rows.map((c) => {
    const subjectFit = (c.subjectIds ?? []).includes(subjectId);
    const conflictFree = !c.hasConflict;
    const score = (subjectFit ? 10 : 0) + (conflictFree ? 5 : 0) + (c.available ? 2 : 0);
    const reasons = [
      subjectFit ? `Teaches the required subject (${subjectId}).` : `Does not teach the required subject (${subjectId}).`,
      conflictFree ? 'No scheduling conflict.' : 'Has a scheduling conflict.',
      c.available ? 'Available.' : 'Unavailable.',
    ];
    return {
      teacherId: String(c.id),
      ...(c.displayName ? { displayName: c.displayName } : {}),
      score,
      reasons,
      eligible: subjectFit && c.available && conflictFree,
    };
  });
  suggestions.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.teacherId < b.teacherId ? -1 : 1));
  return {
    requiredSubjectId: subjectId,
    suggestions,
    isAiDrafted: true,
    requiresHumanApproval: true,
  };
}

/* ------------------------------------------------------------------ */
/* (2) Session preparation summaries (extractive).                     */
/* ------------------------------------------------------------------ */

export interface PrepOutstandingItem {
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  status: string;
}

export interface PrepInput {
  sessionId: string;
  priorNote: string | null;
  outstanding: PrepOutstandingItem[];
  objectives: string[];
}

export interface PrepSummary {
  sessionId: string;
  body: string;
  /** Extractive content lines only (no template glue) — every token
   *  traces to the inputs, so callers can assert no invented facts. */
  keyPoints: string[];
  sourceCount: number;
  isEmpty: boolean;
  isAiDrafted: true;
  requiresHumanApproval: true;
}

export const EMPTY_PREP_MESSAGE = 'No session evidence available yet — nothing suggested.';

/**
 * Deterministic prep sheet: prior-note sentences + outstanding titles +
 * objectives, quoted verbatim (banned words stripped). No new facts.
 */
export function prepareSession(input: PrepInput): PrepSummary {
  const sessionId = String(input?.sessionId ?? '').trim();
  const priorNote = (input?.priorNote ?? '').trim();
  const outstanding = (input?.outstanding ?? []).filter(
    (o) => o && (o.assignmentTitle ?? '').trim(),
  );
  const objectives = (input?.objectives ?? []).map((o) => (o ?? '').trim()).filter(Boolean);

  const sourceCount = (priorNote ? 1 : 0) + outstanding.length + objectives.length;
  if (sourceCount === 0) {
    return {
      sessionId,
      body: EMPTY_PREP_MESSAGE,
      keyPoints: [],
      sourceCount: 0,
      isEmpty: true,
      isAiDrafted: true,
      requiresHumanApproval: true,
    };
  }

  const keyPoints: string[] = [];
  if (priorNote) {
    for (const s of priorNote.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) {
      keyPoints.push(sentenceOf(stripBannedWords(s)));
    }
  }
  for (const o of outstanding) {
    keyPoints.push(sentenceOf(stripBannedWords(`${o.assignmentTitle.trim()} — ${o.status.trim() || 'pending'}`)));
  }
  for (const o of objectives) {
    keyPoints.push(sentenceOf(stripBannedWords(o)));
  }

  const sections: string[] = [];
  if (priorNote) sections.push(`Prior session note:\n${keyPoints.slice(0, priorNote.split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length).map((p) => `- ${p}`).join('\n')}`);
  if (outstanding.length > 0) {
    const start = priorNote ? priorNote.split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length : 0;
    sections.push(`Outstanding work (${outstanding.length}):\n${keyPoints.slice(start, start + outstanding.length).map((p) => `- ${p}`).join('\n')}`);
  }
  if (objectives.length > 0) {
    sections.push(`Objectives:\n${keyPoints.slice(keyPoints.length - objectives.length).map((p) => `- ${p}`).join('\n')}`);
  }
  const body = `Session preparation (advisory — review before teaching):\n${sections.join('\n')}\nA teacher must review this preparation before the session.`;
  return {
    sessionId,
    body,
    keyPoints,
    sourceCount,
    isEmpty: false,
    isAiDrafted: true,
    requiresHumanApproval: true,
  };
}

/* ------------------------------------------------------------------ */
/* (3) Post-completion session summaries (approval-gated).             */
/* ------------------------------------------------------------------ */

export interface SessionSummaryInput {
  sessionId: string;
  presentCount: number;
  participantCount: number;
  completionNote: string;
}

export interface SessionSummary {
  sessionId: string;
  body: string;
  isAiDrafted: true;
  requiresHumanApproval: true;
  approvedBy: string | null;
  /** False until a human approves — unapproved summaries are never shared. */
  shareable: boolean;
}

export const EMPTY_SESSION_SUMMARY_MESSAGE = 'No completion evidence recorded yet — no summary drafted.';

/**
 * Draft a shareable session summary. ALWAYS starts unshareable; call
 * approveSessionSummary() after human review to release it.
 */
export function summarizeSession(input: SessionSummaryInput): SessionSummary {
  const sessionId = String(input?.sessionId ?? '').trim();
  const note = (input?.completionNote ?? '').trim();
  if (!note) {
    return {
      sessionId,
      body: EMPTY_SESSION_SUMMARY_MESSAGE,
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvedBy: null,
      shareable: false,
    };
  }
  const present = Number(input?.presentCount ?? 0);
  const total = Number(input?.participantCount ?? 0);
  const body =
    `Session summary (draft — needs teacher approval before sharing):\n` +
    `- ${present} of ${total} participant(s) present.\n` +
    `- ${sentenceOf(stripBannedWords(note))}\n` +
    `A teacher must review and approve this summary before it is shared.`;
  return {
    sessionId,
    body,
    isAiDrafted: true,
    requiresHumanApproval: true,
    approvedBy: null,
    shareable: false,
  };
}

/** Human approval releases the summary for sharing (new object; the draft stays unshareable). */
export function approveSessionSummary(summary: SessionSummary, approverId: string): SessionSummary {
  if (!approverId || !String(approverId).trim()) {
    throw new Error('onlineAiService.approveSessionSummary requires an approver id');
  }
  return { ...summary, approvedBy: String(approverId).trim(), shareable: true };
}

/** Share gate: only an approved summary may leave the cockpit. */
export function isShareable(summary: SessionSummary): boolean {
  return summary?.shareable === true && !!summary?.approvedBy;
}

/* ------------------------------------------------------------------ */
/* (4) Evidence summaries for parents (approved evidence only).        */
/* ------------------------------------------------------------------ */

export interface ParentEvidenceSummary {
  studentName: string;
  body: string;
  sourceCount: number;
  isAiDrafted: true;
  requiresHumanApproval: true;
}

/**
 * Advisory parent summary from APPROVED (parent_visible) evidence only.
 * Reuses the 8F guards: internal_only/academic_team rows excluded, banned
 * words and amounts redacted. Empty → honest empty, never fabricated.
 */
export function summarizeForParent(
  studentName: string,
  evidence: DraftSourceObservation[],
): ParentEvidenceSummary {
  const name = (studentName ?? '').trim();
  const approved = filterApprovedSources(evidence ?? []);
  if (approved.length === 0) {
    return {
      studentName: name,
      body: EMPTY_EVIDENCE_MESSAGE,
      sourceCount: 0,
      isAiDrafted: true,
      requiresHumanApproval: true,
    };
  }
  const lines = approved.map((o) => `- ${sentenceOf(sanitizeForParent(o.observationText))}`);
  const body =
    `Hello, here is an online learning update for ${name}:\n${lines.join('\n')}\n` +
    `This summary is advisory and was drafted from teacher feedback. A teacher must review it before it is shared.`;
  return {
    studentName: name,
    body,
    sourceCount: approved.length,
    isAiDrafted: true,
    requiresHumanApproval: true,
  };
}
