/**
 * Notification fan-out — SomaCampus Phase 8C (event -> in_app delivery).
 *
 * Verified gap: notification_events rows are created (attendance DB trigger,
 * plus the client event inserts wired in announcementService /
 * communicationService) but nothing ever inserted notification_deliveries —
 * the bell reads deliveries, so production bells stayed empty. This module
 * closes every gap: each producer fans its event out to deliveries.
 *
 * Best-effort contract (deliberate exception to the D1 throw rule): fan-out
 * must NEVER break a primary write (attendance / announcement / message).
 * Every helper below catches its own failures, emits console.warn, and
 * returns zero-counts — call sites additionally wrap in try/catch. Delivery
 * inserts that violate UNIQUE (event_id, recipient_person_id, channel)
 * (code 23505) count as idempotent replays, not errors.
 *
 * Audience helper (announcement_published payload.audience):
 * - parents  -> guardians of actively-enrolled students in the school
 * - students -> the enrolled students' own person ids
 * - teachers -> active employees flagged is_teacher
 * - staff    -> all active employees
 * - class    -> guardians + students of the payload.classId enrolments
 * - school   -> guardians + all active employees
 *
 * Preferences: stored notification_preferences rows are respected per
 * recipient (category per EVENT_CATEGORY below). No row -> default true.
 * is_mandatory rows force in_app ON. A preferences read failure fails OPEN
 * (deliver) — an empty bell is the bug being fixed.
 *
 * NOTE (production RLS follow-up, out of scope): notification_events and
 * notification_deliveries INSERT policies currently allow admin/principal
 * only, so teacher/parent-triggered fan-out attempts (attendance, messages)
 * will warn with 42501 until an RLS/follow-up worker change lands. The
 * primary writes are unaffected by design.
 */

import { supabase } from '../../lib/supabase';
import type { NotificationCategory } from './notificationService';

