import { supabase } from '../../lib/supabase';

/**
 * Phase 9H Task 1 — classroom abstraction + technical signals.
 *
 * Conventions (per onlineTeachingService + 9A onlineCentreService):
 * - Mock env → honest empties (null / []), never mock data.
 * - Live DB error → throw. Empty table → [] / null (NO_DATA, success).
 * - Every read/write is scoped to the assigned teacher (teacher_id = the
 *   caller's employee id). Reads filter app-side as defence in depth; writes
 *   read-then-verify ownership first and throw on mismatch. RLS (migration
 *   20260914000004, narrow writer helper) is the backstop. An unauthorized
 *   teacher gets null (reads) or a throw (writes) — never another teacher's
 *   session.
 * - Caller identity: UUIDs pass through as employee ids; a non-UUID
 *   (e.g. a login email, mirroring onlineTeachingService) resolves via an
 *   employees lookup and throws when unknown.
 *
 * LOCKED (signals are evidence, NEVER participation):
 * - This module writes ONLY online_session_signals (INSERT). It NEVER writes
 *   online_session_participants (no participation_status change), NEVER
 *   touches student_attendance_*, and performs NO automatic participation
 *   marking. The teacher confirms participation manually through the
 *   existing onlineTeachingService.recordParticipation flow, untouched.
 * - Provider-agnostic orchestration: join_url stays a plain link field.
 *   The provider registry below is pure URL helpers (link builders +
 *   pattern detection) — no video SDKs, no provider credentials, no
 *   network calls. Pure helpers never touch the DB.
 *
 * Duration is derived, never stored: computePresenceDurations pairs
 * joined/left signals per student (a provider-reported total may ride
 * metadata.duration_seconds, but no stored column exists — no dual-source
 * drift, per migration 20260914000004).
 */

export type ClassroomProvider = 'zoom' | 'meet' | 'teams' | 'custom';

export const CLASSROOM_PROVIDERS: ReadonlyArray<ClassroomProvider> = [
  'zoom',
  'meet',
  'teams',
  'custom',
];

export type ClassroomSignalType = 'joined' | 'left' | 'connection' | 'recording';

const SIGNAL_TYPES: ReadonlySet<string> = new Set([
  'joined',
  'left',
  'connection',
  'recording',
]);

export type SignalRecordedSource = 'manual' | 'provider';

const RECORDED_SOURCES: ReadonlySet<string> = new Set(['manual', 'provider']);

export interface ClassroomLinkRef {
  meetingId?: string;
  password?: string;
  code?: string;
  threadId?: string;
  url?: string;
}

export interface ClassroomSignal {
  id: string;
  sessionId: string;
  studentId?: string;
  signalType: ClassroomSignalType;
  occurredAt: string;
  metadata: Record<string, unknown>;
  recordedSource: SignalRecordedSource;
}

export interface RecordSignalInput {
  studentId?: string;
  signalType: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
  recordedSource?: string;
}

export interface ParticipantSignalSummary {
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  /** Teacher-confirmed participation (manual flow) — signals never change this. */
  participationStatus: string;
  /** Technical evidence for this student, ascending by occurred_at. */
  signals: ClassroomSignal[];
  /** Derived joined/left presence in seconds; null when no joined/left pair. */
  durationSeconds: number | null;
}

export interface SessionSignalsView {
  sessionId: string;
  participants: ParticipantSignalSummary[];
  /** System-wide signals (no student) e.g. recording markers. */
  systemSignals: ClassroomSignal[];
}

export interface PresenceDuration {
  studentId: string;
  joinedAt?: string;
  leftAt?: string;
  durationSeconds: number | null;
}

// ---------------------------------------------------------------------------
// Pure provider registry (no SDK calls, no DB access)
// ---------------------------------------------------------------------------

export function isClassroomProvider(v: string): v is ClassroomProvider {
  return (CLASSROOM_PROVIDERS as ReadonlyArray<string>).includes(v);
}

/**
 * Pure link builders, one per provider. Zoom/Meet/Teams build deterministic
 * join URLs from provider refs; custom passes a validated https URL through.
 * Unknown providers and invalid refs throw; nothing is written anywhere.
 */
