/**
 * P2D-4 moderated peer service — replies + moderation queue.
 * Policy-gated via moderationDomain.canReplyInSpace. Never writes grades.
 */
import { supabase } from '../../lib/supabase';
import { canReplyInSpace, peerRequiresModeration, validateReport, type ModerationReport } from './moderationDomain';
import { communityService } from './communityService';
import type { CommunityType } from './communityDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapReport(r: any): ModerationReport {
  return {
    id: r.id,
    postId: r.post_id ?? null,
    replyId: r.reply_id ?? null,
    reason: r.reason,
    status: r.status,
  };
}

export const moderationService = {
  async addReply(input: {
    schoolId: string;
    communityId: string;
    communityType: CommunityType;
    stageKey?: string;
    postId?: string | null;
    authorPersonId: string;
    body: string;
  }): Promise<{ id: string }> {
    if (!input.body?.trim()) throw new Error('moderation.addReply: body is required');
    const policy = await communityService.getPolicy(input.schoolId, input.stageKey ?? '');
    const check = canReplyInSpace(policy, input.communityType);
    if (!check.allowed) throw new Error(`moderation.addReply: ${check.reason}`);
    if (peerRequiresModeration(policy) === false && input.communityType !== 'teacher_led') {
      // still fine — replies exist but remain reportable
    }
    if (isMockEnv()) throw new Error('moderation.addReply: unavailable without live database');
    const { data, error } = await supabase
      .from('community_replies')
      .insert({
        school_id: input.schoolId,
        community_id: input.communityId,
        post_id: input.postId ?? null,
        author_person_id: input.authorPersonId,
        body: input.body.trim(),
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`moderation.addReply: ${error?.message ?? 'no row'}`);
    return { id: String(data.id) };
  },

  async report(input: {
    schoolId: string;
    reportedBy: string;
    reason: string;
    postId?: string | null;
    replyId?: string | null;
  }): Promise<ModerationReport> {
    validateReport(input);
    if (isMockEnv()) throw new Error('moderation.report: unavailable without live database');
    const { data, error } = await supabase
      .from('community_reports')
      .insert({
        school_id: input.schoolId,
        post_id: input.postId ?? null,
        reply_id: input.replyId ?? null,
        reported_by: input.reportedBy,
        reason: input.reason.trim(),
        status: 'open',
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`moderation.report: ${error?.message ?? 'no row'}`);
    return mapReport(data);
  },

  async listOpenReports(schoolId: string): Promise<ModerationReport[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('community_reports')
      .select('*')
      .eq('school_id', schoolId)
      .eq('status', 'open')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`moderation.listOpenReports: ${error.message}`);
    return (data ?? []).map(mapReport);
  },

  /** Hide a reply and action the report (teacher/moderator). */
  async hideReplyAndActionReport(input: {
    replyId: string;
    reportId: string;
    hiddenReason: string;
    decidedBy: string;
  }): Promise<void> {
    if (isMockEnv()) throw new Error('moderation.hideReply: unavailable without live database');
    const { error: hideErr } = await supabase
      .from('community_replies')
      .update({ is_hidden: true, hidden_reason: input.hiddenReason, updated_at: new Date().toISOString() })
      .eq('id', input.replyId);
    if (hideErr) throw new Error(`moderation.hideReply: ${hideErr.message}`);
    const { error: repErr } = await supabase
      .from('community_reports')
      .update({
        status: 'actioned',
        decided_by: input.decidedBy,
        decided_at: new Date().toISOString(),
      })
      .eq('id', input.reportId);
    if (repErr) throw new Error(`moderation.actionReport: ${repErr.message}`);
  },
};
