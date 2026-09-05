/**
 * In-app Notification Service — SomaCampus Phase 8C Task 2.
 *
 * Tables (migration 20260913000004): notification_events +
 * notification_deliveries + notification_preferences. RLS is the final
 * arbiter (recipient-own reads, recipient-own read receipts, self-managed
 * preferences); this client only ever scopes to the viewer's own rows.
 *
 * Locked decisions: in-app delivery ONLY (no email/SMS sending — the email/
 * sms preference flags are stored intent for a future worker, never acted
 * on here). No AI, no phone fields.
 *
 * Conventions (mirrors announcementService / parentService):
 * - Callers pass explicit person/school ids resolved from the auth user via
 *   a people lookup (fail-closed throw when unresolvable). getMyNotifications
 *   also accepts no arg and resolves the viewer itself for header use.
 * - Mock-env guard returns honest empties ([] / {updated:false}); writes are
 *   unavailable in mock env and throw like announcementService.create.
 * - DB/RLS errors THROW (D1 rule) — never silent [] and never leaked rows.
 * - Mandatory categories (is_mandatory) keep in_app ON: the stored server
 *   value wins even if the caller tries to disable it.
 */

import { supabase } from '../../lib/supabase';
import {
  fanOutDeliveries as fanOutEventDeliveries,
  type FanoutEvent,
  type FanoutResult,
} from './notificationFanout';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'whatsapp';

export type NotificationStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'skipped';

export type NotificationCategory =
  | 'attendance'
  | 'assignments'
  | 'observations'
  | 'announcements'
  | 'fees'
  | 'calendar'
  | 'messages';

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'attendance',
  'assignments',
  'observations',
  'announcements',
  'fees',
  'calendar',
  'messages',
];

export interface NotificationItem {
  id: string;
  eventId: string;
  eventType: string;
  title: string;
  payload: Record<string, unknown>;
  channel: NotificationChannel;
  status: NotificationStatus;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
  unread: boolean;
}

export interface NotificationPreference {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  isMandatory: boolean;
}

export interface PreferencePatch {
  inApp?: boolean;
  email?: boolean;
  sms?: boolean;
}

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const EVENT_TITLES: Record<string, string> = {
  attendance_absent: 'Absence recorded',
  attendance_late: 'Late arrival recorded',
  assignment_posted: 'New assignment posted',
  assignment_due: 'Assignment due soon',
  observation_shared: 'New observation shared',
  announcement_published: 'New announcement',
  fee_assessed: 'Fee assessed',
  fee_payment_received: 'Payment received',
  fee_overdue: 'Fee overdue',
  calendar_reminder: 'Calendar reminder',
  message_received: 'New message',
  acknowledgement_required: 'Acknowledgement required',
  activity_clearance_updated: 'Activity clearance updated',
  intervention_update: 'Intervention update',
};

export function toNotificationView(row: any): NotificationItem {
  const event = Array.isArray(row.notification_events)
    ? row.notification_events[0]
    : row.notification_events;
  const eventType: string = event?.event_type ?? 'announcement_published';
  return {
    id: row.id,
    eventId: row.event_id,
    eventType,
    title: EVENT_TITLES[eventType] ?? eventType,
    payload: (event?.payload ?? {}) as Record<string, unknown>,
    channel: row.channel ?? 'in_app',
    status: row.status ?? 'pending',
    sentAt: row.sent_at ?? null,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
    unread: (row.status ?? 'pending') !== 'read',
  };
}

function toPreferenceView(row: any): NotificationPreference {
  return {
    category: row.category,
    inApp: row.in_app ?? true,
    email: row.email ?? true,
    sms: row.sms ?? false,
    isMandatory: row.is_mandatory ?? false,
  };
}

/**
 * Viewer person id via auth user -> people.auth_user_id. Fail-closed: throws
 * when there is no session or no linked person row (never falls back to
 * another person's id).
 */
export async function resolveMyPersonId(): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  const id = (data as any)?.id ?? null;
  if (!id) throw new Error('No person record for this session.');
  return id;
}

