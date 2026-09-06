/**
 * Phase 9H Task 1 — classroom abstraction + technical signals (RED).
 *
 * Covers:
 * (a) provider registry resolves zoom|meet|teams|custom link builders
 *     (URL patterns, no SDK calls — pure helpers, zero DB access).
 * (b) technical signal ingest (joined/left/duration per participant per
 *     session) stores rows in online_session_signals.
 * (c) signals NEVER alter participation_status (participation unchanged
 *     after signal ingest; no writes to online_session_participants).
 * (d) teacher view shows signals alongside participation for confirmation
 *     (participation stays teacher-confirmed, manual flow untouched).
 * (e) mock env → honest empties, no DB calls.
 * (f) DB error → throws (never silent).
 *
 * Locked: provider-agnostic orchestration; technical signals are evidence
 * for the teacher, NEVER automatic participation; no video build; never
 * touches student_attendance_*.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import {
  CLASSROOM_PROVIDERS,
  buildClassroomLink,
  resolveClassroomProvider,
  computePresenceDurations,
  onlineClassroomService,
} from '../modules/online/onlineClassroomService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

const TEACHER_A = '11111111-1111-1111-1111-111111111111';
const TEACHER_B = '22222222-2222-2222-2222-222222222222';

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

function forceMockEnv() {
  process.env.NODE_ENV = 'test';
  (import.meta.env as any).VITE_SUPABASE_URL = PLACEHOLDER_URL;
}

type QResult = { data: any; error: any };

const writeCalls: { kind: string; table: string; payload?: unknown }[] = [];

/**
 * Chainable supabase query mock. Every filter/ordering method returns the
 * chain; `await chain` resolves the table result; .single()/.maybeSingle()
 * resolve it too. update/insert tracked in writeCalls.
 */
function mockQuery(table: string, result: QResult) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn((payload: unknown) => {
    writeCalls.push({ kind: 'update', table, payload });
    return chain;
  });
  chain.insert = vi.fn((payload: unknown) => {
    writeCalls.push({ kind: 'insert', table, payload });
    return chain;
  });
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = chain.single;
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

/**
 * Per-table results; a value may be a single QResult (repeated) or an
 * array of QResults consumed in call order (for same-table read→write).
 */
function mockFrom(resultByTable: Record<string, QResult | QResult[]>) {
  const queues = new Map<string, QResult[]>();
  (supabase.from as any).mockImplementation((table: string) => {
    const entry = resultByTable[table] ?? resultByTable['*'] ?? { data: [], error: null };
    if (Array.isArray(entry)) {
      if (!queues.has(table)) queues.set(table, [...entry]);
      const q = queues.get(table)!;
      return mockQuery(table, q.length > 0 ? q.shift()! : { data: [], error: null });
    }
    return mockQuery(table, entry);
  });
}

const SESSION_IN_PROGRESS = {
  id: 'ses-1',
  school_id: 's1',
  offering_id: 'off-1',
  teacher_id: TEACHER_A,
  status: 'IN_PROGRESS',
  scheduled_start: '2026-09-08T09:00:00Z',
  scheduled_end: '2026-09-08T10:00:00Z',
  session_type: 'lesson',
  join_url: 'https://zoom.us/j/123456789?pwd=abc',
};

const PARTICIPANT_PENDING = {
  id: 'part-1',
  session_id: 'ses-1',
  student_id: 'stud-1',
  participation_status: 'pending',
  student: {
    id: 'stud-1',
    admission_number: 'GCC-2024-001',
    person: { first_name: 'John', last_name: 'Okello' },
  },
};

const SIGNAL_JOINED = {
  id: 'sig-1',
  session_id: 'ses-1',
  student_id: 'stud-1',
  signal_type: 'joined',
  occurred_at: '2026-09-08T09:04:00Z',
  metadata: {},
  recorded_source: 'provider',
};

const SIGNAL_LEFT = {
  id: 'sig-2',
  session_id: 'ses-1',
  student_id: 'stud-1',
  signal_type: 'left',
  occurred_at: '2026-09-08T09:21:00Z',
  metadata: {},
  recorded_source: 'provider',
};

beforeEach(() => {
  vi.resetAllMocks();
  writeCalls.length = 0;
  forceProductionEnv();
});

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

