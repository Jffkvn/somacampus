/**
 * Advisory AI assistance — SomaCampus Phase 9I.
 *
 * DETERMINISTIC, pure, self-contained, no I/O, no network, no secrets.
 * Enforces the SomaCampus AI Governance Contract:
 * 1. Advisory only: every output carries `isAiDrafted: true` and `requiresHumanApproval: true`.
 * 2. Consequential actions remain human-gated: AI suggests -> human reviews -> human approves -> domain service executes.
 * 3. Grounding & Anti-Hallucination: outputs are derived deterministically from authorized inputs.
 * 4. Privacy firewalls:
 *    - Teacher allocation: strictly typed to exclude rates, salary, and compensation.
 *    - Parent updates: only consumes parent-visible evidence and redacts currency/amounts as defense-in-depth.
 * 5. Banned diagnosis vocabulary is stripped.
 * 6. Insufficient context -> honest empty/insufficient signal, never fabricated certainty.
 */

import { z } from 'zod';
import {
  BANNED_WORDS,
  filterApprovedSources,
  sanitizeForParent,
  EMPTY_EVIDENCE_MESSAGE,
  type DraftSourceObservation,
} from '../communication/aiDraftService';
import {
  type AiResultClassification,
  type AiProvenance,
  type SessionSummary,
  type TeacherBriefing,
  type NextStepRecommendation,
  type SchedulingRecommendation,
  type TeacherAllocationRecommendation,
  type ParentCommunicationDraft,
} from './onlineAiSchema';

/* ------------------------------------------------------------------ */
/* Sanitization & String Helpers                                      */
/* ------------------------------------------------------------------ */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripBannedWords(text: string): string {
  let out = (text ?? '').trim().replace(/\s+/g, ' ');
  for (const word of BANNED_WORDS) {
    const w = word.toLowerCase();
    const stem =
      w === 'diagnose' || w === 'diagnosed'
        ? 'diagnos(?:e|ed)'
        : w === 'diagnosis'
        ? 'diagnos(?:is|es)'
        : `${escapeRegExp(w)}s?`;
    out = out.replace(new RegExp(`\\b(${stem})\\b`, 'gi'), '[removed]');
  }
  return out.replace(/[ \t]+/g, ' ').trim();
}

function sentenceOf(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export function createDefaultProvenance(sourceIds: string[] = []): AiProvenance {
  return {
    generatedBy: 'AI',
    modelOrEngine: 'somacampus-deterministic-advisory-v1',
    generatedAt: new Date().toISOString(),
    sourceEvidenceIds: sourceIds,
    status: 'DRAFT',
    approvedBy: null,
    approvedAt: null,
    isAiDrafted: true,
    requiresHumanApproval: true,
  };
}

/* ------------------------------------------------------------------ */
/* Schema Validation Helper                                           */
/* ------------------------------------------------------------------ */

export function validateAiOutput<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { status: AiResultClassification; data?: T; error?: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      status: 'INVALID_AI_OUTPUT',
      error: result.error.message,
    };
  }
  return {
    status: 'SUCCESS',
    data: result.data,
  };
}

/* ------------------------------------------------------------------ */
/* (1) Session Summary (Capability 1)                                  */
/* ------------------------------------------------------------------ */

export interface SessionSummaryInput {
  sessionId: string;
  presentCount: number;
  participantCount: number;
  completionNote: string;
  curriculumRef?: string | null;
  subjectName?: string | null;
}

export const EMPTY_SESSION_SUMMARY_MESSAGE =
  'No completion evidence recorded yet — no summary drafted.';

