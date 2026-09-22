import { describe, it, expect } from 'vitest';
import {
  canReplyInSpace,
  peerRequiresModeration,
  validateReport,
} from '../modules/learning/moderationDomain';
import { resolvePolicy } from '../modules/learning/communityDomain';

describe('P2D-4 moderated peer + clubs', () => {
  it('teacher-led spaces stay teacher-curated (no open peer feed)', () => {
    const p = resolvePolicy('s1', 'stage-3');
    expect(canReplyInSpace(p, 'teacher_led').allowed).toBe(false);
  });

  it('club replies require policy (default off)', () => {
    const off = resolvePolicy('s1', 'stage-9');
    expect(canReplyInSpace(off, 'club').allowed).toBe(false);
    const on = resolvePolicy('s1', 'stage-9', { allowClubs: true });
    expect(canReplyInSpace(on, 'club').allowed).toBe(true);
  });

  it('moderation stays required by default', () => {
    expect(peerRequiresModeration(resolvePolicy('s1', 'stage-6'))).toBe(true);
  });

  it('reports need a reason and exactly one target', () => {
    expect(() => validateReport({ reason: '', postId: 'p' })).toThrow(/reason/i);
    expect(() => validateReport({ reason: 'bullying', postId: 'p', replyId: 'r' })).toThrow(
      /exactly one/i,
    );
    expect(() => validateReport({ reason: 'bullying', replyId: 'r' })).not.toThrow();
  });
});
