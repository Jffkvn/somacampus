/**
 * P2D community service — policies, spaces, teacher-led posts.
 * Peer features stay policy-gated (communityDomain.canCreateCommunity).
 */
import { supabase } from '../../lib/supabase';
import {
  canCreateCommunity,
  resolvePolicy,
  type CommunityPolicy,
  type CommunityType,
} from './communityDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapPolicy(r: any): CommunityPolicy {
  return resolvePolicy(r.school_id, r.stage_key ?? '', {
    allowTeacherLed: r.allow_teacher_led !== false,
    allowStudyGroups: Boolean(r.allow_study_groups),
    allowPeerReview: Boolean(r.allow_peer_review),
    allowPeerReplies: Boolean(r.allow_peer_replies),
    allowClubs: Boolean(r.allow_clubs),
    peerAgeFloor: r.peer_age_floor == null ? null : Number(r.peer_age_floor),
    requireModeration: r.require_moderation !== false,
    parentVisibilityUnder13: r.parent_visibility_under_13 !== false,
  });
}

export interface CommunitySpace {
  id: string;
  communityType: CommunityType;
  title: string;
  description: string | null;
  stageKey: string | null;
  moderatorPersonId: string;
}

export const communityService = {
  async getPolicy(schoolId: string, stageKey = ''): Promise<CommunityPolicy> {
    if (isMockEnv()) return resolvePolicy(schoolId, stageKey);
    const { data, error } = await supabase
      .from('community_policies')
      .select('*')
      .eq('school_id', schoolId)
      .eq('stage_key', stageKey)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`community.getPolicy: ${error.message}`);
    return data ? mapPolicy(data) : resolvePolicy(schoolId, stageKey);
  },

  async upsertPolicy(input: Partial<CommunityPolicy> & { schoolId: string; stageKey?: string }): Promise<CommunityPolicy> {
    if (isMockEnv()) throw new Error('community.upsertPolicy: unavailable without live database');
    const stageKey = input.stageKey ?? '';
    const payload = {
      school_id: input.schoolId,
      stage_key: stageKey,
      allow_teacher_led: true,
      allow_study_groups: input.allowStudyGroups ?? false,
      allow_peer_review: input.allowPeerReview ?? false,
      allow_peer_replies: input.allowPeerReplies ?? false,
      allow_clubs: input.allowClubs ?? false,
      peer_age_floor: input.peerAgeFloor ?? null,
      require_moderation: input.requireModeration ?? true,
      parent_visibility_under_13: input.parentVisibilityUnder13 ?? true,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('community_policies')
      .upsert(payload, { onConflict: 'school_id,stage_key' })
      .select('*')
      .single();
    if (error || !data) throw new Error(`community.upsertPolicy: ${error?.message ?? 'no row'}`);
    return mapPolicy(data);
  },

  async createCommunity(input: {
    schoolId: string;
    communityType: CommunityType;
    title: string;
    description?: string | null;
    offeringId?: string | null;
    classId?: string | null;
    stageKey?: string | null;
    moderatorPersonId: string;
    learnerAge?: number | null;
  }): Promise<CommunitySpace> {
    const policy = await this.getPolicy(input.schoolId, input.stageKey ?? '');
    const check = canCreateCommunity(policy, input.communityType, { learnerAge: input.learnerAge });
    if (!check.allowed) throw new Error(`community.create: ${check.reason}`);
    if (!input.title?.trim()) throw new Error('community.create: title is required');
    if (isMockEnv()) throw new Error('community.create: unavailable without live database');

    const { data, error } = await supabase
      .from('learning_communities')
      .insert({
        school_id: input.schoolId,
        community_type: input.communityType,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        offering_id: input.offeringId ?? null,
        class_id: input.classId ?? null,
        stage_key: input.stageKey ?? null,
        moderator_person_id: input.moderatorPersonId,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`community.create: ${error?.message ?? 'no row'}`);

    await supabase.from('community_members').insert({
      community_id: data.id,
      person_id: input.moderatorPersonId,
      member_role: 'moderator',
      can_post: true,
      can_reply: true,
    });

    return {
      id: String(data.id),
      communityType: data.community_type,
      title: data.title,
      description: data.description ?? null,
      stageKey: data.stage_key ?? null,
      moderatorPersonId: String(data.moderator_person_id),
    };
  },

  /** Teacher-led post (P2D-2). Learner free-post stays off unless policy opens it. */
  async createPost(input: {
    schoolId: string;
    communityId: string;
    authorPersonId: string;
    body: string;
    isPinned?: boolean;
  }): Promise<{ id: string }> {
    if (!input.body?.trim()) throw new Error('community.createPost: body is required');
    if (isMockEnv()) throw new Error('community.createPost: unavailable without live database');
    const { data, error } = await supabase
      .from('community_posts')
      .insert({
        school_id: input.schoolId,
        community_id: input.communityId,
        author_person_id: input.authorPersonId,
        body: input.body.trim(),
        is_pinned: input.isPinned ?? false,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`community.createPost: ${error?.message ?? 'no row'}`);
    return { id: String(data.id) };
  },

  async listPosts(communityId: string): Promise<
    Array<{ id: string; body: string; isPinned: boolean; createdAt: string }>
  > {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('community_posts')
      .select('id, body, is_pinned, created_at')
      .eq('community_id', communityId)
      .eq('is_hidden', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(`community.listPosts: ${error.message}`);
    return ((data ?? []) as any[]).map((r) => ({
      id: String(r.id),
      body: String(r.body),
      isPinned: Boolean(r.is_pinned),
      createdAt: String(r.created_at),
    }));
  },
};