export interface FanoutEvent {
  id: string;
  schoolId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface FanoutResult {
  attempted: number;
  inserted: number;
  duplicates: number;
  skippedByPreference: number;
  failed: number;
}

export interface CreateEventInput {
  schoolId: string;
  eventType: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  payload?: Record<string, unknown>;
}

const ZEROS: FanoutResult = {
  attempted: 0,
  inserted: 0,
  duplicates: 0,
  skippedByPreference: 0,
  failed: 0,
};

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const EVENT_CATEGORY: Record<string, NotificationCategory> = {
  attendance_absent: 'attendance',
  attendance_late: 'attendance',
  announcement_published: 'announcements',
  acknowledgement_required: 'announcements',
  message_received: 'messages',
};

const unique = (ids: Array<string | null | undefined>): string[] => [
  ...new Set(ids.filter((v): v is string => Boolean(v))),
];

async function guardiansOfStudents(studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('student_guardians')
    .select('guardian_person_id')
    .in('student_id', studentIds);
  if (error) throw error;
  return unique(((data as any[]) || []).map((r) => r.guardian_person_id));
}

async function activeStudentIds(schoolId: string, classId?: string | null): Promise<string[]> {
  let query = supabase
    .from('student_enrolments')
    .select('student_id')
    .eq('school_id', schoolId)
    .eq('status', 'active');
  if (classId) query = query.eq('class_id', classId);
  const { data, error } = await query;
  if (error) throw error;
  return unique(((data as any[]) || []).map((r) => r.student_id));
}

async function studentPersonIds(studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('students')
    .select('person_id')
    .in('id', studentIds);
  if (error) throw error;
  return unique(((data as any[]) || []).map((r) => r.person_id));
}

async function staffPersonIds(schoolId: string, teachersOnly: boolean): Promise<string[]> {
  let query = supabase
    .from('employees')
    .select('person_id')
    .eq('school_id', schoolId)
    .eq('status', 'active');
  if (teachersOnly) query = query.eq('is_teacher', true);
  const { data, error } = await query;
  if (error) throw error;
  return unique(((data as any[]) || []).map((r) => r.person_id));
}

async function resolveAnnouncementRecipients(
  schoolId: string,
  audience: string,
  classId?: string | null
): Promise<string[]> {
  switch (audience) {
    case 'parents': {
      const students = await activeStudentIds(schoolId);
      return guardiansOfStudents(students);
    }
    case 'students': {
      const students = await activeStudentIds(schoolId);
      return studentPersonIds(students);
    }
    case 'teachers':
      return staffPersonIds(schoolId, true);
    case 'staff':
      return staffPersonIds(schoolId, false);
    case 'class': {
      if (!classId) return [];
      const students = await activeStudentIds(schoolId, classId);
      const [guardians, pupils] = await Promise.all([
        guardiansOfStudents(students),
        studentPersonIds(students),
      ]);
      return unique([...guardians, ...pupils]);
    }
    case 'school':
    default: {
      const students = await activeStudentIds(schoolId);
      const [guardians, staff] = await Promise.all([
        guardiansOfStudents(students),
        staffPersonIds(schoolId, false),
      ]);
      return unique([...guardians, ...staff]);
    }
  }
}

async function resolveRecipients(event: FanoutEvent): Promise<string[]> {
  const payload = event.payload ?? {};
  switch (event.eventType) {
    case 'attendance_absent':
    case 'attendance_late': {
      const studentId = payload.studentId as string | undefined;
      if (!studentId) return [];
      return guardiansOfStudents([studentId]);
    }
    case 'announcement_published':
    case 'acknowledgement_required':
      return resolveAnnouncementRecipients(
        event.schoolId,
        (payload.audience as string | undefined) ?? 'school',
        (payload.classId as string | undefined) ?? null
      );
    case 'message_received': {
      const threadId = payload.threadId as string | undefined;
      const senderId = payload.senderId as string | undefined;
      if (!threadId) return [];
      const { data, error } = await supabase
        .from('communication_participants')
        .select('person_id')
        .eq('thread_id', threadId);
      if (error) throw error;
      return unique(((data as any[]) || []).map((r) => r.person_id)).filter(
        (id) => id !== senderId
      );
    }
    default:
      return [];
  }
}

/**
 * Core fan-out: insert one in_app delivery per resolved recipient.
 * Never throws on resolution/delivery failures (warn + zero-counts); the
 * mock env is a pure no-op. Duplicate replays (23505) count as duplicates.
 */
export async function fanOutDeliveries(event: FanoutEvent): Promise<FanoutResult> {
  if (isMockEnv()) return { ...ZEROS };
  if (!event?.id || !event?.schoolId || !event?.eventType) return { ...ZEROS };

  let recipients: string[];
  try {
    recipients = await resolveRecipients(event);
  } catch (error) {
    console.warn('fanOutDeliveries recipient resolution failed (primary write unaffected):', error);
    return { ...ZEROS };
  }
  if (recipients.length === 0) return { ...ZEROS };

  const category: NotificationCategory = EVENT_CATEGORY[event.eventType] ?? 'announcements';
  let prefs = new Map<string, { inApp: boolean; isMandatory: boolean }>();
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('person_id, in_app, is_mandatory')
      .eq('school_id', event.schoolId)
      .eq('category', category)
      .in('person_id', recipients);
    if (error) throw error;
    prefs = new Map(
      ((data as any[]) || []).map((r) => [
        r.person_id as string,
        { inApp: r.in_app ?? true, isMandatory: r.is_mandatory === true },
      ])
    );
  } catch (error) {
    // Fail-open: deliver to everyone rather than empty the bell.
    console.warn('fanOutDeliveries preferences read failed, delivering to all (primary write unaffected):', error);
    prefs = new Map();
  }

  const result: FanoutResult = { ...ZEROS, attempted: recipients.length };
  for (const recipient of recipients) {
    const pref = prefs.get(recipient);
    if (pref && !pref.inApp && !pref.isMandatory) {
      result.skippedByPreference += 1;
      continue;
    }
    try {
      const { error } = (await supabase.from('notification_deliveries').insert({
        event_id: event.id,
        recipient_person_id: recipient,
        channel: 'in_app',
        status: 'pending',
      })) as any;
      if (error) throw error;
      result.inserted += 1;
    } catch (error) {
      if ((error as any)?.code === '23505') {
        result.duplicates += 1;
        continue;
      }
      console.warn('fanOutDeliveries delivery insert failed (primary write unaffected):', error);
      result.failed += 1;
    }
  }
  return result;
}

/**
 * Insert one notification_events row, then fan it out. Never throws:
 * failures resolve to { eventId: null, fanout: zeros } with a warning.
 */
