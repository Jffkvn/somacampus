import { describe, it, expect } from 'vitest';
import { formatPromotionLine, validatePromotion } from '../modules/learning/promotionDomain';

describe('P3-G promotion record (thin)', () => {
  it('requires year, from/to labels, and a valid decision', () => {
    expect(() =>
      validatePromotion({ academicYear: '', fromLabel: 'P5', toLabel: 'P6', decision: 'promoted' }),
    ).toThrow(/academicYear/i);
    expect(() =>
      validatePromotion({ academicYear: '2026', fromLabel: 'P5', toLabel: 'P6', decision: 'nope' as any }),
    ).toThrow(/decision/i);
  });

  it('decision=other requires a reason', () => {
    expect(() =>
      validatePromotion({
        academicYear: '2026',
        fromLabel: 'P5',
        toLabel: 'P6',
        decision: 'other',
      }),
    ).toThrow(/reason/i);
    expect(() =>
      validatePromotion({
        academicYear: '2026',
        fromLabel: 'P5',
        toLabel: 'P6',
        decision: 'other',
        reason: 'Family relocated',
      }),
    ).not.toThrow();
  });

  it('formats a one-line progression record', () => {
    expect(
      formatPromotionLine({
        fromLabel: 'P5',
        toLabel: 'P6',
        decision: 'promoted',
        academicYear: '2026',
      }),
    ).toBe('2026: P5 → P6');
  });
});
