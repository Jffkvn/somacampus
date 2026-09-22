import { describe, it, expect } from 'vitest';
import {
  suggestGaps,
  suggestPacing,
  validateDecision,
} from '../modules/learning/suggestionDomain';

const ev = [{ kind: 'learning_result' as const, id: 'r1', label: 'Quiz' }];

describe('P2B-2 / P2B-3 suggestions (recommend only)', () => {
  it('suggests gaps only with enough evidence and low pct', () => {
    const out = suggestGaps([
      {
        objectiveCode: 'F1',
        objectiveTitle: 'Fractions',
        pct: 45,
        evidenceCount: 3,
        evidence: ev,
      },
      {
        objectiveCode: 'G1',
        objectiveTitle: 'Geometry',
        pct: 45,
        evidenceCount: 1,
        evidence: ev,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toMatch(/Fractions/);
    expect(out[0].rationale).toMatch(/human decides/i);
    expect(out[0].evidenceLinks).toHaveLength(1);
  });

  it('suggests pacing for term_paced lag and idle days', () => {
    const out = suggestPacing({
      expectedSoFar: 5,
      completedSoFar: 1,
      daysSinceLastWork: 12,
      evidence: ev,
      deliveryPace: 'term_paced',
    });
    expect(out.map((s) => s.title)).toEqual(
      expect.arrayContaining(['Behind term pace', 'No work for 12 days']),
    );
  });

  it('never paces self_paced learners', () => {
    const out = suggestPacing({
      expectedSoFar: 5,
      completedSoFar: 0,
      daysSinceLastWork: null,
      evidence: ev,
      deliveryPace: 'self_paced',
    });
    expect(out).toHaveLength(0);
  });

  it('decisions must be accepted or dismissed', () => {
    expect(() => validateDecision('accepted')).not.toThrow();
    expect(() => validateDecision('auto')).toThrow(/accepted or dismissed/i);
  });
});