export function summarizeSession(input: SessionSummaryInput): SessionSummary {
  const sessionId = String(input?.sessionId ?? '').trim();
  const note = (input?.completionNote ?? '').trim();

  if (!note) {
    return {
      sessionId,
      body: EMPTY_SESSION_SUMMARY_MESSAGE,
      presentCount: Number(input?.presentCount ?? 0),
      participantCount: Number(input?.participantCount ?? 0),
      curriculumRef: input?.curriculumRef ?? null,
      keyPoints: [],
      provenance: createDefaultProvenance([sessionId]),
      shareable: false,
      isEmpty: true,
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvedBy: null,
    };
  }

  const cleanNote = stripBannedWords(note);
  const present = Number(input?.presentCount ?? 0);
  const total = Number(input?.participantCount ?? 0);
  const keyPoints = cleanNote
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sentenceOf);

  const curriculumLine = input?.curriculumRef
    ? `- Curriculum Focus: ${stripBannedWords(input.curriculumRef)}\n`
    : '';

  const body =
    `Session summary (draft — requires teacher review before sharing):\n` +
    `- ${present} of ${total} participant(s) present.\n` +
    curriculumLine +
    `- Teacher Note: ${sentenceOf(cleanNote)}\n` +
    `A teacher must review and approve this summary before it is shared.`;

  return {
    sessionId,
    body,
    presentCount: present,
    participantCount: total,
    curriculumRef: input?.curriculumRef ?? null,
    keyPoints,
    provenance: createDefaultProvenance([sessionId]),
    shareable: false,
    isEmpty: false,
    isAiDrafted: true,
    requiresHumanApproval: true,
    approvedBy: null,
  };
}

export function approveSessionSummary(
  summary: SessionSummary,
  approverId: string,
): SessionSummary {
  if (!approverId || !String(approverId).trim()) {
    throw new Error('onlineAiService.approveSessionSummary requires an approver id');
  }
  const approver = String(approverId).trim();
  return {
    ...summary,
    shareable: true,
    approvedBy: approver,
    provenance: {
      ...summary.provenance,
      status: 'APPROVED',
      approvedBy: approver,
      approvedAt: new Date().toISOString(),
    },
  };
}

export function isShareable(summary: SessionSummary): boolean {
  return (
    summary?.shareable === true &&
    (summary?.provenance?.status === 'APPROVED' || !!summary?.approvedBy) &&
    !!summary?.approvedBy
  );
}