describe('(a) provider registry resolves zoom|meet|teams|custom (pure URL helpers, no SDK)', () => {
  it('registry covers exactly zoom, meet, teams, custom', () => {
    expect([...CLASSROOM_PROVIDERS].sort()).toEqual(['custom', 'meet', 'teams', 'zoom']);
  });

  it('zoom builder produces a zoom join URL from a meeting id', () => {
    const url = buildClassroomLink('zoom', { meetingId: '123456789', password: 'abc' });
    expect(url).toContain('zoom.us/j/123456789');
    expect(url).toContain('abc');
  });

  it('meet builder produces a meet URL from a meeting code', () => {
    const url = buildClassroomLink('meet', { code: 'abc-defg-hij' });
    expect(url).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('teams builder produces a teams join URL', () => {
    const url = buildClassroomLink('teams', { threadId: '19:xyz@thread.v2' });
    expect(url).toContain('teams.microsoft.com');
  });

  it('custom builder passes a valid https URL through unchanged', () => {
    const url = buildClassroomLink('custom', { url: 'https://school.example/live/y5-maths' });
    expect(url).toBe('https://school.example/live/y5-maths');
  });

  it('unknown provider / invalid refs throw with nothing written', () => {
    expect(() => buildClassroomLink('skype' as any, {})).toThrow();
    expect(() => buildClassroomLink('zoom', { meetingId: '' })).toThrow();
    expect(() => buildClassroomLink('meet', { code: '' })).toThrow();
    expect(() => buildClassroomLink('custom', { url: 'not-a-url' })).toThrow();
    expect(writeCalls).toHaveLength(0);
  });

  it('resolveClassroomProvider detects the provider from URL patterns', () => {
    expect(resolveClassroomProvider('https://zoom.us/j/123456789?pwd=abc')).toBe('zoom');
    expect(resolveClassroomProvider('https://meet.google.com/abc-defg-hij')).toBe('meet');
    expect(resolveClassroomProvider('https://teams.microsoft.com/l/meetup-join/19:xyz')).toBe('teams');
    expect(resolveClassroomProvider('https://school.example/live/y5-maths')).toBe('custom');
    expect(resolveClassroomProvider('not-a-url')).toBeNull();
  });

  it('provider helpers are pure: zero DB calls', () => {
    buildClassroomLink('zoom', { meetingId: '123456789' });
    buildClassroomLink('meet', { code: 'abc-defg-hij' });
    buildClassroomLink('teams', { threadId: '19:xyz' });
    buildClassroomLink('custom', { url: 'https://school.example/live' });
    resolveClassroomProvider('https://zoom.us/j/123456789');
    computePresenceDurations([SIGNAL_JOINED, SIGNAL_LEFT]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('(b) technical signal ingest stores rows per participant per session', () => {
  it('recordSignal stores a joined signal for a session participant', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
      online_session_participants: [{ data: PARTICIPANT_PENDING, error: null }],
      online_session_signals: [{ data: SIGNAL_JOINED, error: null }],
    });
    const out = await onlineClassroomService.recordSignal('ses-1', TEACHER_A, {
      studentId: 'stud-1',
      signalType: 'joined',
      occurredAt: '2026-09-08T09:04:00Z',
      recordedSource: 'provider',
    });
    expect(out).not.toBeNull();
    expect(out!.sessionId).toBe('ses-1');
    expect(out!.studentId).toBe('stud-1');
    expect(out!.signalType).toBe('joined');
    expect(out!.occurredAt).toBe('2026-09-08T09:04:00Z');
    const inserts = writeCalls.filter(
      (w) => w.kind === 'insert' && w.table === 'online_session_signals',
    );
    expect(inserts).toHaveLength(1);
    expect((inserts[0].payload as any).session_id).toBe('ses-1');
    expect((inserts[0].payload as any).student_id).toBe('stud-1');
    expect((inserts[0].payload as any).signal_type).toBe('joined');
  });

  it('recordSignal stores a left signal and durations pair per participant', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
      online_session_participants: [{ data: PARTICIPANT_PENDING, error: null }],
      online_session_signals: [{ data: SIGNAL_LEFT, error: null }],
    });
    const out = await onlineClassroomService.recordSignal('ses-1', TEACHER_A, {
      studentId: 'stud-1',
      signalType: 'left',
      occurredAt: '2026-09-08T09:21:00Z',
      recordedSource: 'provider',
    });
    expect(out!.signalType).toBe('left');
    // 09:04 → 09:21 = 17 minutes of presence evidence.
    const durations = computePresenceDurations([SIGNAL_JOINED, SIGNAL_LEFT]);
    expect(durations).toHaveLength(1);
    expect(durations[0].studentId).toBe('stud-1');
    expect(durations[0].durationSeconds).toBe(17 * 60);
  });

  it('system signals (e.g. recording, no student) are stored with null student', async () => {
    const recordingRow = {
      id: 'sig-9',
      session_id: 'ses-1',
      student_id: null,
      signal_type: 'recording',
      occurred_at: '2026-09-08T09:00:00Z',
      metadata: {},
      recorded_source: 'manual',
    };
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
      online_session_signals: [{ data: recordingRow, error: null }],
    });
    const out = await onlineClassroomService.recordSignal('ses-1', TEACHER_A, {
      signalType: 'recording',
      recordedSource: 'manual',
    });
    expect(out).not.toBeNull();
    expect(out!.studentId).toBeUndefined();
    expect(out!.signalType).toBe('recording');
    const inserts = writeCalls.filter((w) => w.table === 'online_session_signals');
    expect(inserts).toHaveLength(1);
  });

  it('invalid signal type throws with nothing written', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
    });
    await expect(
      onlineClassroomService.recordSignal('ses-1', TEACHER_A, {
        studentId: 'stud-1',
        signalType: 'teleported',
      }),
    ).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });

  it('non-participant student throws (membership enforced)', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
      online_session_participants: [{ data: null, error: null }],
    });
    await expect(
      onlineClassroomService.recordSignal('ses-1', TEACHER_A, {
        studentId: 'stud-9',
        signalType: 'joined',
      }),
    ).rejects.toThrow();
    expect(writeCalls.filter((w) => w.table === 'online_session_signals')).toHaveLength(0);
  });

  it('non-assigned teacher cannot record signals; nothing written', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
    });
    await expect(
      onlineClassroomService.recordSignal('ses-1', TEACHER_B, {
        studentId: 'stud-1',
        signalType: 'joined',
      }),
    ).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });
});