export function buildClassroomLink(provider: string, ref: ClassroomLinkRef): string {
  if (!isClassroomProvider(provider)) {
    throw new Error(
      `onlineClassroomService.buildClassroomLink: unknown provider ${JSON.stringify(provider)} (expected zoom|meet|teams|custom)`,
    );
  }
  switch (provider) {
    case 'zoom': {
      const meetingId = (ref.meetingId ?? '').trim();
      if (!/^\d{9,11}$/.test(meetingId)) {
        throw new Error(
          'onlineClassroomService.buildClassroomLink: zoom requires a numeric meetingId (9-11 digits)',
        );
      }
      const password = (ref.password ?? '').trim();
      return password
        ? `https://zoom.us/j/${meetingId}?pwd=${encodeURIComponent(password)}`
        : `https://zoom.us/j/${meetingId}`;
    }
    case 'meet': {
      const code = (ref.code ?? '').trim();
      if (!/^[a-z0-9-]+$/i.test(code)) {
        throw new Error(
          'onlineClassroomService.buildClassroomLink: meet requires a non-empty meeting code',
        );
      }
      return `https://meet.google.com/${code}`;
    }
    case 'teams': {
      const threadId = (ref.threadId ?? '').trim();
      if (!threadId) {
        throw new Error(
          'onlineClassroomService.buildClassroomLink: teams requires a threadId',
        );
      }
      return `https://teams.microsoft.com/l/meetup-join/${encodeURIComponent(threadId)}`;
    }
    case 'custom': {
      const url = (ref.url ?? '').trim();
      if (!/^https?:\/\/.+\..+/.test(url)) {
        throw new Error(
          'onlineClassroomService.buildClassroomLink: custom requires a valid http(s) URL',
        );
      }
      return url;
    }
  }
}

/**
 * Pure provider detection from a stored join_url: zoom/meet/teams by URL
 * pattern, any other valid http(s) URL is a custom link, unparseable → null.
 */
export function resolveClassroomProvider(joinUrl: string): ClassroomProvider | null {
  const url = (joinUrl ?? '').trim();
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes('zoom.us')) return 'zoom';
  if (lower.includes('meet.google.com')) return 'meet';
  if (lower.includes('teams.microsoft.com')) return 'teams';
  if (/^https?:\/\/.+\..+/.test(url)) return 'custom';
  return null;
}

/**
 * Pure duration derivation: pairs joined/left signals per student
 * (ascending occurred_at; unpaired rows contribute their bound only).
 * System signals (no student) are ignored.
 */