export const notificationService = {
  /**
   * Own in-app feed, newest first. RLS scopes reads to the recipient's own
   * delivery rows; the explicit recipient filter keeps cross-person reads
   * empty even before RLS.
   */
  async getMyNotifications(personId?: string): Promise<NotificationItem[]> {
    if (isMockEnv()) return [];
    const pid = personId ?? (await resolveMyPersonId());
    if (!pid) throw new Error('getMyNotifications requires a person id.');

    const { data, error } = await supabase
      .from('notification_deliveries')
      .select('*, notification_events(id, event_type, payload)')
      .eq('recipient_person_id', pid)
      .eq('channel', 'in_app')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return ((data as any[]) || [])
      .map(toNotificationView)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  },

  /**
   * Read receipt for one delivery. The recipient filter is sent with the
   * update (defense in depth: RLS scopes the row to self, and a foreign id
   * matches zero rows / throws instead of flipping someone else's receipt).
   */
  async markAsRead(deliveryId: string, personId: string): Promise<{ updated: boolean }> {
    if (!deliveryId) throw new Error('markAsRead requires a delivery id.');
    if (!personId) throw new Error('markAsRead requires a person id.');
    if (isMockEnv()) return { updated: false };

    const { error } = await supabase
      .from('notification_deliveries')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('id', deliveryId)
      .eq('recipient_person_id', personId);
    if (error) throw error;
    return { updated: true };
  },

  /**
   * Mark the viewer's whole in-app feed read (bell "mark all read") with a
   * single recipient-scoped update — no N+1 loop.
   */
  async markAllRead(personId: string): Promise<{ updated: number }> {
    if (!personId) throw new Error('markAllRead requires a person id.');
    if (isMockEnv()) return { updated: 0 };
    const feed = await this.getMyNotifications(personId);
    const ids = feed.filter((n) => n.unread).map((n) => n.id);
    if (ids.length === 0) return { updated: 0 };
    const { data, error } = await supabase
      .from('notification_deliveries')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .in('id', ids)
      .eq('recipient_person_id', personId)
      .select('id');
    if (error) throw error;
    return { updated: (data as any[])?.length ?? 0 };
  },

  /**
   * Preference rows for the viewer in one school. No rows yet -> [] (the
   * page renders category defaults; the first save upserts).
   */
  async getPreferences(personId: string, schoolId: string): Promise<NotificationPreference[]> {
    if (!personId) throw new Error('getPreferences requires a person id.');
    if (!schoolId) throw new Error('getPreferences requires a school id.');
    if (isMockEnv()) return [];

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('person_id', personId)
      .eq('school_id', schoolId);
    if (error) throw error;
    return ((data as any[]) || []).map(toPreferenceView);
  },

  /**
   * Save one category. Mandatory rows keep in_app ON: the stored server
   * value wins even when the caller passes inApp:false. Email/sms remain
   * editable (stored intent only — nothing is sent from this client).
   */
  async setPreference(
    personId: string,
    schoolId: string,
    category: NotificationCategory,
    patch: PreferencePatch
  ): Promise<NotificationPreference> {
    if (!personId) throw new Error('setPreference requires a person id.');
    if (!schoolId) throw new Error('setPreference requires a school id.');
    if (!category) throw new Error('setPreference requires a category.');
    if (isMockEnv()) throw new Error('Notification preferences are unavailable in a mock environment.');

    const { data: existing, error: readError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('person_id', personId)
      .eq('school_id', schoolId)
      .eq('category', category)
      .maybeSingle();
    if (readError) throw readError;

    const mandatory = (existing as any)?.is_mandatory === true;
    const payload = {
      person_id: personId,
      school_id: schoolId,
      category,
      in_app: mandatory ? true : (patch.inApp ?? (existing as any)?.in_app ?? true),
      email: patch.email ?? (existing as any)?.email ?? true,
      sms: patch.sms ?? (existing as any)?.sms ?? false,
  /**
   * Event -> in_app delivery fan-out (delegates to notificationFanout).
   * Best-effort: resolution/delivery failures warn and return zero-counts,
   * never throw into the producer's primary write.
   */
  async fanOutDeliveries(event: FanoutEvent): Promise<FanoutResult> {
    return fanOutEventDeliveries(event);
  },
};

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(payload, { onConflict: 'person_id,school_id,category' })
      .select()
      .single();
    if (error) throw error;
    return toPreferenceView({ ...(data as any), is_mandatory: (data as any)?.is_mandatory ?? mandatory });
  },
};
