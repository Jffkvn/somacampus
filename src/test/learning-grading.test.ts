import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BANDS,
  UG_DIVISION_PRESET,
  buildTermOverall,
  computeAggregate,
  computeMean,
  computeTotal,
  gradeFor,
  validateScale,
  type GradingScale,
  type SubjectMark,
} from '../modules/learning/gradingDomain';

const scale: GradingScale = {
  id: 'g1',
  schoolId: 's1',
  name: 'Default',
  formula: 'mean',
  bands: DEFAULT_BANDS,
};

const marks: SubjectMark[] = [
  { subjectCode: 'MATH', subjectName: 'Mathematics', score: 82, maxScore: 100 },
  { subjectCode: 'ENG', subjectName: 'English', score: 76, maxScore: 100 },
  { subjectCode: 'SCI', subjectName: 'Science', score: 88, maxScore: 100 },
];

describe('P3-A grading & aggregates (configurable)', () => {
  it('maps pct to grade bands (school table, not hard-coded)', () => {
    expect(gradeFor(scale, 82)?.grade).toBe('A');
    expect(gradeFor(scale, 76)?.grade).toBe('B');
    expect(gradeFor(scale, 49)?.grade).toBe('E');
  });

  it('mean formula averages subject percentages', () => {
    const overall = buildTermOverall(scale, marks);
    expect(overall.formula).toBe('mean');
    expect(overall.value).toBe(82);
    expect(overall.label).toBe('82%');
    expect(overall.subjects).toHaveLength(3);
  });

  it('total formula sums raw scores (school total style)', () => {
    const total = buildTermOverall({ ...scale, formula: 'total' }, marks);
    expect(total.value).toBe(246);
  });

  it('aggregate_division computes aggregate + division label', () => {
    const aggScale: GradingScale = {
      ...scale,
      formula: 'aggregate_division',
      divisions: UG_DIVISION_PRESET,
    };
    // A=1, B=2, A=1 → aggregate 4 → Division 1
    const overall = buildTermOverall(aggScale, marks);
    expect(computeAggregate(aggScale, marks)).toBe(4);
    expect(overall.division).toBe('Division 1');
  });

  it('honours subject weights on mean', () => {
    const weighted = buildTermOverall(
      { ...scale, subjectWeights: { MATH: 2 } },
      marks,
    );
    // (82*2 + 76 + 88) / 4 = 82
    expect(weighted.value).toBe(82);
    expect(computeMean(scale, marks)).toBe(82);
  });

  it('validateScale fails closed on bad bands', () => {
    expect(() => validateScale({ bands: [], formula: 'mean' })).toThrow(/bands/i);
    expect(() =>
      validateScale({
        bands: [{ minPct: 90, maxPct: 10, grade: 'X', points: 1 }],
        formula: 'mean',
      }),
    ).toThrow(/minPct/);
  });

  it('computeTotal is deterministic', () => {
    expect(computeTotal(marks)).toBe(246);
  });
});
