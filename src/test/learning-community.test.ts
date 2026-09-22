import { describe, it, expect } from 'vitest';
import {
  canCreateCommunity,
  canLearnerPost,
  parentCanRead,
  resolvePolicy,
} from '../modules/learning/communityDomain';

describe('P2D community maturity policy', () => {
  it('teacher-led is always the floor', () => {
    const p = resolvePolicy('s1', 'stage-3');
    expect(p.allowTeacherLed).toBe(true);
    const check = canCreateCommunity(p, 'teacher_led');
    expect(check.allowed).toBe(true);
  });

  it('peer/club require school policy (default off)', () => {
    const p = resolvePolicy('s1', 'stage-3');
    expect(canCreateCommunity(p, 'peer_review').allowed).toBe(false);
    expect(canCreateCommunity(p, 'club').allowed).toBe(false);
    expect(canCreateCommunity(p, 'study_group').allowed).toBe(false);
  });

  it('peer age floor blocks young learners even when policy is on', () => {
    const p = resolvePolicy('s1', 'stage-6', {
      allowPeerReview: true,
      peerAgeFloor: 11,
    });
    expect(canCreateCommunity(p, 'peer_review', { learnerAge: 9 }).allowed).toBe(false);
    expect(canCreateCommunity(p, 'peer_review', { learnerAge: 12 }).allowed).toBe(true);
  });

  it('learners cannot free-post in teacher-led spaces', () => {
    const p = resolvePolicy('s1', 'stage-3');
    expect(canLearnerPost(p, 'teacher_led', 'post').allowed).toBe(false);
  });

  it('parent visibility under 13 is policy-controlled', () => {
    const p = resolvePolicy('s1', 'stage-3');
    expect(parentCanRead(p, 8)).toBe(true);
    const off = resolvePolicy('s1', 'stage-3', { parentVisibilityUnder13: false });
    expect(parentCanRead(off, 8)).toBe(false);
  });
});
