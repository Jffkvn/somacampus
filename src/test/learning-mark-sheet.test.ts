import { describe, it, expect } from 'vitest';
import {
  confirmMarks,
  matchesStudent,
  parseMarkSheetText,
} from '../modules/learning/markSheetDomain';

describe('P3-E mark-sheet assist (suggest → teacher confirm)', () => {
  it('suggests marks from mark-sheet text (never auto-commits)', () => {
    const r = parseMarkSheetText('Amari Kyomugisha 74\nJohn Okello | 82\n???');
    expect(r.suggestions).toHaveLength(2);
    expect(r.suggestions[0]).toMatchObject({ studentLabel: 'Amari Kyomugisha', score: 74 });
    expect(r.suggestions[0].confidence).toBe('high');
  });

  it('confirmMarks keeps only teacher-confirmed rows', () => {
    const { suggestions } = parseMarkSheetText('Amari Kyomugisha 74\nJohn Okello 82');
    const confirmed = confirmMarks(suggestions, ['amari kyomugisha']);
    expect(confirmed).toEqual([{ studentLabel: 'Amari Kyomugisha', score: 74 }]);
  });

  it('matchesStudent is name-tolerant for roster link', () => {
    expect(matchesStudent('Amari K.', 'Amari Kyomugisha')).toBe(true);
    expect(matchesStudent('John', 'Amari Kyomugisha')).toBe(false);
  });
});
