import { describe, it, expect } from 'vitest';
import {
  rollupObjectives,
  packWeightedTotal,
  buildPackProgress,
  validatePackInput,
  type PackItemSummary,
} from '../modules/learning/assessmentPackDomain';

const items: PackItemSummary[] = [
  {
    id: 'i1',
    itemTitle: 'Fractions quiz',
    quizId: 'q1',
    learningActivityId: null,
    objectiveMap: [{ objectiveCode: 'F1', objectiveTitle: 'Fractions' }],
    weight: 1,
  },
  {
    id: 'i2',
    itemTitle: 'Geometry activity',
    quizId: null,
    learningActivityId: 'a1',
    objectiveMap: [
      { objectiveCode: 'G1', objectiveTitle: 'Geometry' },
      { objectiveCode: 'F1', objectiveTitle: 'Fractions' },
    ],
    weight: 2,
  },
  {
    id: 'i3',
    itemTitle: 'Oral check',
    quizId: null,
    learningActivityId: 'a2',
    objectiveMap: [{ objectiveCode: 'G1', objectiveTitle: 'Geometry' }],
    weight: 1,
  },
];

describe('P2A-4 assessment pack objective rollup', () => {
  it('rolls up scores per objective deterministically (weight scales both sides)', () => {
    const rollup = rollupObjectives(items, {
      i1: { score: 4, maxScore: 5, source: 'quiz' },
      i2: { score: 8, maxScore: 10, source: 'rubric' },
      i3: { score: 0, maxScore: 0, source: 'observation' }, // max 0 → still counts evidence but pct null on its own
    });
    const f1 = rollup.find((r) => r.objectiveCode === 'F1')!;
    // F1: i1 (4/5 ×1) + i2 (8/10 ×2) = 4+16 / 5+20
    expect(f1.scoreSum).toBe(20);
    expect(f1.maxSum).toBe(25);
    expect(f1.pct).toBe(80);
    expect(f1.evidenceCount).toBe(2);
    expect(f1.itemIds).toContain('i1');
    expect(f1.itemIds).toContain('i2');
  });

  it('skips items without scored results (no invented mastery)', () => {
    const rollup = rollupObjectives(items, {
      i1: { score: 4, maxScore: 5, source: 'quiz' },
    });
    expect(rollup.find((r) => r.objectiveCode === 'G1')).toBeUndefined();
  });

  it('weighted pack total uses explicit item weights', () => {
    const total = packWeightedTotal(items, {
      i1: { score: 4, maxScore: 5, source: 'quiz' },
      i2: { score: 8, maxScore: 10, source: 'rubric' },
    });
    // 4*1 + 8*2 = 20 ; 5*1 + 10*2 = 25
    expect(total.score).toBe(20);
    expect(total.maxScore).toBe(25);
    expect(total.pct).toBe(80);
  });

  it('completion is Progress ≠ mastery (scored items only)', () => {
    const p = buildPackProgress({
      packId: 'p1',
      packKind: 'unit',
      title: 'Unit 1',
      items,
      resultsByItem: { i1: { score: 4, maxScore: 5, source: 'quiz' } },
    });
    expect(p.completionPct).toBe(33);
    expect(p.objectives.length).toBeGreaterThan(0);
  });

  it('validatePackInput fails closed without targets', () => {
    expect(() =>
      validatePackInput({
        title: 'Unit',
        packKind: 'unit',
        onlineOfferingId: 'o1',
        items: [{ itemTitle: 'x' }],
      }),
    ).toThrow(/quiz or learning activity/i);
  });
});
