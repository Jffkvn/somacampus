import { supabase } from '../../lib/supabase';

/**
 * Phase 9C Task 1 — teacher online day view + session cockpit.
 *
 * Conventions (per feesService D1 hardening + 9A onlineCentreService):
 * - Mock env → honest empties ([] / null), never mock data.
 * - Live DB error → throw. Empty table → [] / null (NO_DATA, success).
 * - Every read/write is scoped to the assigned teacher (teacher_id = the
 *   caller's employee id). Reads filter app-side as defence in depth; writes
 *   read-then-verify ownership first and throw on mismatch. RLS is the
 *   backstop. An unauthorized teacher gets null (reads) or a throw (writes)
 *   — never another teacher's session.
 * - Caller identity: UUIDs pass through as employee ids; a non-UUID
 *   (e.g. a login email, mirroring teacherService.getTeacherToday) is
 *   resolved via an employees lookup and throws when unknown. Raw ids are
 *   never trusted beyond the teacher_id scope they produce.
 *
 * LOCKED (participation ≠ attendance): this module writes ONLY
 * online_sessions (status transitions) and online_session_participants
 * (participation_status). It NEVER touches student_attendance_*.
 *
 * Join = link display: join_url is surfaced for display / a join button.
 * No video build.
 *
 * State machine (strict, tested):
 * - startSession: SCHEDULED/CONFIRMED → IN_PROGRESS only.
 * - recordParticipation: session must be IN_PROGRESS; status must be one of
 *   present/absent/late/partial/excused; the participant row must already
 *   exist (participants are provisioned at enrolment/booking time — no
 *   silent upsert that could fabricate a roster place).
 * - completeSession: session must be IN_PROGRESS and the completion note
 *   must be non-empty (validated first, before any DB call). Terminal
 *   states (COMPLETED/CANCELLED/NO_SHOW) are read-only everywhere.
 *
 * SCHEMA NOTE (verified against supabase/migrations/20260914000000):
 * public.online_sessions has NO session_note / completed_at / started_at
 * columns, and no migration may be added in this task. Therefore:
 * - start/complete persist ONLY { status } (live-safe — no write to
 *   non-existent columns).
 * - completeSession still REQUIRES a non-empty note (completion gate,
 *   echoed back in the response so the UI can display it in-session).
 * - previousNote reads the latest COMPLETED session of the same offering
 *   (same teacher — never another teacher's session) via select('*') so
 *   the read is live-safe today and picks up a future session_note column
 *   automatically; until that migration lands it degrades to null
 *   (honest empty, pinned by test).
 * Durable note storage needs a follow-up migration adding
 * online_sessions.session_note (+ completed_at/started_at timestamps).
 */

export type ParticipationStatus =
  | 'pending'
  | 'present'
  | 'absent'
  | 'late'
  | 'partial'
  | 'excused';

export interface OnlineSessionSummary {
  id: string;
  schoolId: string;
  offeringId?: string;
  offeringTitle?: string;
  teacherId: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  sessionType?: string;
  joinUrl?: string;
  curriculumObjectiveId?: string;
}

export interface OnlineDaySession extends OnlineSessionSummary {
  participantCount: number;
  presentCount: number;
}

export interface OnlineSessionParticipant {
  id: string;
  sessionId: string;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  status: ParticipationStatus;
  joinedAt?: string;
  leftAt?: string;
}

export interface OnlineSessionDetail {
  session: OnlineDaySession;
  participants: OnlineSessionParticipant[];
  /** Latest COMPLETED same-offering (+same-teacher) session note, else null. */
  previousNote: string | null;
}

export interface CompletedSession {
  session: OnlineSessionSummary;
  /** Echo of the validated completion note (see SCHEMA NOTE). */
  note: string;
}

/** Minimal physical-timetable shape the day merge needs (from teacherService). */
export interface PhysicalDayEntry {
  id: string;
  startTime: string;
  endTime: string;
  className: string;
  subjectName: string;
}

export type DayTimelineItem<P extends PhysicalDayEntry = PhysicalDayEntry> =
  | { kind: 'physical'; contextBadge: 'Physical'; startMinutes: number; entry: P }
  | { kind: 'online'; contextBadge: 'Online'; startMinutes: number; session: OnlineDaySession };

