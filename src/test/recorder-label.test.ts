import { describe, it, expect } from 'vitest';
import { deriveRecorderRole } from '../modules/teacher/scheduleUtils';

describe('deriveRecorderRole', () => {
  it('returns class_teacher when recorder is the class teacher', () => {
    expect(deriveRecorderRole('t1', 't1', ['t2', 't3'])).toBe('class_teacher');
  });

  it('returns subject_teacher when recorder is in schedule list', () => {
    expect(deriveRecorderRole('t2', 't1', ['t2', 't3'])).toBe('subject_teacher');
  });

  it('returns substitute when recorder is not class teacher nor in schedule', () => {
    expect(deriveRecorderRole('t9', 't1', ['t2', 't3'])).toBe('substitute');
  });
});