export async function createEventAndFanOut(
  input: CreateEventInput
): Promise<{ eventId: string | null; fanout: FanoutResult }> {
  if (isMockEnv()) return { eventId: null, fanout: { ...ZEROS } };
  try {
    const { data, error } = await supabase
      .from('notification_events')
      .insert({
        school_id: input.schoolId,
        event_type: input.eventType,
        source_entity_type: input.sourceEntityType ?? null,
        source_entity_id: input.sourceEntityId ?? null,
        payload: input.payload ?? {},
      })
      .select()
      .single();
    if (error) throw error;
    const eventId = (data as any)?.id ?? null;
    if (!eventId) return { eventId: null, fanout: { ...ZEROS } };
    const fanout = await fanOutDeliveries({
      id: eventId,
      schoolId: input.schoolId,
      eventType: input.eventType,
      payload: input.payload ?? {},
    });
    return { eventId, fanout };
  } catch (error) {
    console.warn('createEventAndFanOut failed (primary write unaffected):', error);
    return { eventId: null, fanout: { ...ZEROS } };
  }
}

/**
 * Message hook: resolves the thread's school, then creates a
 * message_received event and fans out to the other participants.
 * Never throws.
 */
export async function fanOutMessage(input: {
  threadId: string;
  senderId: string;
  messageId?: string | null;
}): Promise<FanoutResult> {
  if (isMockEnv()) return { ...ZEROS };
  if (!input?.threadId || !input?.senderId) return { ...ZEROS };
  try {
    const { data, error } = await supabase
      .from('communication_threads')
      .select('id, school_id')
      .eq('id', input.threadId)
      .maybeSingle();
    if (error) throw error;
    const schoolId = (data as any)?.school_id ?? null;
    if (!schoolId) {
      console.warn('fanOutMessage skipped: thread school unresolvable (message unaffected).');
      return { ...ZEROS };
    }
    const created = await createEventAndFanOut({
      schoolId,
      eventType: 'message_received',
      sourceEntityType: 'communication_message',
      sourceEntityId: input.messageId ?? null,
      payload: {
        threadId: input.threadId,
        senderId: input.senderId,
        ...(input.messageId ? { messageId: input.messageId } : {}),
      },
    });
    return created.fanout;
  } catch (error) {
    console.warn('fanOutMessage failed (message unaffected):', error);
    return { ...ZEROS };
  }
}
/**
 * Attendance hook: the DB trigger creates the event row for absent/late
 * records, so prefer the trigger-created event (matched on payload
 * sessionId + studentId, newest first) and only insert when it is not
 * visible (RLS/race). Then fan out. Never throws.
 */
export async function fanOutAttendanceRecord(input: {
  schoolId: string;
  studentId: string;
  sessionId?: string | null;
  date?: string | null;
  status: 'absent' | 'late';
  studentName?: string | null;
}): Promise<FanoutResult> {
  if (isMockEnv()) return { ...ZEROS };
  const eventType = input.status === 'late' ? 'attendance_late' : 'attendance_absent';
  const payload: Record<string, unknown> = {
    studentId: input.studentId,
    status: input.status,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.date ? { date: input.date } : {}),
    ...(input.studentName ? { studentName: input.studentName } : {}),
  };
  try {
    const { data, error } = await supabase
      .from('notification_events')
      .select('id, event_type, school_id, payload')
      .eq('source_entity_type', 'student_attendance_record')
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) throw error;
    const match = ((data as any[]) || []).find(
      (row) =>
        (row.event_type === eventType || row.event_type === 'attendance_absent' || row.event_type === 'attendance_late') &&
        (row.payload?.studentId === input.studentId || row.payload?.student_id === input.studentId) &&
        (!input.sessionId || row.payload?.sessionId === input.sessionId || row.payload?.session_id === input.sessionId)
    );
    if (match?.id) {
      return fanOutDeliveries({
        id: match.id,
        schoolId: input.schoolId,
        eventType: match.event_type ?? eventType,
        payload: (match.payload ?? payload) as Record<string, unknown>,
      });
    }
  } catch (error) {
    console.warn('fanOutAttendanceRecord trigger-event lookup failed, creating event (primary write unaffected):', error);
  }
  const created = await createEventAndFanOut({
    schoolId: input.schoolId,
    eventType,
    sourceEntityType: 'student_attendance_record',
    payload,
  });
  return created.fanout;
}
