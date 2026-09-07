import { describe, it, expect, vi } from 'vitest';

/**
 * Phase 9I — Advisory AI Assistance Test Suite.
 *
 * Covers Capabilities 1–6:
 * (1) Session summaries (non-overwrite, approval gated)
 * (2) Teacher briefings (structured, citations, insufficient evidence fallback)
 * (3) Next-step recommendations (pedagogical follow-ups, advisory only)
 * (4) Online scheduling recommendations (capacity & conflict checks, advisory only)
 * (5) Teacher allocation recommendations (workload-aware, zero compensation leakage)
 * (6) Parent communication drafts (Phase 8 projection aware, amounts & diagnosis sanitized)
 * (7) Schema validation and provenance lifecycle
 */

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line import/first
import { supabase } from '../lib/supabase';
// eslint-disable-next-line import/first
import {
  suggestTeachers,
  recommendTeacherAllocations,
  prepareSession,
  generateTeacherBriefing,
  recommendNextSteps,
  recommendScheduling,
  summarizeSession,
  approveSessionSummary,
  discardSessionSummary,
  isShareable,
  summarizeForParent,
  draftParentCommunication,
  validateAiOutput,
  EMPTY_PREP_MESSAGE,
  EMPTY_SESSION_SUMMARY_MESSAGE,
  INSUFFICIENT_EVIDENCE_MESSAGE,
} from '../modules/online/onlineAiService';
// eslint-disable-next-line import/first
import { SessionSummarySchema } from '../modules/online/onlineAiSchema';
// eslint-disable-next-line import/first
import { EMPTY_EVIDENCE_MESSAGE } from '../modules/communication/aiDraftService';

const BANNED_STEMS = ['diagnos', 'disorder', 'condition', 'syndrome'];
const hasBannedWord = (s: string) => {
  const low = s.toLowerCase();
  return BANNED_STEMS.some((stem) => low.includes(stem));
};

/** Whitespace/punctuation-tolerant word tokens (single letters dropped). */
const tokens = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1);