const STARTABLE_STATUSES: ReadonlySet<string> = new Set(['SCHEDULED', 'CONFIRMED']);

/** Writable participation marks (spec: pending is the default, never a mark). */
const RECORDABLE_PARTICIPATION: ReadonlySet<string> = new Set([
  'present',
  'absent',
  'late',
  'partial',
  'excused',
]);

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const isUUID = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

/** "HH:MM[:SS]" or ISO timestamp → minutes since midnight (UTC for ISO). */
function startMinutesOfPhysical(e: PhysicalDayEntry): number {
  const m = String(e.startTime).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * 60 + Number(m[2]);
}

function startMinutesOfOnline(s: { scheduledStart: string }): number {
  const d = new Date(s.scheduledStart);
  if (Number.isNaN(d.getTime())) return Number.MAX_SAFE_INTEGER;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Pure day merge: physical timetable entries + online sessions, ascending
 * by start time. Same-minute ties break physical-first (the classroom
 * period anchors the day). Each item carries its context badge.
 */
export function mergeDayItems<P extends PhysicalDayEntry>(
  physical: P[],
  online: OnlineDaySession[],
): DayTimelineItem<P>[] {
  const items: DayTimelineItem<P>[] = [
    ...physical.map(
      (entry): DayTimelineItem<P> => ({
        kind: 'physical',
        contextBadge: 'Physical',
        startMinutes: startMinutesOfPhysical(entry),
        entry,
      }),
    ),
    ...online.map(
      (session): DayTimelineItem<P> => ({
        kind: 'online',
        contextBadge: 'Online',
        startMinutes: startMinutesOfOnline(session),
        session,
      }),
    ),
  ];
  items.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (a.kind === b.kind) return 0;
    return a.kind === 'physical' ? -1 : 1;
  });
  return items;
}

function mapSessionSummary(row: any): OnlineSessionSummary {
  const offering = one(row.offering);
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    ...(row.offering_id ? { offeringId: String(row.offering_id) } : {}),
    ...(offering?.title ? { offeringTitle: String(offering.title) } : {}),
    teacherId: String(row.teacher_id),
    status: String(row.status),
    scheduledStart: String(row.scheduled_start),
    scheduledEnd: String(row.scheduled_end),
    ...(row.session_type ? { sessionType: String(row.session_type) } : {}),
    ...(row.join_url ? { joinUrl: String(row.join_url) } : {}),
    ...(row.curriculum_objective_id
      ? { curriculumObjectiveId: String(row.curriculum_objective_id) }
      : {}),
  };
}

function mapParticipant(row: any): OnlineSessionParticipant {
  const student = one(row.student);
  const person = one(student?.person);
  const name =
    person && (person.first_name || person.last_name)
      ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim()
      : undefined;
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    studentId: String(row.student_id),
    ...(name ? { studentName: name } : {}),
    ...(student?.admission_number ? { admissionNumber: String(student.admission_number) } : {}),
    status: String(row.participation_status ?? 'pending') as ParticipationStatus,
    ...(row.joined_at ? { joinedAt: String(row.joined_at) } : {}),
    ...(row.left_at ? { leftAt: String(row.left_at) } : {}),
  };
}

const SESSION_SELECT =
  'id, school_id, offering_id, teacher_id, status, scheduled_start, scheduled_end, session_type, join_url, curriculum_objective_id, offering:online_offerings(id, title)';

const PARTICIPANT_SELECT =
  'id, session_id, student_id, participation_status, joined_at, left_at, student:students(id, admission_number, person:people(first_name, last_name))';

/**
 * UUID employee ids pass through; anything else (login email, mirroring
 * teacherService) resolves via employees → people(email). Unknown → throw.
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
      `onlineTeachingService: teacher ${teacherIdOrEmail} not found (employees lookup)`,
    );
  }
  return String(match.id);
}

/** Read-then-verify ownership: missing → throw, foreign → throw. */
async function loadOwnedSession(sessionId: string, teacherId: string): Promise<any> {
  const { data, error } = await supabase
    .from('online_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`onlineTeachingService: session ${sessionId} not found`);
  if (String((data as any).teacher_id) !== teacherId) {
    throw new Error(
      `onlineTeachingService: session ${sessionId} is not assigned to this teacher`,
    );
  }
  return data;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`onlineTeachingService: invalid date ${JSON.stringify(date)} (expected YYYY-MM-DD)`);
  }
  return new Date(d.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
}

