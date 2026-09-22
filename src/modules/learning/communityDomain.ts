/**
 * P2D community policy (pure). Principle: community maturity follows
 * learner maturity. Teacher-led is the floor. Peer is policy-gated.
 */

export interface CommunityPolicy {
  schoolId: string;
  stageKey: string;
  allowTeacherLed: boolean;
  allowStudyGroups: boolean;
  allowPeerReview: boolean;
  allowPeerReplies: boolean;
  allowClubs: boolean;
  peerAgeFloor: number | null;
  requireModeration: boolean;
  parentVisibilityUnder13: boolean;
}

export type CommunityType = 'teacher_led' | 'study_group' | 'peer_review' | 'club';

export interface CapabilityCheck {
  allowed: boolean;
  reason: string;
}

export const DEFAULT_POLICY: Omit<CommunityPolicy, 'schoolId' | 'stageKey'> = {
  allowTeacherLed: true,
  allowStudyGroups: false,
  allowPeerReview: false,
  allowPeerReplies: false,
  allowClubs: false,
  peerAgeFloor: null,
  requireModeration: true,
  parentVisibilityUnder13: true,
};

export function resolvePolicy(
  schoolId: string,
  stageKey: string,
  override?: Partial<CommunityPolicy>,
): CommunityPolicy {
  return {
    ...DEFAULT_POLICY,
    schoolId,
    stageKey: stageKey || '',
    ...(override ?? {}),
    allowTeacherLed: true, // floor — never off
  };
}

export function canCreateCommunity(
  policy: CommunityPolicy,
  type: CommunityType,
  opts: { learnerAge?: number | null } = {},
): CapabilityCheck {
  if (type === 'teacher_led') {
    return { allowed: true, reason: 'Teacher-led is always allowed.' };
  }
  if (type === 'study_group' && !policy.allowStudyGroups) {
    return { allowed: false, reason: 'Study groups are off for this stage policy.' };
  }
  if (type === 'peer_review' && !policy.allowPeerReview) {
    return { allowed: false, reason: 'Peer review is off for this stage policy.' };
  }
  if (type === 'club' && !policy.allowClubs) {
    return { allowed: false, reason: 'Clubs are off for this stage policy.' };
  }

  if (policy.peerAgeFloor != null && opts.learnerAge != null && opts.learnerAge < policy.peerAgeFloor) {
    return {
      allowed: false,
      reason: `Learner is under the peer age floor (${policy.peerAgeFloor}).`,
    };
  }

  return { allowed: true, reason: 'Allowed by school policy.' };
}

/** Learner post/reply rights inside a space. */
export function canLearnerPost(
  policy: CommunityPolicy,
  type: CommunityType,
  action: 'post' | 'reply',
): CapabilityCheck {
  if (type === 'teacher_led') {
    // Learners contribute only via teacher-opened prompts; free posts stay off.
    return {
      allowed: false,
      reason: 'Teacher-led spaces: the teacher posts; learners respond only when invited.',
    };
  }
  if (action === 'post' && (type === 'study_group' || type === 'club')) {
    return policy.allowStudyGroups || policy.allowClubs
      ? { allowed: true, reason: 'Allowed by school policy (moderated).' }
      : { allowed: false, reason: 'Posting is off for this stage policy.' };
  }
  if (action === 'reply' && type === 'peer_review') {
    return policy.allowPeerReplies || policy.allowPeerReview
      ? { allowed: true, reason: 'Structured peer reply allowed by policy.' }
      : { allowed: false, reason: 'Peer replies are off for this stage policy.' };
  }
  return { allowed: false, reason: 'Not permitted by policy.' };
}

export function parentCanRead(policy: CommunityPolicy, learnerAge: number | null): boolean {
  if (learnerAge == null) return policy.parentVisibilityUnder13;
  return learnerAge < 13 ? policy.parentVisibilityUnder13 : true;
}
