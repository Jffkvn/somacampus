/**
 * School Announcements Service — SomaCampus Phase 8B (in-app broadcasts).
 *
 * Tables (migration 20260913000003): school_announcements +
 * announcement_acknowledgements. RLS is the final arbiter:
 * - manage (INSERT/UPDATE/DELETE + read-all): admin / principal only.
 * - read: audience-scoped via can_view_school_announcement().
 * - acks: self-insert for visible announcements, immutable (no UPDATE/DELETE).
 * - expired rows stay readable (history); expiry is app-level display only.
 *
 * Client-side role check on create mirrors RLS (defense in depth); RLS
 * denials throw and are never masked with fallback data (D1 rule).
 */

import { supabase } from '../../lib/supabase';
import type { UserRole } from '../../config/permissions';

export type AnnouncementAudience =
  | 'school'
  | 'staff'
  | 'teachers'
  | 'parents'
  | 'students'
  | 'class';

export type AnnouncementPriority = 'normal' | 'important' | 'urgent' | 'emergency';

export type AnnouncementAckResponse = 'acknowledged' | 'yes' | 'no';

export interface Announcement {
  id: string;
  schoolId: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  targetClassId: string | null;
  requiresAcknowledgement: boolean;
  publishedBy: string | null;
  publishedAt: string;
  expiresAt: string | null;
  /** App-level flag: expired rows stay readable (history), rendered dimmed. */
  isExpired: boolean;
  acknowledged: boolean;
  myResponse: AnnouncementAckResponse | null;
}

export interface CreateAnnouncementInput {
  schoolId: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  priority?: AnnouncementPriority;
  requiresAcknowledgement?: boolean;
  targetClassId?: string | null;
  publishedBy?: string | null;
  expiresAt?: string | null;
  /** Client-side create gate (mirrors RLS manage policy). */
  actorRole: UserRole;
}

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

export function toAnnouncementView(row: any): Announcement {
  return {
    id: row.id,
    schoolId: row.school_id,
    title: row.title,
    body: row.body,
    priority: row.priority ?? 'normal',
    audience: row.target_audience ?? 'school',
    targetClassId: row.target_class_id ?? null,
    requiresAcknowledgement: row.requires_acknowledgement ?? false,
    publishedBy: row.published_by ?? null,
    publishedAt: row.published_at,
    expiresAt: row.expires_at ?? null,
    isExpired: row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false,
    acknowledged: false,
    myResponse: null,
  };
}

export const announcementService = {
  /**
   * Visible feed for the school, newest first. Audience filtering is
   * enforced by RLS (can_view_school_announcement); the explicit
   * school_id filter keeps cross-school reads empty even before RLS.
   * Ack state is merged for the viewer when a person id is supplied.
   */
  async getAnnouncements(schoolId: string, viewerPersonId?: string): Promise<Announcement[]> {
    if (isMockEnv()) return [];

    const { data, error } = await supabase
      .from('school_announcements')
      .select('*')
      .eq('school_id', schoolId)
      .order('published_at', { ascending: false });
    if (error) throw error;

    const feed = (data || []).map(toAnnouncementView);
    if (!viewerPersonId || feed.length === 0) return feed;

    const { data: acks, error: ackError } = await supabase
      .from('announcement_acknowledgements')
      .select('announcement_id, response')
      .eq('person_id', viewerPersonId)
      .in(
        'announcement_id',
        feed.map((a) => a.id)
      );
    if (ackError) throw ackError;

    const byAnnouncement = new Map((acks || []).map((a: any) => [a.announcement_id, a.response]));
    return feed.map((a) =>
      byAnnouncement.has(a.id)
        ? { ...a, acknowledged: true, myResponse: byAnnouncement.get(a.id) }
        : a
    );
  },

  /**
   * Staff publish (admin/principal only — enforced here AND by RLS).
   * No AI drafting, in-app only, no phone fields (locked decisions).
   */
  async createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement> {
    if (isMockEnv()) throw new Error('Announcements are unavailable in a mock environment.');
    if (input.actorRole !== 'admin' && input.actorRole !== 'principal') {
      throw new Error('Only admin or principal may publish announcements.');
    }
    if (!input.title?.trim()) throw new Error('Title is required.');
    if (!input.body?.trim()) throw new Error('Body is required.');
    if (input.audience === 'class' && !input.targetClassId) {
      throw new Error('Class-targeted announcements require a target class.');
    }

    const { data, error } = await supabase
      .from('school_announcements')
      .insert({
        school_id: input.schoolId,
        title: input.title.trim(),
        body: input.body.trim(),
        target_audience: input.audience,
        priority: input.priority ?? 'normal',
        requires_acknowledgement: input.requiresAcknowledgement ?? false,
        target_class_id: input.audience === 'class' ? input.targetClassId : null,
        published_by: input.publishedBy ?? null,
        expires_at: input.expiresAt ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toAnnouncementView(data);
  },

  /**
   * Record the viewer's response. UNIQUE (announcement, person) violations
   * resolve gracefully as "already acknowledged" — every other DB error
   * throws (D1 rule).
   */
  async acknowledge(
    announcementId: string,
    personId: string,
    response: AnnouncementAckResponse = 'acknowledged'
  ): Promise<{ duplicate: boolean }> {
    if (isMockEnv()) return { duplicate: false };

    const { error } = await supabase.from('announcement_acknowledgements').insert({
      announcement_id: announcementId,
      person_id: personId,
      response,
    });
    if (error) {
      if ((error as any).code === '23505') return { duplicate: true };
      throw error;
    }
    return { duplicate: false };
  },
};