export const onlineTeachingService = {
  /**
   * Teacher's online sessions for one calendar day (YYYY-MM-DD, UTC day
   * window — same UTC interpretation as confirmBooking), with per-session
   * participant + present counts. Teacher-scoped; other teachers' rows are
   * dropped app-side as defence in depth. Mock → [].
   */
  async getOnlineDay(teacherIdOrEmail: string, date: string): Promise<OnlineDaySession[]> {
    if (isMockEnv()) return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`onlineTeachingService.getOnlineDay: invalid date ${JSON.stringify(date)}`);
    }
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    const start = `${date}T00:00:00Z`;
    const end = `${nextDay(date)}T00:00:00Z`;

    const { data: sessions, error: sessError } = await supabase
      .from('online_sessions')
      .select(SESSION_SELECT)
      .eq('teacher_id', teacherId)
      .gte('scheduled_start', start)
      .lt('scheduled_start', end)
      .order('scheduled_start');
    if (sessError) throw sessError;

    const rows = ((sessions ?? []) as any[]).filter((s) => String(s.teacher_id) === teacherId);
    if (rows.length === 0) return [];
    const summaries = rows.map(mapSessionSummary);

    const { data: parts, error: partError } = await supabase
      .from('online_session_participants')
      .select('session_id, participation_status')
      .in('session_id', rows.map((r) => r.id));
    if (partError) throw partError;

    const counts = new Map<string, { total: number; present: number }>();
    for (const p of ((parts ?? []) as any[])) {
      const key = String(p.session_id);
      const c = counts.get(key) ?? { total: 0, present: 0 };
      c.total += 1;
      if (String(p.participation_status) === 'present') c.present += 1;
      counts.set(key, c);
    }

    return summaries
      .map((s) => ({
        ...s,
        participantCount: counts.get(s.id)?.total ?? 0,
        presentCount: counts.get(s.id)?.present ?? 0,
      }))
      .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : a.scheduledStart > b.scheduledStart ? 1 : 0));
  },

  /**
   * Session cockpit payload: owned session + roster + previous session note
   * (latest COMPLETED, same offering AND same teacher — never another
   * teacher's session; null when none). Unowned/missing → null (denied →
   * empty). Mock → null.
   */
  async getOnlineSession(
    sessionId: string,
    teacherIdOrEmail: string,
  ): Promise<OnlineSessionDetail | null> {
    if (isMockEnv()) return null;
    const teacherId = await resolveTeacherId(teacherIdOrEmail);

    const { data: sessionRow, error: sessError } = await supabase
      .from('online_sessions')
      .select(SESSION_SELECT)
      .eq('id', sessionId)
      .maybeSingle();
    if (sessError) throw sessError;
    if (!sessionRow) return null;
    if (String((sessionRow as any).teacher_id) !== teacherId) return null;

    const { data: partRows, error: partError } = await supabase
      .from('online_session_participants')
      .select(PARTICIPANT_SELECT)
      .eq('session_id', sessionId)
      .order('created_at');
    if (partError) throw partError;
    const participants = ((partRows ?? []) as any[]).map(mapParticipant);

    let previousNote: string | null = null;
    const offeringId = (sessionRow as any).offering_id;
    if (offeringId) {
      // select('*'): live-safe today (no session_note column yet — see
      // SCHEMA NOTE) and future-proof once the follow-up migration lands.
      const { data: priorRows, error: priorError } = await supabase
        .from('online_sessions')
        .select('*')
        .eq('offering_id', offeringId)
        .eq('teacher_id', teacherId)
        .eq('status', 'COMPLETED')
        .neq('id', sessionId)
        .order('scheduled_start', { ascending: false })
        .limit(1);
      if (priorError) throw priorError;
      const prior = ((priorRows ?? []) as any[])[0];
      previousNote = prior?.session_note ? String(prior.session_note) : null;
    }

    const summary = mapSessionSummary(sessionRow);
    return {
      session: {
        ...summary,
        participantCount: participants.length,
        presentCount: participants.filter((p) => p.status === 'present').length,
      },
      participants,
      previousNote,
    };
  },

  /**
   * SCHEDULED/CONFIRMED → IN_PROGRESS, assigned teacher only. Anything
   * else (incl. already-live/terminal) throws with nothing written.
   * Mock → null.
   */
  async startSession(
    sessionId: string,
    teacherIdOrEmail: string,
  ): Promise<OnlineSessionSummary | null> {
    if (isMockEnv()) return null;
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    const current = await loadOwnedSession(sessionId, teacherId);
    if (!STARTABLE_STATUSES.has(String(current.status))) {
      throw new Error(
        `onlineTeachingService.startSession: session ${sessionId} is ${current.status}, must be SCHEDULED or CONFIRMED`,
      );
    }
    const { data: updated, error: updateError } = await supabase
      .from('online_sessions')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', sessionId)
      .select(SESSION_SELECT)
      .single();
    if (updateError || !updated) {
      throw updateError ?? new Error('onlineTeachingService.startSession: start update returned no row');
    }
    return mapSessionSummary(updated);
  },

  /**
   * Record one student's participation while the session is IN_PROGRESS.
   * Participation-only: touches online_session_participants, never
   * student_attendance_*. Mock → null.
   */
  async recordParticipation(
    sessionId: string,
    teacherIdOrEmail: string,
    studentId: string,
    status: string,
  ): Promise<OnlineSessionParticipant | null> {
    if (isMockEnv()) return null;
    if (!RECORDABLE_PARTICIPATION.has(String(status))) {
      throw new Error(
        `onlineTeachingService.recordParticipation: invalid status ${JSON.stringify(status)} (expected present/absent/late/partial/excused)`,
      );
    }
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    const current = await loadOwnedSession(sessionId, teacherId);
    if (String(current.status) !== 'IN_PROGRESS') {
      throw new Error(
        `onlineTeachingService.recordParticipation: session ${sessionId} is ${current.status}, must be IN_PROGRESS`,
      );
    }
    const { data: participant, error: readError } = await supabase
      .from('online_session_participants')
      .select(PARTICIPANT_SELECT)
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (readError) throw readError;
    if (!participant) {
      throw new Error(
        `onlineTeachingService.recordParticipation: student ${studentId} is not a participant of session ${sessionId}`,
      );
    }
    const { data: updated, error: updateError } = await supabase
      .from('online_session_participants')
      .update({ participation_status: status })
      .eq('id', (participant as any).id)
      .select(PARTICIPANT_SELECT)
      .single();
    if (updateError || !updated) {
      throw updateError ?? new Error('onlineTeachingService.recordParticipation: update returned no row');
    }
    return mapParticipant(updated);
  },

  /**
   * IN_PROGRESS → COMPLETED with a REQUIRED non-empty completion note
   * (validated before any DB call; blank throws with nothing written).
   * The note is echoed in the response — durable storage awaits the
   * follow-up session_note migration (see SCHEMA NOTE). Mock → null.
   */
  async completeSession(
    sessionId: string,
    teacherIdOrEmail: string,
    note: string,
  ): Promise<CompletedSession | null> {
    if (isMockEnv()) return null;
    if (!note || !note.trim()) {
      throw new Error('onlineTeachingService.completeSession: a completion note is required to complete a session');
    }
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    const current = await loadOwnedSession(sessionId, teacherId);
    if (String(current.status) !== 'IN_PROGRESS') {
      throw new Error(
        `onlineTeachingService.completeSession: session ${sessionId} is ${current.status}, must be IN_PROGRESS`,
      );
    }
    const { data: updated, error: updateError } = await supabase
      .from('online_sessions')
      .update({ status: 'COMPLETED' })
      .eq('id', sessionId)
      .select(SESSION_SELECT)
      .single();
    if (updateError || !updated) {
      throw updateError ?? new Error('onlineTeachingService.completeSession: complete update returned no row');
    }
    return { session: mapSessionSummary(updated), note: note.trim() };
  },
};
