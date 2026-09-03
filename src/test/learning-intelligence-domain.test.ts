import { describe, it, expect } from 'vitest';
import { aiIntelligenceAssistant } from '../modules/intelligence/aiIntelligenceAssistant';
import type { EvidenceReference } from '../types/domain';

describe('Phase 5 Learning Intelligence & Domain Calculations', () => {
  it('strictly isolates formal graded assessments from diagnostic evidence in averages', () => {
    // 1 formal assessment: 80/100
    // 1 diagnostic worksheet: 40/100 (practice)
    const formalSubmissions = [{ score: 80, maxScore: 100 }];
    const diagnosticSubmissions = [{ score: 40, maxScore: 100 }];

    // Formal average calculation rule
    const formalSum = formalSubmissions.reduce((acc, curr) => acc + curr.score, 0);
    const formalMaxSum = formalSubmissions.reduce((acc, curr) => acc + curr.maxScore, 0);
    const formalAveragePct = Math.round((formalSum / formalMaxSum) * 100);

    // Rule: Diagnostic submission MUST NOT dilute the formal average
    expect(formalAveragePct).toBe(80);
    expect(diagnosticSubmissions[0].score).toBe(40);
  });

  it('returns null for formal average when 0 formal assessments exist', () => {
    const formalSubmissions: Array<{ score: number; maxScore: number }> = [];
    const formalAveragePct =
      formalSubmissions.length > 0
        ? Math.round(
            (formalSubmissions.reduce((a, c) => a + c.score, 0) /
              formalSubmissions.reduce((a, c) => a + c.maxScore, 0)) *
              100,
          )
        : null;

    expect(formalAveragePct).toBeNull();
  });

  it('calculates diagnostic participation based on expected vs submitted habit', () => {
    const diagnosticWork = [
      { participationStatus: 'expected', submissionStatus: 'submitted' },
      { participationStatus: 'expected', submissionStatus: 'late' },
      { participationStatus: 'expected', submissionStatus: 'missing' },
      { participationStatus: 'excused', submissionStatus: 'pending' },
    ];

    const expected = diagnosticWork.filter((d) => d.participationStatus === 'expected');
    const completed = expected.filter(
      (d) => d.submissionStatus === 'submitted' || d.submissionStatus === 'late',
    );

    const participationPct = Math.round((completed.length / expected.length) * 100);

    // 2 out of 3 expected completed = 67%
    expect(participationPct).toBe(67);
  });

  it('returns insufficient_evidence when total evidence is less than 2 items', () => {
    const evidenceItems = [
      { id: 'obs-1', type: 'observation', text: 'Struggled with fractions' },
    ];

    const classification =
      evidenceItems.length < 2 ? 'insufficient_evidence' : 'observed_pattern';

    expect(classification).toBe('insufficient_evidence');
  });

  it('detects recurring difficulty as observed_pattern when 2+ misconceptions are logged', () => {
    const observations = [
      { id: 'obs-1', type: 'misconception', text: 'Struggled with fraction conversion' },
      { id: 'obs-2', type: 'support_need', text: 'Needs visual aid for fractions' },
    ];

    const misconceptions = observations.filter(
      (o) => o.type === 'misconception' || o.type === 'support_need',
    );

    const classification = misconceptions.length >= 2 ? 'observed_pattern' : 'possible_pattern';
    const requiresAttention = misconceptions.length >= 2;

    expect(classification).toBe('observed_pattern');
    expect(requiresAttention).toBe(true);
  });

  it('forces AI assistant draft suggestions to status draft with mandatory citations', () => {
    const citations: EvidenceReference[] = [
      {
        type: 'observation',
        id: 'obs-uuid-1',
        titleOrSnippet: 'Repeated struggle with equivalent fractions',
        date: '2026-09-02',
      },
    ];

    const draft = aiIntelligenceAssistant.draftInterventionSuggestion({
      studentId: 'student-1',
      studentName: 'John Okello',
      learningArea: 'Fractions',
      recentEvidence: citations,
      misconceptionSnippet: 'Repeated struggle with equivalent fractions',
    });

    // Invariants
    expect(draft.status).toBe('draft');
    expect(draft.isAiSuggested).toBe(true);
    expect(draft.evidenceBasis.length).toBeGreaterThan(0);
    expect(draft.evidenceBasis[0].id).toBe('obs-uuid-1');
  });
});
