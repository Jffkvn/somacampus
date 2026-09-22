import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PEER_PROMPTS,
  peerReviewWritesGradebook,
  validatePeerResponse,
} from '../modules/learning/peerReviewDomain';

describe('P2D-3 structured peer review (formative only)', () => {
  it('never writes the gradebook', () => {
    expect(peerReviewWritesGradebook()).toBe(false);
  });

  it('rejects self-review', () => {
    expect(() =>
      validatePeerResponse({
        authorStudentId: 'a',
        workStudentId: 'a',
        prompts: DEFAULT_PEER_PROMPTS,
        answers: { well: 'x', improve: 'y', reasoning: 'z', suggestion: 'w' },
      }),
    ).toThrow(/your own work/i);
  });

  it('requires every teacher prompt', () => {
    expect(() =>
      validatePeerResponse({
        authorStudentId: 'a',
        workStudentId: 'b',
        prompts: DEFAULT_PEER_PROMPTS,
        answers: { well: 'good' },
      }),
    ).toThrow(/answer every prompt/i);
  });

  it('rejects free-form-only reviews without teacher prompts', () => {
    expect(() =>
      validatePeerResponse({
        authorStudentId: 'a',
        workStudentId: 'b',
        prompts: [],
        answers: { note: 'hi' },
      }),
    ).toThrow(/teacher prompts/i);
  });

  it('accepts a complete structured review', () => {
    expect(() =>
      validatePeerResponse({
        authorStudentId: 'a',
        workStudentId: 'b',
        prompts: DEFAULT_PEER_PROMPTS,
        answers: {
          well: 'Clear method',
          improve: 'Show units',
          reasoning: 'They wrote 7×8=56 because…',
          suggestion: 'Add a check step',
        },
      }),
    ).not.toThrow();
  });
});