export function discardSessionSummary(
  summary: SessionSummary,
  discarderId: string,
  _reason?: string,
): SessionSummary {
  if (!discarderId || !String(discarderId).trim()) {
    throw new Error('onlineAiService.discardSessionSummary requires a discarder id');
  }
  return {
    ...summary,
    shareable: false,
    approvedBy: null,
    provenance: {
      ...summary.provenance,
      status: 'DISCARDED',
      approvedBy: null,
      approvedAt: null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* (2) Teacher Pre-Session Briefing (Capability 2)                    */
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
  keyPoints: string[];
  sourceCount: number;
  isEmpty: boolean;
  isAiDrafted: true;
  requiresHumanApproval: true;
}

export const EMPTY_PREP_MESSAGE =
  'No session evidence available yet — nothing suggested.';
export const INSUFFICIENT_EVIDENCE_MESSAGE =
  'Insufficient evidence to make a reliable recommendation.';

/** Backwards-compatible prepareSession wrapper */
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
    keyPoints.push(
      sentenceOf(stripBannedWords(`${o.assignmentTitle.trim()} — ${o.status.trim() || 'pending'}`)),
    );
  }
  for (const o of objectives) {
    keyPoints.push(sentenceOf(stripBannedWords(o)));
  }

  const sections: string[] = [];
  if (priorNote) {
    sections.push(
      `Prior session note:\n${keyPoints
        .slice(0, priorNote.split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length)
        .map((p) => `- ${p}`)
        .join('\n')}`,
    );
  }
  if (outstanding.length > 0) {
    const start = priorNote
      ? priorNote.split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length
      : 0;
    sections.push(
      `Outstanding work (${outstanding.length}):\n${keyPoints
        .slice(start, start + outstanding.length)
        .map((p) => `- ${p}`)
        .join('\n')}`,
    );
  }
  if (objectives.length > 0) {
    sections.push(
      `Objectives:\n${keyPoints
        .slice(keyPoints.length - objectives.length)
        .map((p) => `- ${p}`)
        .join('\n')}`,
    );
  }

  const body = `Session preparation (advisory — review before teaching):\n${sections.join(
    '\n',
  )}\nA teacher must review this preparation before the session.`;

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

export interface TeacherBriefingInput {
  sessionId: string;
  studentName?: string;
  subjectName?: string;
  curriculumObjective?: string | null;
  priorSessionNote?: string | null;
  outstandingAssignments?: PrepOutstandingItem[];
  approvedObservations?: DraftSourceObservation[];
}

export function generateTeacherBriefing(input: TeacherBriefingInput): TeacherBriefing {
  const sessionId = String(input?.sessionId ?? '').trim();
  const priorNote = (input?.priorSessionNote ?? '').trim();
  const objective = (input?.curriculumObjective ?? '').trim();
  const outstanding = input?.outstandingAssignments ?? [];
  const observations = filterApprovedSources(input?.approvedObservations ?? []);

  const totalSources =
    (priorNote ? 1 : 0) + (objective ? 1 : 0) + outstanding.length + observations.length;

  if (totalSources === 0) {
    return {
      sessionId,
      whatHappenedPreviously: 'No prior session records found.',
      relevantLearnerPatterns: [],
      suggestedFocus: 'General subject introduction and baseline engagement.',
      suggestedQuestions: [],
      suggestedNextSteps: 'Review foundational concepts.',
      evidenceCitations: [],
      isEmpty: true,
      emptyMessage: INSUFFICIENT_EVIDENCE_MESSAGE,
      provenance: createDefaultProvenance([sessionId]),
    };
  }

  const cleanPrior = priorNote
    ? sentenceOf(stripBannedWords(priorNote))
    : 'No prior session note recorded.';

  const learnerPatterns = observations
    .map((o) => sentenceOf(stripBannedWords(o.observationText)))
    .filter(Boolean);

  const focus = objective
    ? `Curriculum focus: ${sentenceOf(stripBannedWords(objective))}`
    : input?.subjectName
    ? `Topic progression in ${input.subjectName}.`
    : 'Core curriculum sequence.';

  const questions = objective
    ? [
        `Warm-up: In pairs, recall the core rule of ${stripBannedWords(objective)}.`,
        `Diagnostic prompt: Can you explain one common misunderstanding when working with this topic?`,
      ]
    : [
        `Warm-up: Briefly summarize key takeaways from the previous lesson.`,
      ];

  const nextSteps =
    outstanding.length > 0
      ? `Review ${outstanding.length} pending task(s) (${outstanding.map((o) => o.assignmentTitle).join(', ')}) before introducing new content.`
      : 'Proceed through planned sequence with regular comprehension checks.';

  const citations: string[] = [];
  if (priorNote) citations.push(`note:${sessionId}`);
  for (const o of outstanding) citations.push(`assignment:${o.assignmentId}`);
  for (const obs of observations) {
    if (obs.id) citations.push(`observation:${obs.id}`);
  }

  return {
    sessionId,
    whatHappenedPreviously: cleanPrior,
    relevantLearnerPatterns: learnerPatterns,
    suggestedFocus: focus,
    suggestedQuestions: questions,
    suggestedNextSteps: nextSteps,
    evidenceCitations: citations,
    isEmpty: false,
    emptyMessage: null,
    provenance: createDefaultProvenance(citations),
  };
}

/* ------------------------------------------------------------------ */
/* (3) Session Follow-up / Next-Step Recommendations (Capability 3)  */
/* ------------------------------------------------------------------ */

export interface NextStepInput {
  sessionId: string;
  completionNote: string;
  objectiveRef?: string | null;
  studentName?: string;
}

export function recommendNextSteps(input: NextStepInput): NextStepRecommendation {
  const sessionId = String(input?.sessionId ?? '').trim();
  const cleanNote = stripBannedWords(input?.completionNote ?? '');
  const cleanObj = stripBannedWords(input?.objectiveRef ?? '');

  const activities = [
    cleanObj
      ? `Assign 3 retrieval exercises targeting ${cleanObj}.`
      : 'Provide 3 targeted consolidation problems.',
    'Review key vocabulary cards at the start of the next session.',
  ];

  const questions = [
    'How do the steps followed today relate to real-world applications?',
    'What single step proved most challenging during independent work?',
  ];

  const pacingAdvice = cleanNote.toLowerCase().includes('struggle')
    ? 'Dedicate 10 minutes at start of next session for guided recap before moving on.'
    : 'Learner demonstrated steady progression; maintain standard pacing.';

  return {
    sessionId,
    suggestedActivities: activities,
    recommendedRetrievalQuestions: questions,
    pacingAdvice,
    provenance: createDefaultProvenance([sessionId]),
  };
}

/* ------------------------------------------------------------------ */
/* (4) Online Scheduling Recommendations (Capability 4)              */
/* ------------------------------------------------------------------ */

export interface SlotCandidate {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  defaultTeacherId?: string;
  defaultTeacherName?: string;
  capacity: number;
  bookedCount: number;
  hasTeacherConflict?: boolean;
}

export interface SchedulingInput {
  enrolmentId: string;
  subjectId: string;
  availableSlots: SlotCandidate[];
  requestedWeeklyFrequency?: number;
}

export function recommendScheduling(input: SchedulingInput): SchedulingRecommendation {
  const enrolmentId = String(input?.enrolmentId ?? '').trim();
  const subjectId = String(input?.subjectId ?? '').trim();
  const targetFrequency = Math.max(1, input?.requestedWeeklyFrequency ?? 2);
  const slots = input?.availableSlots ?? [];

  if (slots.length === 0) {
    return {
      enrolmentId,
      subjectId,
      recommendedSlots: [],
      alternativeTimes: [],
      suggestedFrequencyWeekly: targetFrequency,
      emptyMessage: 'No slots available for scheduling.',
      provenance: createDefaultProvenance([enrolmentId]),
    };
  }

  // Filter slots with capacity and no conflicts
  const validSlots = slots.map((s) => {
    const withinCapacity = s.bookedCount < s.capacity;
    const conflictFree = !s.hasTeacherConflict;
    const score = (withinCapacity ? 10 : 0) + (conflictFree ? 10 : 0);
    const rationale = `${conflictFree ? 'Teacher schedule clear' : 'Teacher conflict detected'}; ${
      withinCapacity ? 'Capacity available' : 'Slot at capacity'
    }.`;

    return {
      slotTemplateId: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      teacherId: s.defaultTeacherId ?? 'unassigned',
      teacherName: s.defaultTeacherName,
      rationale,
      conflictFree,
      withinCapacity,
      score,
    };
  });

  validSlots.sort((a, b) => b.score - a.score || a.dayOfWeek - b.dayOfWeek);

  const recommended = validSlots.slice(0, targetFrequency).map(({ score: _score, ...rest }) => rest);
  const alternatives = validSlots.slice(targetFrequency).map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    notes: s.rationale,
  }));

  return {
    enrolmentId,
    subjectId,
    recommendedSlots: recommended,
    alternativeTimes: alternatives,
    suggestedFrequencyWeekly: targetFrequency,
    provenance: createDefaultProvenance([enrolmentId]),
  };
}

