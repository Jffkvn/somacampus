import { describe, it, expect, vi } from 'vitest';

/**
 * Phase 9I Task 1 — advisory AI assistance (RED).
 *
 * Deterministic, evidence-grounded helpers for the online operation:
 * (1) teacher matching suggestions, (2) session preparation summaries,
 * (3) post-completion session summaries (human-approved before sharing),
 * (4) evidence summaries for parents (approved evidence only).
 *
 * Locked rules (mirroring Phase 8F aiDraftService):
 * - Pure composers: zero DB calls, no network, no secrets, no LLM provider.
 * - Advisory only: every output carries requiresHumanApproval: true and
 *   isAiDrafted: true. Nothing auto-sends, auto-assigns, or auto-shares.
 * - No invented facts: extractive outputs trace to inputs; banned
 *   diagnosis words and (parent surfaces) amounts never appear.
 * - Empty inputs → honest empty messages, never fabricated content.
 */

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line import/first
import { supabase } from '../lib/supabase';
// eslint-disable-next-line import/first
import {
  suggestTeachers,
  prepareSession,
  summarizeSession,
  approveSessionSummary,
  isShareable,
  summarizeForParent,
  EMPTY_PREP_MESSAGE,
  EMPTY_SESSION_SUMMARY_MESSAGE,
} from '../modules/online/onlineAiService';
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

describe('online advisory AI (Phase 9I Task 1) — deterministic, human-approved', () => {
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
    // Conflicting and unqualified teachers rank below, flagged ineligible.
    const rest = result.suggestions.slice(1).map((s) => s.teacherId);
    expect(rest).toContain('t-conflict');
    expect(rest).toContain('t-unqualified');
    expect(result.suggestions.find((s) => s.teacherId === 't-conflict')!.eligible).toBe(false);
    expect(result.suggestions.find((s) => s.teacherId === 't-unqualified')!.eligible).toBe(false);
    // Advisory gate: suggestions never assign by themselves.
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

    // No invented facts: every content token in keyPoints traces to the inputs
    // (sanitiser placeholders allowed).
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
    });

    expect(summary.body).toContain('3');
    expect(summary.body).toContain('5');
    expect(summary.body.toLowerCase()).toContain('fractions');
    expect(summary.requiresHumanApproval).toBe(true);
    expect(summary.isAiDrafted).toBe(true);
    // Unapproved → not shareable.
    expect(summary.shareable).toBe(false);
    expect(summary.approvedBy).toBeNull();
    expect(isShareable(summary)).toBe(false);

    const approved = approveSessionSummary(summary, 'teacher-1');
    expect(approved.shareable).toBe(true);
    expect(approved.approvedBy).toBe('teacher-1');
    expect(isShareable(approved)).toBe(true);
    // Approval returns a new object; the unapproved draft stays unshareable.
    expect(summary.shareable).toBe(false);
    expect(isShareable(summary)).toBe(false);
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
    expect(process.env.NODE_ENV).toBe('test');
    // Empty in → honest empty out (never mock data).
    expect(suggestTeachers('subj-math', []).suggestions).toEqual([]);
    // Same inputs → identical outputs (no randomness, no network).
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
    expect(
      summarizeForParent('Amina', [
        { observationText: 'Amina shared her crayons kindly.', visibility: 'parent_visible' as const },
      ]),
    ).toEqual(
      summarizeForParent('Amina', [
        { observationText: 'Amina shared her crayons kindly.', visibility: 'parent_visible' as const },
      ]),
    );
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
});