describe('(c) signals NEVER alter participation_status', () => {
  it('participation is unchanged after signal ingest (no participant writes)', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
      online_session_participants: [
        { data: PARTICIPANT_PENDING, error: null },
        // Re-read after ingest: still pending — the signal changed nothing.
        { data: PARTICIPANT_PENDING, error: null },
      ],
      online_session_signals: [{ data: SIGNAL_JOINED, error: null }],
    });
    await onlineClassroomService.recordSignal('ses-1', TEACHER_A, {
      studentId: 'stud-1',
      signalType: 'joined',
      occurredAt: '2026-09-08T09:04:00Z',
    });
    // The ONLY write is the signal row itself.
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].table).toBe('online_session_signals');
    expect(writeCalls.some((w) => w.table === 'online_session_participants')).toBe(false);
    expect(writeCalls.some((w) => w.table.startsWith('student_attendance'))).toBe(false);
  });
});

describe('(d) teacher view shows signals alongside participation for confirmation', () => {
  it('returns roster with participation status plus signal evidence per student', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
      online_session_participants: [{ data: [PARTICIPANT_PENDING], error: null }],
      online_session_signals: [{ data: [SIGNAL_JOINED, SIGNAL_LEFT], error: null }],
    });
    const view = await onlineClassroomService.getSessionParticipationWithSignals(
      'ses-1',
      TEACHER_A,
    );
    expect(view).not.toBeNull();
    expect(view!.sessionId).toBe('ses-1');
    expect(view!.participants).toHaveLength(1);
    // Teacher-confirmed participation is untouched by signals: still pending
    // until the teacher marks it via the existing recordParticipation flow.
    expect(view!.participants[0].participationStatus).toBe('pending');
    expect(view!.participants[0].studentName).toBe('John Okello');
    // ...while the technical evidence sits alongside for confirmation.
    expect(view!.participants[0].signals.map((s) => s.signalType).sort()).toEqual([
      'joined',
      'left',
    ]);
    expect(view!.participants[0].durationSeconds).toBe(17 * 60);
  });

  it('getSessionSignals returns the session signal list, teacher-scoped', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
      online_session_signals: [{ data: [SIGNAL_JOINED, SIGNAL_LEFT], error: null }],
    });
    const signals = await onlineClassroomService.getSessionSignals('ses-1', TEACHER_A);
    expect(signals).toHaveLength(2);
    expect(signals!.map((s) => s.signalType).sort()).toEqual(['joined', 'left']);
  });

  it('unauthorized teacher gets null — never another teacher’s session', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
    });
    await expect(
      onlineClassroomService.getSessionSignals('ses-1', TEACHER_B),
    ).resolves.toBeNull();
    await expect(
      onlineClassroomService.getSessionParticipationWithSignals('ses-1', TEACHER_B),
    ).resolves.toBeNull();
  });
});

describe('(e) mock-env honest empties', () => {
  it('no DB calls; record → null, list → [], view → null', async () => {
    forceMockEnv();
    await expect(
      onlineClassroomService.recordSignal('ses-1', TEACHER_A, {
        studentId: 'stud-1',
        signalType: 'joined',
      }),
    ).resolves.toBeNull();
    await expect(onlineClassroomService.getSessionSignals('ses-1', TEACHER_A)).resolves.toEqual(
      [],
    );
    await expect(
      onlineClassroomService.getSessionParticipationWithSignals('ses-1', TEACHER_A),
    ).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('(f) DB error → throws', () => {
  it('session-read failure throws for record, list, and teacher view', async () => {
    mockFrom({ online_sessions: { data: null, error: new Error('DB down') } });
    await expect(
      onlineClassroomService.recordSignal('ses-1', TEACHER_A, {
        studentId: 'stud-1',
        signalType: 'joined',
      }),
    ).rejects.toThrow();
    await expect(onlineClassroomService.getSessionSignals('ses-1', TEACHER_A)).rejects.toThrow();
    await expect(
      onlineClassroomService.getSessionParticipationWithSignals('ses-1', TEACHER_A),
    ).rejects.toThrow();
  });

  it('signal-insert failure throws', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_IN_PROGRESS, error: null }],
      online_session_participants: [{ data: PARTICIPANT_PENDING, error: null }],
      online_session_signals: [{ data: null, error: new Error('DB down') }],
    });
    await expect(
      onlineClassroomService.recordSignal('ses-1', TEACHER_A, {
        studentId: 'stud-1',
        signalType: 'joined',
      }),
    ).rejects.toThrow();
  });
});