export function computePresenceDurations(signals: Array<{
  student_id?: string | null;
  studentId?: string;
  signal_type?: string;
  signalType?: string;
  occurred_at?: string;
  occurredAt?: string;
}>): PresenceDuration[] {
  type Event = { type: 'joined' | 'left'; time: number; at: string };
  const byStudent = new Map<string, Event[]>();

  for (const s of signals ?? []) {
    const studentId = s.student_id ?? s.studentId ?? null;
    const type = s.signal_type ?? s.signalType ?? '';
    const at = s.occurred_at ?? s.occurredAt ?? '';
    if (!studentId || (type !== 'joined' && type !== 'left')) continue;
    const time = new Date(at).getTime();
    if (!at || Number.isNaN(time)) continue;

    let list = byStudent.get(studentId);
    if (!list) {
      list = [];
      byStudent.set(studentId, list);
    }
    list.push({ type: type as 'joined' | 'left', time, at });
  }

  const out: PresenceDuration[] = [];
  for (const [studentId, events] of byStudent) {
    events.sort((a, b) => a.time - b.time);
    const joinedEvents = events.filter((e) => e.type === 'joined');
    const leftEvents = events.filter((e) => e.type === 'left');
    const joinedAt = joinedEvents.length > 0 ? joinedEvents[0].at : undefined;
    const leftAt = leftEvents.length > 0 ? leftEvents[leftEvents.length - 1].at : undefined;

    let durationSeconds: number | null = null;
    if (joinedAt && leftAt) {
      let totalDurationMs = 0;
      let activeJoinTime: number | null = null;
      for (const ev of events) {
        if (ev.type === 'joined') {
          if (activeJoinTime === null) {
            activeJoinTime = ev.time;
          }
        } else if (ev.type === 'left') {
          if (activeJoinTime !== null) {
            if (ev.time > activeJoinTime) {
              totalDurationMs += ev.time - activeJoinTime;
            }
            activeJoinTime = null;
          }
        }
      }
      durationSeconds = totalDurationMs >= 0 ? Math.round(totalDurationMs / 1000) : null;
    }

    out.push({
      studentId,
      ...(joinedAt ? { joinedAt } : {}),
      ...(leftAt ? { leftAt } : {}),
      durationSeconds,
    });
  }
  out.sort((a, b) => (a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------------------
// DB-backed service
// ---------------------------------------------------------------------------

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const isUUID = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

function mapSignal(row: any): ClassroomSignal {
  let metadata: Record<string, unknown> = {};
  if (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) {
    metadata = row.metadata as Record<string, unknown>;
  }
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    ...(row.student_id ? { studentId: String(row.student_id) } : {}),
    signalType: String(row.signal_type) as ClassroomSignalType,
    occurredAt: String(row.occurred_at),
    metadata,
    recordedSource: String(row.recorded_source ?? 'manual') as SignalRecordedSource,
  };
}

function mapParticipantName(row: any): { studentName?: string; admissionNumber?: string } {
  const student = one(row.student);
  const person = one(student?.person);
  const name =
    person && (person.first_name || person.last_name)
      ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim()
      : undefined;
  return {
    ...(name ? { studentName: name } : {}),
    ...(student?.admission_number
      ? { admissionNumber: String(student.admission_number) }
      : {}),
  };
}

const SESSION_SELECT = 'id, teacher_id, status';
const SESSION_OWNERSHIP_SELECT = 'id, teacher_id';

const PARTICIPANT_SELECT =
  'id, session_id, student_id, participation_status, student:students(id, admission_number, person:people(first_name, last_name))';

const SIGNAL_SELECT =
  'id, session_id, student_id, signal_type, occurred_at, metadata, recorded_source';

/**
 * UUID employee ids pass through; anything else (login email, mirroring
 * onlineTeachingService) resolves via employees → people(email). Unknown →
 * throw.
 */
async function resolveTeacherId(teacherIdOrEmail: string): Promise<string> {
  if (isUUID(teacherIdOrEmail)) return teacherIdOrEmail;
  const { data, error } = await supabase
    .from('employees')
    .select('id, people(email)')
    .limit(50);
  if (error) throw error;
  const match = ((data ?? []) as any[]).find((r) => {
    const person = one(r.people);
    return person?.email === teacherIdOrEmail || r.id === teacherIdOrEmail;
  });
  if (!match) {
    throw new Error(
      `onlineClassroomService: teacher ${teacherIdOrEmail} not found (employees lookup)`,
    );
  }
  return String(match.id);
}

/** Read-then-verify ownership: missing → throw (writes) — never another teacher's session. */
async function loadOwnedSession(sessionId: string, teacherId: string): Promise<any> {
  const { data, error } = await supabase
    .from('online_sessions')
    .select(SESSION_OWNERSHIP_SELECT)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`onlineClassroomService: session ${sessionId} not found`);
  if (String((data as any).teacher_id) !== teacherId) {
    throw new Error(
      `onlineClassroomService: session ${sessionId} is not assigned to this teacher`,
    );
  }
  return data;
}

/** Teacher-scoped session read for list/view flows: unowned/missing → null (never a throw). */
async function loadScopedSession(sessionId: string, teacherId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('online_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (String((data as any).teacher_id) !== teacherId) return null;
  return data;
}

export const onlineClassroomService = {
  /**
   * Record one technical signal for a session. Validates everything BEFORE
   * any write: signal type, recorded source, session existence + teacher
   * ownership, and (when a student is given) participant membership. Writes
   * a single row to online_session_signals — participation_status is never
   * read for mutation and never written. Mock → null.
   */
  async recordSignal(
    sessionId: string,
    teacherIdOrEmail: string,
    input: RecordSignalInput,
  ): Promise<ClassroomSignal | null> {
    if (isMockEnv()) return null;
    if (!SIGNAL_TYPES.has(String(input.signalType))) {
      throw new Error(
        `onlineClassroomService.recordSignal: invalid signal type ${JSON.stringify(input.signalType)} (expected joined|left|connection|recording)`,
      );
    }
    const recordedSource = input.recordedSource ?? 'manual';
    if (!RECORDED_SOURCES.has(String(recordedSource))) {
      throw new Error(
        `onlineClassroomService.recordSignal: invalid recorded source ${JSON.stringify(input.recordedSource)} (expected manual|provider)`,
      );
    }
    let occurredAt = new Date().toISOString();
    if (input.occurredAt !== undefined) {
      const parsed = new Date(input.occurredAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(
          `onlineClassroomService.recordSignal: invalid occurred_at ${JSON.stringify(input.occurredAt)}`,
        );
      }
      occurredAt = parsed.toISOString();
    }
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    await loadOwnedSession(sessionId, teacherId);
    const studentId = input.studentId ? String(input.studentId) : null;
    if (studentId) {
      const { data: participant, error: partError } = await supabase
        .from('online_session_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('student_id', studentId)
        .maybeSingle();
      if (partError) throw partError;
      if (!participant) {
        throw new Error(
          `onlineClassroomService.recordSignal: student ${studentId} is not a participant of session ${sessionId}`,
        );
      }
    }
    const { data: inserted, error: insertError } = await supabase
      .from('online_session_signals')
      .insert({
        session_id: sessionId,
        ...(studentId ? { student_id: studentId } : { student_id: null }),
        signal_type: String(input.signalType),
        occurred_at: occurredAt,
        ...(input.metadata ? { metadata: input.metadata } : {}),
        recorded_source: recordedSource,
      })
      .select(SIGNAL_SELECT)
      .single();
    if (insertError || !inserted) {
      throw insertError ?? new Error('onlineClassroomService.recordSignal: insert returned no row');
    }
    return mapSignal(inserted);
  },

  /**
   * Session signal list, teacher-scoped (assigned teacher only; anyone else
   * → null). Ascending by occurred_at for cockpit display. Mock → [].
   */
  async getSessionSignals(
    sessionId: string,
    teacherIdOrEmail: string,
  ): Promise<ClassroomSignal[] | null> {
    if (isMockEnv()) return [];
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    const session = await loadScopedSession(sessionId, teacherId);
    if (!session) return null;
    const { data, error } = await supabase
      .from('online_session_signals')
      .select(SIGNAL_SELECT)
      .eq('session_id', sessionId)
      .order('occurred_at');
    if (error) throw error;
    return ((data ?? []) as any[]).map(mapSignal);
  },

  /**
   * Teacher view for confirmation: the manual participation roster
   * (statuses exactly as the teacher marked them — signals change nothing)
   * with each student's signal evidence + derived duration alongside, plus
   * system-wide signals. Participation confirmation stays in the existing
   * recordParticipation flow, untouched. Mock → null; unowned → null.
   */
  async getSessionParticipationWithSignals(
    sessionId: string,
    teacherIdOrEmail: string,
  ): Promise<SessionSignalsView | null> {
    if (isMockEnv()) return null;
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    const session = await loadScopedSession(sessionId, teacherId);
    if (!session) return null;

    const { data: partRows, error: partError } = await supabase
      .from('online_session_participants')
      .select(PARTICIPANT_SELECT)
      .eq('session_id', sessionId)
      .order('created_at');
    if (partError) throw partError;

    const { data: signalRows, error: signalError } = await supabase
      .from('online_session_signals')
      .select(SIGNAL_SELECT)
      .eq('session_id', sessionId)
      .order('occurred_at');
    if (signalError) throw signalError;

    const signals = ((signalRows ?? []) as any[]).map(mapSignal);
    const durations = new Map(
      computePresenceDurations(signals).map((d) => [d.studentId, d.durationSeconds]),
    );
    const signalsByStudent = new Map<string, ClassroomSignal[]>();
    for (const s of signals) {
      if (!s.studentId) continue;
      const list = signalsByStudent.get(s.studentId) ?? [];
      list.push(s);
      signalsByStudent.set(s.studentId, list);
    }

    const participants: ParticipantSignalSummary[] = ((partRows ?? []) as any[]).map((row) => ({
      studentId: String(row.student_id),
      ...mapParticipantName(row),
      participationStatus: String(row.participation_status ?? 'pending'),
      signals: signalsByStudent.get(String(row.student_id)) ?? [],
      durationSeconds: durations.get(String(row.student_id)) ?? null,
    }));

    return {
      sessionId,
      participants,
      systemSignals: signals.filter((s) => !s.studentId),
    };
  },
};