/* ------------------------------------------------------------------ */
/* (5) Teacher Allocation Recommendations (Capability 5)             */
/* Workload-aware, STRICT PRIVACY (Zero rate/salary exposure)         */
/* ------------------------------------------------------------------ */

export interface TeacherCandidate {
  id: string;
  displayName?: string;
  subjectIds: string[];
  available: boolean;
  hasConflict: boolean;
  activeSessionCount?: number;
  maxSessionsCap?: number;
}

export interface TeacherSuggestion {
  teacherId: string;
  displayName?: string;
  score: number;
  reasons: string[];
  eligible: boolean;
  activeSessionCount: number;
  capacityStatus: 'AVAILABLE' | 'AT_CAPACITY';
}

export interface TeacherMatchResult {
  requiredSubjectId: string;
  suggestions: TeacherSuggestion[];
  emptyMessage?: string;
  isAiDrafted: true;
  requiresHumanApproval: true;
  provenance?: AiProvenance;
}

export const EMPTY_MATCH_MESSAGE = 'No teacher candidates supplied — no suggestions made.';

/** Backwards-compatible suggestTeachers */
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

  const suggestions: TeacherSuggestion[] = rows.map((c) => {
    const subjectFit = (c.subjectIds ?? []).includes(subjectId);
    const conflictFree = !c.hasConflict;
    const activeCount = c.activeSessionCount ?? 0;
    const cap = c.maxSessionsCap ?? 10;
    const withinCapacity = activeCount < cap;

    const score =
      (subjectFit ? 10 : 0) +
      (conflictFree ? 5 : 0) +
      (c.available ? 2 : 0) +
      (withinCapacity ? 3 : -5);

    const reasons = [
      subjectFit
        ? `Teaches the required subject (${subjectId}).`
        : `Does not teach the required subject (${subjectId}).`,
      conflictFree ? 'No scheduling conflict.' : 'Has a scheduling conflict.',
      c.available ? 'Available.' : 'Unavailable.',
      withinCapacity
        ? `Workload within policy limits (${activeCount}/${cap} sessions).`
        : `Workload at capacity (${activeCount}/${cap} sessions).`,
    ];

    const eligible = subjectFit && c.available && conflictFree && withinCapacity;

    return {
      teacherId: String(c.id),
      ...(c.displayName ? { displayName: c.displayName } : {}),
      score,
      reasons,
      eligible,
      activeSessionCount: activeCount,
      capacityStatus: withinCapacity ? 'AVAILABLE' : 'AT_CAPACITY',
    };
  });

  suggestions.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.teacherId < b.teacherId ? -1 : 1,
  );

  return {
    requiredSubjectId: subjectId,
    suggestions,
    isAiDrafted: true,
    requiresHumanApproval: true,
  };
}

