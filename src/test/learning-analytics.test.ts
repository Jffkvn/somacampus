import { describe, it, expect } from 'vitest';
import {
  buildStudentAnalytics,
  averageScoreClaim,
  claimOrNotEnough,
  weakObjectiveClaims,
  NOT_ENOUGH,
} from '../modules/learning/analyticsDomain';

describe('P2B-1 evidence-cited analytics', () => {
  it('refuses to guess when evidence is thin', () => {
    const c = averageScoreClaim([]);
    expect(c.value).toBeNull();
    expect(c.note).toBe(NOT_ENOUGH);
    expect(c.evidence).toEqual([]);
  });

  it('cites every result row behind an average', () => {
    const c = averageScoreClaim([
      { score: 4, maxScore: 5, ref: { kind: 'learning_result', id: 'r1', label: 'Quiz' } },
      { score: 8, maxScore: 10, ref: { kind: 'learning_result', id: 'r2', label: 'HW' } },
    ]);
    expect(c.value).toBe('80%');
    expect(c.evidence.map((e) => e.id)).toEqual(['r1', 'r2']);
  });

  it('flags weak objectives only with enough evidence', () => {
    const claims = weakObjectiveClaims([
      {
        objectiveCode: 'F1',
        objectiveTitle: 'Fractions',
        pct: 40,
        evidenceCount: 3,
        evidence: [{ kind: 'learning_result', id: 'r1', label: 'x' }],
      },
      {
        objectiveCode: 'G1',
        objectiveTitle: 'Geometry',
        pct: 40,
        evidenceCount: 1,
        evidence: [{ kind: 'learning_result', id: 'r2', label: 'y' }],
      },
    ]);
    expect(claims.map((c) => c.key)).toEqual(['obj-F1']);
    expect(claims[0].title).toMatch(/Fractions/);
  });

  it('builds student analytics with completion + weak objectives', () => {
    const a = buildStudentAnalytics({
      studentId: 's1',
      expectedCount: 4,
      resultRows: [
        { id: 'r1', score: 2, maxScore: 5, label: 'Quiz', at: '2026-09-22' },
        { id: 'r2', score: 3, maxScore: 5, label: 'HW', at: '2026-09-21' },
      ],
      objectives: [],
    });
    expect(a.claims.find((c) => c.key === 'completion')?.value).toBe('50%');
    expect(a.claims.find((c) => c.key === 'completion')?.evidence.length).toBe(2);
    expect(a.claims.find((c) => c.key === 'avg')?.value).toBe('50%');
  });

  it('claimOrNotEnough enforces min evidence', () => {
    const c = claimOrNotEnough('x', 'X', '1', [], 1);
    expect(c.note).toBe(NOT_ENOUGH);
  });
});
