import { describe, it, expect } from 'vitest';
import { selectActiveEntry } from '../modules/teacher/scheduleUtils';

const sched = (ends: string[]) => ends.map((endTime) => ({ endTime }));

describe('selectActiveEntry (day-over helper)', () => {
  it('morning before all periods → first upcoming (0)', () => {
    expect(selectActiveEntry(sched(['09:00', '10:00', '12:00']), '07:30', true)).toBe(0);
  });

  it('mid-day after first period ends → second (1)', () => {
    expect(selectActiveEntry(sched(['09:00', '10:00', '12:00']), '09:30', true)).toBe(1);
  });

  it('after last period ends → -1 (day over)', () => {
    expect(selectActiveEntry(sched(['09:00', '10:00', '12:00']), '13:25', true)).toBe(-1);
  });

  it('exact endTime boundary is past (strict >): now == endTime skips that entry', () => {
    expect(selectActiveEntry(sched(['09:00', '10:00']), '09:00', true)).toBe(1);
  });

  it('non-today viewing → 0 regardless of time', () => {
    expect(selectActiveEntry(sched(['09:00', '10:00']), '13:25', false)).toBe(0);
  });

  it('empty schedule → -1 (today and non-today)', () => {
    expect(selectActiveEntry([], '07:30', true)).toBe(-1);
    expect(selectActiveEntry([], '07:30', false)).toBe(-1);
  });
});
