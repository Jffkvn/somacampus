import { describe, it, expect } from 'vitest';
import { parseStatValue } from '../lib/numberFlow';

describe('numberFlow parseStatValue (P1)', () => {
  it('parses plain numbers', () => {
    const { numeric, format } = parseStatValue(12800000);
    expect(numeric).toBe(12800000);
    expect(format(12800000)).toBe('12,800,000');
  });

  it('parses UGX money strings with prefix', () => {
    const { numeric, format } = parseStatValue('UGX 12,800,000');
    expect(numeric).toBe(12800000);
    expect(format(12800000)).toBe('UGX 12,800,000');
  });

  it('parses percentages', () => {
    const { numeric, format } = parseStatValue('10.3%');
    expect(numeric).toBeCloseTo(10.3);
    expect(format(10.3)).toBe('10.3%');
  });

  it('passes through non-numeric strings', () => {
    const { numeric, format } = parseStatValue('Pending');
    expect(numeric).toBeNull();
    expect(format(0)).toBe('Pending');
  });
});
