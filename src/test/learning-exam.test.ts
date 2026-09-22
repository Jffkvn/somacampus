import { describe, it, expect } from 'vitest';
import {
  pctFor,
  sittingStatusFromMarks,
  validateMark,
  validateSitting,
} from '../modules/learning/examDomain';

describe('P3-B exam sitting + human marks', () => {
  it('sitting requires title, term, maxMarks > 0', () => {
    expect(() => validateSitting({ title: '', termLabel: 'T2', maxMarks: 100 })).toThrow(/title/i);
    expect(() => validateSitting({ title: 'Math', termLabel: '', maxMarks: 100 })).toThrow(/term/i);
    expect(() => validateSitting({ title: 'Math', termLabel: 'T2', maxMarks: 0 })).toThrow(/maxMarks/i);
    expect(() =>
      validateSitting({ title: 'Math', termLabel: 'T2', maxMarks: 50, delivery: 'in_person_only' }),
    ).not.toThrow();
  });

  it('marks are human-required and bounded', () => {
    expect(() => validateMark(null, 100)).toThrow(/human mark/i);
    expect(() => validateMark(120, 100)).toThrow(/between/i);
    expect(() => validateMark(-1, 100)).toThrow(/between/i);
    expect(() => validateMark(74, 100)).not.toThrow();
  });

  it('status tracks marks without finalising', () => {
    expect(sittingStatusFromMarks('draft', [{ studentId: 'a', score: null }])).toBe('draft');
    expect(
      sittingStatusFromMarks('draft', [
        { studentId: 'a', score: null },
        { studentId: 'b', score: 70 },
      ]),
    ).toBe('marks_entered');
    expect(sittingStatusFromMarks('finalised', [{ studentId: 'b', score: 70 }])).toBe('finalised');
  });

  it('pct is deterministic to 1dp', () => {
    expect(pctFor(74, 100)).toBe(74);
    expect(pctFor(37, 50)).toBe(74);
    expect(pctFor(null, 100)).toBeNull();
  });
});
