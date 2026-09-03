import { describe, it, expect } from 'vitest';
import { greetFirstName } from '../modules/teacher/scheduleUtils';

describe('greetFirstName', () => {
  it.each([
    ['Mrs. Sarah Namukasa', 'Sarah'],
    ['Sarah Namukasa', 'Sarah'],
    ['Mr. David Musoke', 'David'],
    ['Madam', 'Madam'],
    ['', 'Teacher'],
  ])('greetFirstName(%q) → %q', (input, expected) => {
    expect(greetFirstName(input)).toBe(expected);
  });
});