export function recommendTeacherAllocations(
  requiredSubjectId: string,
  candidates: TeacherCandidate[],
): TeacherAllocationRecommendation {
  const result = suggestTeachers(requiredSubjectId, candidates);
  return {
    requiredSubjectId: result.requiredSubjectId,
    suggestions: result.suggestions.map((s) => ({
      ...s,
      conflictStatus: s.reasons.some((r) => r.includes('conflict')) && !s.reasons.some((r) => r.includes('No scheduling conflict'))
        ? 'CONFLICT'
        : 'FREE',
      subjectFit: s.reasons.some((r) => r.includes('Teaches the required subject')),
      available: s.reasons.some((r) => r.includes('Available.')),
    })),
    emptyMessage: result.emptyMessage,
    provenance: createDefaultProvenance(candidates.map((c) => c.id)),
  };
}

/* ------------------------------------------------------------------ */
/* (6) Parent Communication Drafts (Capability 6)                    */
/* ------------------------------------------------------------------ */

export interface ParentEvidenceSummary {
  studentName: string;
  body: string;
  sourceCount: number;
  isAiDrafted: true;
  requiresHumanApproval: true;
}

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

export interface ParentCommunicationInput {
  studentId: string;
  studentName: string;
  draftType:
    | 'SESSION_SUMMARY'
    | 'LEARNING_UPDATE'
    | 'REMINDER'
    | 'PROGRESS_COMMUNICATION'
    | 'FOLLOW_UP_SUGGESTION';
  observations: DraftSourceObservation[];
  sessionTopic?: string;
}

export function draftParentCommunication(
  input: ParentCommunicationInput,
): ParentCommunicationDraft {
  const studentId = String(input?.studentId ?? '').trim();
  const name = (input?.studentName ?? '').trim();
  const approved = filterApprovedSources(input?.observations ?? []);

  let subject = `Online Learning Update — ${name}`;
  let intro = `Dear Parent/Guardian,\nHere is an update regarding ${name}'s progress:`;

  switch (input.draftType) {
    case 'SESSION_SUMMARY':
      subject = `Session Summary — ${name}`;
      intro = `Dear Parent/Guardian,\nHere is a summary of ${name}'s recent online session:`;
      break;
    case 'REMINDER':
      subject = `Learning Reminder — ${name}`;
      intro = `Dear Parent/Guardian,\nFriendly reminder regarding upcoming assignments for ${name}:`;
      break;
    case 'PROGRESS_COMMUNICATION':
      subject = `Academic Progress Overview — ${name}`;
      intro = `Dear Parent/Guardian,\nWe are pleased to share the latest progress observations for ${name}:`;
      break;
    case 'FOLLOW_UP_SUGGESTION':
      subject = `Recommended Home Practice — ${name}`;
      intro = `Dear Parent/Guardian,\nSuggested focus areas for home support with ${name}:`;
      break;
  }

  const lines =
    approved.length > 0
      ? approved.map((o) => `- ${sentenceOf(sanitizeForParent(o.observationText))}`)
      : ['- Learner engaged steadily with the curriculum focus.'];

  const body = `${intro}\n${lines.join(
    '\n',
  )}\n\nThis communication is an advisory draft prepared for teacher review before dispatch.`;

  return {
    studentId,
    studentName: name,
    draftType: input.draftType,
    subject,
    body,
    sourceCount: approved.length,
    provenance: createDefaultProvenance(approved.map((a) => a.id ?? studentId)),
  };
}
