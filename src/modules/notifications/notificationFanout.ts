/**
 * Notification fan-out — SomaCampus Phase 8C (event -> in_app delivery).
 *
 * Single mechanism (review C1): the client NEVER inserts
 * notification_events / notification_deliveries rows directly. Every helper
 * below calls the SECURITY DEFINER RPC create_event_and_fan_out()
 * (migration 20260913000009), which validates server-side and DERIVES
 * recipients itself — the caller supplies (school, type, source, payload)
 * and never a recipient list, so fan-out targets cannot be spoofed.
 * Direct-insert code was removed entirely.
 *
 * Best-effort contract (deliberate exception to the D1 throw rule): fan-out
 * must NEVER break a primary write (attendance / announcement / message).
 * Every helper catches its own failures (including RPC RAISEs such as the
 * no-school-relationship spoof rejection), emits console.warn, and returns
 * zero-counts — call sites additionally wrap in try/catch.
 *
 * I1 decision: the fanOutDeliveries wrapper briefly attached to
 * notificationService is deleted as redundant — producers call these
 * helpers directly, and notificationService stays the read/preferences
 * service. (It had also landed mid-setPreference; that file is restored
 * verbatim.)
 *
 * I2 decision: the attendance trigger-event lookup stays client-side but is
 * school-scoped (school_id + source_entity_type filter) and is a HINT only:
 * the RPC re-validates server-side (same school + compatible type) and
 * otherwise runs its own school-scoped find-or-create, so a lost/stale hint
 * can neither leak nor duplicate. Recipient derivation lives in SQL.
 *
 * Mock env is a pure no-op (no rpc call, zeros returned).
 */

import { supabase } from '../../lib/supabase';

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

const RPC_NAME = 'create_event_and_fan_out';

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function toFanoutResult(data: unknown): FanoutResult {
  const d = (data ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return {
    attempted: num(d.attempted),
    inserted: num(d.inserted),
    duplicates: num(d.duplicates),
    skippedByPreference: num(d.skipped_by_preference),
    failed: num(d.failed),
  };
}

/**
 * Single insert mechanism: one RPC call carrying (school, type, source,
 * payload) — never recipient lists. Never throws: RPC RAISEs (validation,
 * spoof rejection, delivery store faults) resolve to { eventId: null,
 * fanout: zeros } with a warning.
 */
export async function createEventAndFanOut(
  input: CreateEventInput
): Promise<{ eventId: string | null; fanout: FanoutResult }> {
  if (isMockEnv()) return { eventId: null, fanout: { ...ZEROS } };
  if (!input?.schoolId || !input?.eventType) return { eventId: null, fanout: { ...ZEROS } };
  try {
    const { data, error } = await supabase.rpc(RPC_NAME, {
      p_school_id: input.schoolId,
      p_event_type: input.eventType,
      p_source_entity_type: input.sourceEntityType ?? null,
      p_source_entity_id: input.sourceEntityId ?? null,
      p_payload: input.payload ?? {},
    });
    if (error) throw error;
    return {
      eventId: (data as any)?.event_id ?? null,
      fanout: toFanoutResult(data),
    };
  } catch (error) {
    console.warn('createEventAndFanOut failed (primary write unaffected):', error);
    return { eventId: null, fanout: { ...ZEROS } };
  }
}

/**
 * Message hook: resolves the thread's school via a client read, then fans
 * out through the RPC. Never throws.
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
 * Attendance hook: school-scoped lookup for the trigger-created event
 * (I2 hint), then a single RPC call that validates the hint server-side
 * and runs its own find-or-create. Never throws.
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
  if (!input?.schoolId || !input?.studentId) return { ...ZEROS };
  const eventType = input.status === 'late' ? 'attendance_late' : 'attendance_absent';
  const payload: Record<string, unknown> = {
    studentId: input.studentId,
    status: input.status,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.date ? { date: input.date } : {}),
    ...(input.studentName ? { studentName: input.studentName } : {}),
  };
  let existingEventId: string | null = null;
  try {
    const { data, error } = await supabase
      .from('notification_events')
      .select('id, event_type, payload')
      .eq('school_id', input.schoolId)
      .eq('source_entity_type', 'student_attendance_record')
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) throw error;
    const match = ((data as any[]) || []).find(
      (row) =>
        (row.event_type === eventType ||
          row.event_type === 'attendance_absent' ||
          row.event_type === 'attendance_late') &&
        (row.payload?.studentId === input.studentId ||
          row.payload?.student_id === input.studentId) &&
        (!input.sessionId ||
          row.payload?.sessionId === input.sessionId ||
          row.payload?.session_id === input.sessionId)
    );
    existingEventId = match?.id ?? null;
  } catch (error) {
    console.warn(
      'fanOutAttendanceRecord trigger-event lookup failed, RPC find-or-create covers it (primary write unaffected):',
      error
    );
  }
  const created = await createEventAndFanOut({
    schoolId: input.schoolId,
    eventType,
    sourceEntityType: 'student_attendance_record',
    sourceEntityId: null,
    payload: { ...payload, ...(existingEventId ? { existingEventId } : {}) },
  });
  return created.fanout;
}
