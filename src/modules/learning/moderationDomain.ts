/**
 * P2D-4 moderated peer + clubs (pure policy checks).
 * Free peer exists only when school policy opens it AND moderation is on.
 */
import { canCreateCommunity, canLearnerPost, type CommunityPolicy, type CommunityType } from './communityDomain';

export interface ModerationReport {
  id: string;
  postId: string | null;
  replyId: string | null;
  reason: string;
  status: 'open' | 'actioned' | 'dismissed';
}

export function canReplyInSpace(
  policy: CommunityPolicy,
  type: CommunityType,
): { allowed: boolean; reason: string } {
  if (type === 'teacher_led') {
    return {
      allowed: false,
      reason: 'Teacher-led spaces stay teacher-curated (no open peer feed).',
    };
  }
  if (type === 'club') {
    const clubOk = canCreateCommunity(policy, 'club').allowed;
    const replyOk = canLearnerPost(policy, 'club', 'post').allowed;
    return clubOk && replyOk
      ? { allowed: true, reason: 'Club replies allowed by policy (moderated).' }
      : { allowed: false, reason: 'Clubs are off for this stage policy.' };
  }
  if (type === 'study_group') {
    return policy.allowStudyGroups
      ? { allowed: true, reason: 'Study group replies allowed by policy (moderated).' }
      : { allowed: false, reason: 'Study groups are off for this stage policy.' };
  }
  if (type === 'peer_review') {
    return canLearnerPost(policy, 'peer_review', 'reply');
  }
  return { allowed: false, reason: 'Replies are not permitted here.' };
}

/** Free peer only if moderation queue is required/enabled by policy. */
export function peerRequiresModeration(policy: CommunityPolicy): boolean {
  return policy.requireModeration !== false;
}

export function validateReport(input: { reason: string; postId?: string | null; replyId?: string | null }): void {
  if (!input.reason?.trim()) throw new Error('moderation: reason is required');
  const targets = Number(Boolean(input.postId)) + Number(Boolean(input.replyId));
  if (targets !== 1) throw new Error('moderation: report exactly one post or reply');
}