describe('online advisory AI (Phase 9I) — deterministic, human-approved', () => {
  it('(a) matching ranks the available conflict-free subject-fit teacher first', () => {
    const result = suggestTeachers('subj-math', [
      { id: 't-conflict', displayName: 'Conflicting Cara', subjectIds: ['subj-math'], available: true, hasConflict: true },
      { id: 't-best', displayName: 'Sarah Namukasa', subjectIds: ['subj-math', 'subj-eng'], available: true, hasConflict: false },
      { id: 't-unqualified', displayName: 'Eddy Eng-Only', subjectIds: ['subj-eng'], available: true, hasConflict: false },
    ]);

    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0].teacherId).toBe('t-best');
    expect(result.suggestions[0].eligible).toBe(true);
    expect(result.suggestions[0].reasons.join(' ').toLowerCase()).toContain('math');
    const rest = result.suggestions.slice(1).map((s) => s.teacherId);
    expect(rest).toContain('t-conflict');
    expect(rest).toContain('t-unqualified');
    expect(result.suggestions.find((s) => s.teacherId === 't-conflict')!.eligible).toBe(false);
    expect(result.suggestions.find((s) => s.teacherId === 't-unqualified')!.eligible).toBe(false);
    expect(result.isAiDrafted).toBe(true);
    expect(result.requiresHumanApproval).toBe(true);
  });

  it('(b) prep summary contains prior note + outstanding + objectives, no invented facts', () => {
    const priorNote = 'Covered numerator and denominator with the small group.';
    const prep = prepareSession({
      sessionId: 'ses-1',
      priorNote,
      outstanding: [
        { assignmentId: 'a-1', assignmentTitle: 'Fractions worksheet', studentId: 'stud-1', status: 'pending' },
      ],
      objectives: ['Equivalent fractions'],
    });

    expect(prep.isEmpty).toBe(false);
    expect(prep.body).toContain('numerator and denominator');
    expect(prep.body).toContain('Fractions worksheet');
    expect(prep.body).toContain('Equivalent fractions');
    expect(hasBannedWord(prep.body)).toBe(false);
    expect(prep.isAiDrafted).toBe(true);
    expect(prep.requiresHumanApproval).toBe(true);

    const allowed = new Set([
      ...tokens(priorNote),
      ...tokens('Fractions worksheet pending'),
      ...tokens('Equivalent fractions'),
      'removed',
      'amount',
    ]);
    expect(prep.keyPoints.length).toBeGreaterThan(0);
    for (const point of prep.keyPoints) {
      for (const tok of tokens(point)) {
        expect(allowed.has(tok)).toBe(true);
      }
    }
  });

  it('(b2) prep summary strips banned diagnosis words from teacher inputs', () => {
    const prep = prepareSession({
      sessionId: 'ses-1',
      priorNote: 'Revisited equivalent fractions after the condition drill.',
      outstanding: [],
      objectives: [],
    });
    expect(prep.body.toLowerCase()).not.toContain('condition');
    expect(hasBannedWord(prep.body)).toBe(false);
    expect(prep.body).toContain('equivalent fractions');
  });

  it('(c) session summary is NOT shareable until a human approves it', () => {
    const summary = summarizeSession({
      sessionId: 'ses-1',
      presentCount: 3,
      participantCount: 5,
      completionNote: 'Covered fractions Q1 to Q6; revisit the last question next time.',
      curriculumRef: '5Nn.01 Fractions',
    });

    expect(summary.body).toContain('3');
    expect(summary.body).toContain('5');
    expect(summary.body.toLowerCase()).toContain('fractions');
    expect(summary.requiresHumanApproval).toBe(true);
    expect(summary.isAiDrafted).toBe(true);
    expect(summary.shareable).toBe(false);
    expect(summary.approvedBy).toBeNull();
    expect(isShareable(summary)).toBe(false);

    const approved = approveSessionSummary(summary, 'teacher-1');
    expect(approved.shareable).toBe(true);
    expect(approved.approvedBy).toBe('teacher-1');
    expect(approved.provenance.status).toBe('APPROVED');
    expect(isShareable(approved)).toBe(true);
    expect(summary.shareable).toBe(false);
    expect(isShareable(summary)).toBe(false);
  });

  it('(c2) session summary discard transitions status to DISCARDED and revokes sharing', () => {
    const summary = summarizeSession({
      sessionId: 'ses-1',
      presentCount: 2,
      participantCount: 3,
      completionNote: 'Satisfactory lesson.',
    });
    const discarded = discardSessionSummary(summary, 'teacher-1', 'Not needed');
    expect(discarded.shareable).toBe(false);
    expect(discarded.provenance.status).toBe('DISCARDED');
    expect(isShareable(discarded)).toBe(false);
  });

  it('(d) parent summary excludes internal_only evidence and amounts', () => {
    const draft = summarizeForParent('Amina', [
      { observationText: 'Amina read aloud fluently during English group work.', visibility: 'parent_visible' },
      { observationText: 'SECRET-XYZ internal-only note about a home visit.', visibility: 'internal_only' },
      { observationText: 'Fee balance of UGX 50,000 remains unpaid.', visibility: 'parent_visible' },
    ]);

    expect(draft.body.toLowerCase()).toContain('read aloud fluently');
    expect(draft.body).not.toContain('SECRET-XYZ');
    expect(draft.body).not.toMatch(/UGX/i);
    expect(draft.body).not.toMatch(/\d/);
    expect(hasBannedWord(draft.body)).toBe(false);
    expect(draft.isAiDrafted).toBe(true);
    expect(draft.requiresHumanApproval).toBe(true);
    expect(draft.sourceCount).toBe(2);
  });

  it('(e) empty inputs yield honest empties, never fabricated content', () => {
    const match = suggestTeachers('subj-math', []);
    expect(match.suggestions).toEqual([]);
    expect(match.emptyMessage).toBeTruthy();
    expect(JSON.stringify(match)).not.toContain('t-');

    const prep = prepareSession({ sessionId: 'ses-1', priorNote: null, outstanding: [], objectives: [] });
    expect(prep.isEmpty).toBe(true);
    expect(prep.body).toBe(EMPTY_PREP_MESSAGE);
    expect(prep.keyPoints).toEqual([]);

    const summary = summarizeSession({ sessionId: 'ses-1', presentCount: 0, participantCount: 0, completionNote: '   ' });
    expect(summary.body).toBe(EMPTY_SESSION_SUMMARY_MESSAGE);
    expect(summary.shareable).toBe(false);
    expect(isShareable(summary)).toBe(false);

    const parent = summarizeForParent('Denis', []);
    expect(parent.body).toBe(EMPTY_EVIDENCE_MESSAGE);
    expect(parent.sourceCount).toBe(0);
  });

  it('(f) mock-honest: test env returns honest empties, outputs are deterministic', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T10:00:00.000Z'));
    try {
      expect(process.env.NODE_ENV).toBe('test');
      expect(suggestTeachers('subj-math', []).suggestions).toEqual([]);
      const input = {
        sessionId: 'ses-9',
        priorNote: 'Practised equivalent fractions with number lines.',
        outstanding: [
          { assignmentId: 'a-2', assignmentTitle: 'Number line homework', studentId: 'stud-2', status: 'missing' as const },
        ],
        objectives: ['Compare fractions with different denominators'],
      };
      expect(prepareSession(input)).toEqual(prepareSession(input));
      const summaryInput = { sessionId: 'ses-9', presentCount: 4, participantCount: 4, completionNote: 'Full house; number lines clicked.' };
      expect(summarizeSession(summaryInput)).toEqual(summarizeSession(summaryInput));
    } finally {
      vi.useRealTimers();
    }
  });

  it('(g) composers are pure: zero DB calls', () => {
    suggestTeachers('subj-math', [
      { id: 't-1', subjectIds: ['subj-math'], available: true, hasConflict: false },
    ]);
    prepareSession({ sessionId: 'ses-1', priorNote: 'Covered fractions.', outstanding: [], objectives: ['Fractions'] });
    summarizeSession({ sessionId: 'ses-1', presentCount: 1, participantCount: 2, completionNote: 'Good session.' });
    summarizeForParent('Amina', [
      { observationText: 'Amina read aloud fluently.', visibility: 'parent_visible' },
    ]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  /* ------------------------------------------------------------------ */
  /* Expanded Phase 9I Invariants & Capabilities                        */
  /* ------------------------------------------------------------------ */

  it('(h) generateTeacherBriefing produces structured 5 sections with citations', () => {
    const briefing = generateTeacherBriefing({
      sessionId: 'ses-10',
      studentName: 'Amina',
      subjectName: 'Mathematics',
      curriculumObjective: '5Nn.01 Understand place value',
      priorSessionNote: 'Amina excelled in single digit operations.',
      outstandingAssignments: [
        { assignmentId: 'asg-1', assignmentTitle: 'Place value grid', studentId: 'stud-1', status: 'pending' },
      ],
      approvedObservations: [
        { id: 'obs-1', observationText: 'Struggled with hundredths column.', visibility: 'parent_visible' },
        { id: 'obs-2', observationText: 'Internal clinical assessment note.', visibility: 'internal_only' },
      ],
    });

    expect(briefing.isEmpty).toBe(false);
    expect(briefing.whatHappenedPreviously).toContain('single digit operations');
    expect(briefing.relevantLearnerPatterns.length).toBe(1);
    expect(briefing.relevantLearnerPatterns[0]).toContain('hundredths column');
    expect(briefing.relevantLearnerPatterns[0]).not.toContain('clinical');
    expect(briefing.suggestedFocus).toContain('5Nn.01 Understand place value');
    expect(briefing.suggestedQuestions.length).toBeGreaterThan(0);
    expect(briefing.evidenceCitations).toContain('note:ses-10');
    expect(briefing.evidenceCitations).toContain('assignment:asg-1');
    expect(briefing.evidenceCitations).toContain('observation:obs-1');
    expect(briefing.evidenceCitations).not.toContain('observation:obs-2');
    expect(briefing.provenance.status).toBe('DRAFT');
  });

  it('(i) generateTeacherBriefing returns INSUFFICIENT_CONTEXT fallback when context is empty', () => {
    const emptyBriefing = generateTeacherBriefing({
      sessionId: 'ses-empty',
      priorSessionNote: null,
      curriculumObjective: null,
      outstandingAssignments: [],
      approvedObservations: [],
    });

    expect(emptyBriefing.isEmpty).toBe(true);
    expect(emptyBriefing.emptyMessage).toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
    expect(emptyBriefing.evidenceCitations).toEqual([]);
  });

  it('(j) recommendNextSteps generates pedagogical follow-ups without mutating work', () => {
    const nextSteps = recommendNextSteps({
      sessionId: 'ses-12',
      completionNote: 'Learner struggled with common denominators.',
      objectiveRef: '5Nn.02 Fractions',
    });

    expect(nextSteps.suggestedActivities.length).toBeGreaterThan(0);
    expect(nextSteps.recommendedRetrievalQuestions.length).toBeGreaterThan(0);
    expect(nextSteps.pacingAdvice.toLowerCase()).toContain('recap');
    expect(nextSteps.provenance.isAiDrafted).toBe(true);
    expect(nextSteps.provenance.requiresHumanApproval).toBe(true);
  });

  it('(k) recommendScheduling ranks conflict-free slots with capacity and exposes alternatives', () => {
    const rec = recommendScheduling({
      enrolmentId: 'enr-1',
      subjectId: 'subj-math',
      availableSlots: [
        { id: 's-1', dayOfWeek: 1, startTime: '08:00', endTime: '09:00', capacity: 3, bookedCount: 3, hasTeacherConflict: false },
        { id: 's-2', dayOfWeek: 2, startTime: '09:00', endTime: '10:00', capacity: 3, bookedCount: 1, hasTeacherConflict: false },
        { id: 's-3', dayOfWeek: 4, startTime: '16:00', endTime: '17:00', capacity: 2, bookedCount: 0, hasTeacherConflict: false },
        { id: 's-4', dayOfWeek: 5, startTime: '10:00', endTime: '11:00', capacity: 3, bookedCount: 0, hasTeacherConflict: true },
      ],
      requestedWeeklyFrequency: 2,
    });

    expect(rec.recommendedSlots).toHaveLength(2);
    expect(rec.recommendedSlots[0].conflictFree).toBe(true);
    expect(rec.recommendedSlots[0].withinCapacity).toBe(true);
    expect(rec.alternativeTimes.length).toBeGreaterThan(0);
    expect(rec.provenance.requiresHumanApproval).toBe(true);
  });

  it('(l) recommendTeacherAllocations respects workload headroom and strictly isolates compensation', () => {
    const candidates = [
      { id: 't-busy', displayName: 'Busy Bob', subjectIds: ['subj-math'], available: true, hasConflict: false, activeSessionCount: 10, maxSessionsCap: 10 },
      { id: 't-free', displayName: 'Free Fiona', subjectIds: ['subj-math'], available: true, hasConflict: false, activeSessionCount: 2, maxSessionsCap: 8 },
    ];

    const rec = recommendTeacherAllocations('subj-math', candidates);

    expect(rec.suggestions[0].teacherId).toBe('t-free');
    expect(rec.suggestions[0].capacityStatus).toBe('AVAILABLE');
    expect(rec.suggestions[1].teacherId).toBe('t-busy');
    expect(rec.suggestions[1].capacityStatus).toBe('AT_CAPACITY');
    expect(rec.suggestions[1].eligible).toBe(false);

    // Strict Privacy: zero salary, rates, or remuneration fields exist
    const json = JSON.stringify(rec);
    expect(json).not.toMatch(/"(rate|hourly_rate|pay_rate|salary|payroll|compensation)"\s*:/i);
  });

  it('(m) draftParentCommunication generates multi-type drafts redacting money and diagnostic words', () => {
    const draft = draftParentCommunication({
      studentId: 'stud-1',
      studentName: 'Joseph',
      draftType: 'PROGRESS_COMMUNICATION',
      observations: [
        { observationText: 'Joseph demonstrated solid mastery of fractions.', visibility: 'parent_visible' },
        { observationText: 'Fee arrears of UGX 150,000 remain on file.', visibility: 'parent_visible' },
        { observationText: 'Psychological syndrome evaluation note.', visibility: 'internal_only' },
      ],
    });

    expect(draft.subject).toContain('Academic Progress Overview');
    expect(draft.body).toContain('Joseph');
    expect(draft.body).not.toContain('UGX');
    expect(draft.body).not.toContain('150,000');
    expect(draft.body).not.toContain('syndrome');
    expect(draft.sourceCount).toBe(2);
    expect(draft.provenance.isAiDrafted).toBe(true);
  });

  it('(n) validateAiOutput validates correct schemas and catches invalid model payloads', () => {
    const valid = validateAiOutput(SessionSummarySchema, {
      sessionId: 'ses-1',
      body: 'Valid summary',
      presentCount: 2,
      participantCount: 3,
      curriculumRef: null,
      keyPoints: ['Point 1'],
      provenance: {
        generatedBy: 'AI',
        modelOrEngine: 'somacampus-deterministic-advisory-v1',
        generatedAt: new Date().toISOString(),
        sourceEvidenceIds: [],
        status: 'DRAFT',
        approvedBy: null,
        approvedAt: null,
        isAiDrafted: true,
        requiresHumanApproval: true,
      },
      shareable: false,
      isEmpty: false,
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvedBy: null,
    });

    expect(valid.status).toBe('SUCCESS');
    expect(valid.data).toBeDefined();

    const invalid = validateAiOutput(SessionSummarySchema, {
      sessionId: 'ses-invalid',
      presentCount: -5, // Negative violation
    });

    expect(invalid.status).toBe('INVALID_AI_OUTPUT');
    expect(invalid.error).toBeDefined();
  });
});
