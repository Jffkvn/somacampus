/**
 * Phase 9C Task 1 — teacher online day view + session cockpit (RED).
 *
 * Covers:
 * (a) day view merges physical timetable entries + online sessions
 *     chronologically with context badges (pure mergeDayItems) and
 *     getOnlineDay returns teacher-scoped sessions with participant counts.
 * (b) session cockpit loads session + participants + prior session note
 *     (offering-scoped latest COMPLETED note).
 * (c) start session: SCHEDULED/CONFIRMED → IN_PROGRESS, only by the
 *     assigned teacher; terminal states throw with nothing written.
 * (d) record participation per student (present/absent/late/partial/excused);
 *     invalid status / unknown student / non-live session throw.
 * (e) complete session: empty note throws with nothing written (note is
 *     REQUIRED); IN_PROGRESS + note → COMPLETED; completing an unstarted
 *     session throws.
 * (f) unauthorized teacher (not assigned) gets denied/empty — never another
 *     teacher's session.
 * (g) mock env → honest empties, no DB calls.
 * (h) DB error → throws (never silent).
 *
 * Locked: participation NEVER writes student_attendance_* (asserted via
 * writeCalls — only online_session_participants / online_sessions touched).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import {
  mergeDayItems,
  onlineTeachingService,
} from '../modules/online/onlineTeachingService';

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

const SESSION_SCHEDULED = {
  id: 'ses-1',
  school_id: 's1',
  offering_id: 'off-1',
  teacher_id: TEACHER_A,
  status: 'SCHEDULED',
  scheduled_start: '2026-09-08T09:00:00Z',
  scheduled_end: '2026-09-08T10:00:00Z',
  session_type: 'lesson',
  join_url: 'https://meet.example/ses-1',
  curriculum_objective_id: null,
  offering: { id: 'off-1', title: 'Cambridge Y5 Maths Online' },
};

const PARTICIPANTS = [
  {
    id: 'part-1',
    session_id: 'ses-1',
    student_id: 'stud-1',
    participation_status: 'pending',
    joined_at: null,
    left_at: null,
    student: {
      id: 'stud-1',
      admission_number: 'GCC-2024-001',
      person: { first_name: 'John', last_name: 'Okello' },
    },
  },
  {
    id: 'part-2',
    session_id: 'ses-1',
    student_id: 'stud-2',
    participation_status: 'pending',
    joined_at: null,
    left_at: null,
    student: {
      id: 'stud-2',
      admission_number: 'GCC-2024-002',
      person: { first_name: 'Grace', last_name: 'Achieng' },
    },
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  writeCalls.length = 0;
  forceProductionEnv();
});

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

describe('(a) day view merges physical + online chronologically with badges', () => {
  it('mergeDayItems interleaves physical and online items by start time', () => {
    const items = mergeDayItems(
      [
        { id: 'tt-1', startTime: '08:00', endTime: '09:00', className: 'Stage 5 Blue', subjectName: 'Mathematics' },
        { id: 'tt-2', startTime: '10:00', endTime: '11:00', className: 'Stage 5 Blue', subjectName: 'English' },
      ],
      [
        {
          id: 'ses-1', schoolId: 's1', teacherId: TEACHER_A, status: 'SCHEDULED',
          scheduledStart: '2026-09-08T09:00:00Z', scheduledEnd: '2026-09-08T10:00:00Z',
          participantCount: 2, presentCount: 0,
        },
      ],
    );
    expect(items.map((i) => i.kind)).toEqual(['physical', 'online', 'physical']);
    expect(items[1].kind).toBe('online');
    if (items[1].kind === 'online') {
      expect(items[1].contextBadge).toBe('Online');
      expect(items[1].session.id).toBe('ses-1');
    }
    if (items[0].kind === 'physical') {
      expect(items[0].contextBadge).toBe('Physical');
    }
  });

  it('getOnlineDay returns teacher sessions with participant counts, drops other-teacher rows', async () => {
    mockFrom({
      online_sessions: {
        data: [
          { ...SESSION_SCHEDULED },
          { ...SESSION_SCHEDULED, id: 'ses-x', teacher_id: TEACHER_B },
        ],
        error: null,
      },
      online_session_participants: {
        data: [
          { session_id: 'ses-1', participation_status: 'present' },
          { session_id: 'ses-1', participation_status: 'pending' },
        ],
        error: null,
      },
    });
    const day = await onlineTeachingService.getOnlineDay(TEACHER_A, '2026-09-08');
    expect(day).toHaveLength(1);
    expect(day[0].id).toBe('ses-1');
    expect(day[0].participantCount).toBe(2);
    expect(day[0].presentCount).toBe(1);
    expect(day[0].offeringTitle).toBe('Cambridge Y5 Maths Online');
    expect(day[0].joinUrl).toBe('https://meet.example/ses-1');
  });
});

describe('(b) session cockpit loads session + participants + prior note', () => {
  it('returns session, roster, and offering-scoped prior note', async () => {
    mockFrom({
      online_sessions: [
        { data: SESSION_SCHEDULED, error: null },
        {
          data: [{ id: 'ses-0', session_note: 'Fractions recap went well — revisit Q4.' }],
          error: null,
        },
      ],
      online_session_participants: { data: PARTICIPANTS, error: null },
    });
    const detail = await onlineTeachingService.getOnlineSession('ses-1', TEACHER_A);
    expect(detail).not.toBeNull();
    expect(detail!.session.id).toBe('ses-1');
    expect(detail!.session.status).toBe('SCHEDULED');
    expect(detail!.participants).toHaveLength(2);
    expect(detail!.participants[0].studentName).toBe('John Okello');
    expect(detail!.previousNote).toBe('Fractions recap went well — revisit Q4.');
  });

  it('previousNote is null when no prior COMPLETED session exists', async () => {
    mockFrom({
      online_sessions: [
        { data: SESSION_SCHEDULED, error: null },
        { data: [], error: null },
      ],
      online_session_participants: { data: PARTICIPANTS, error: null },
    });
    const detail = await onlineTeachingService.getOnlineSession('ses-1', TEACHER_A);
    expect(detail!.previousNote).toBeNull();
  });
});

describe('(c) start session', () => {
  it('SCHEDULED → IN_PROGRESS by the assigned teacher', async () => {
    mockFrom({
      online_sessions: [
        { data: SESSION_SCHEDULED, error: null },
        { data: { ...SESSION_SCHEDULED, status: 'IN_PROGRESS' }, error: null },
      ],
    });
    const out = await onlineTeachingService.startSession('ses-1', TEACHER_A);
    expect(out!.status).toBe('IN_PROGRESS');
    const updates = writeCalls.filter((w) => w.table === 'online_sessions');
    expect(updates).toHaveLength(1);
    expect((updates[0].payload as any).status).toBe('IN_PROGRESS');
  });

  it('CONFIRMED → IN_PROGRESS', async () => {
    mockFrom({
      online_sessions: [
        { data: { ...SESSION_SCHEDULED, status: 'CONFIRMED' }, error: null },
        { data: { ...SESSION_SCHEDULED, status: 'IN_PROGRESS' }, error: null },
      ],
    });
    const out = await onlineTeachingService.startSession('ses-1', TEACHER_A);
    expect(out!.status).toBe('IN_PROGRESS');
  });

  it('COMPLETED session cannot be started; nothing written', async () => {
    mockFrom({
      online_sessions: [{ data: { ...SESSION_SCHEDULED, status: 'COMPLETED' }, error: null }],
    });
    await expect(onlineTeachingService.startSession('ses-1', TEACHER_A)).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });
});

describe('(d) record participation', () => {
  it.each(['present', 'absent', 'late', 'partial', 'excused'] as const)(
    'records %s for a participant while IN_PROGRESS',
    async (status) => {
      writeCalls.length = 0;
      mockFrom({
        online_sessions: [
          { data: { ...SESSION_SCHEDULED, status: 'IN_PROGRESS' }, error: null },
        ],
        online_session_participants: [
          { data: PARTICIPANTS[0], error: null },
          { data: { ...PARTICIPANTS[0], participation_status: status }, error: null },
        ],
      });
      const out = await onlineTeachingService.recordParticipation('ses-1', TEACHER_A, 'stud-1', status);
      expect(out!.status).toBe(status);
      const updates = writeCalls.filter(
        (w) => w.kind === 'update' && w.table === 'online_session_participants',
      );
      expect(updates).toHaveLength(1);
      expect((updates[0].payload as any).participation_status).toBe(status);
      // Locked: participation never writes student_attendance_*.
      expect(writeCalls.some((w) => w.table.startsWith('student_attendance'))).toBe(false);
    },
  );

  it('invalid status throws with nothing written', async () => {
    mockFrom({
      online_sessions: [{ data: { ...SESSION_SCHEDULED, status: 'IN_PROGRESS' }, error: null }],
      online_session_participants: [{ data: PARTICIPANTS[0], error: null }],
    });
    await expect(
      onlineTeachingService.recordParticipation('ses-1', TEACHER_A, 'stud-1', 'teleported'),
    ).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });

  it('unknown student (no participant row) throws', async () => {
    mockFrom({
      online_sessions: [{ data: { ...SESSION_SCHEDULED, status: 'IN_PROGRESS' }, error: null }],
      online_session_participants: [{ data: null, error: null }],
    });
    await expect(
      onlineTeachingService.recordParticipation('ses-1', TEACHER_A, 'stud-9', 'present'),
    ).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });

  it('cannot record on a SCHEDULED (not started) session', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_SCHEDULED, error: null }],
    });
    await expect(
      onlineTeachingService.recordParticipation('ses-1', TEACHER_A, 'stud-1', 'present'),
    ).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });
});

describe('(e) complete session — note required', () => {
  it('empty/blank note throws and writes nothing', async () => {
    mockFrom({
      online_sessions: [{ data: { ...SESSION_SCHEDULED, status: 'IN_PROGRESS' }, error: null }],
    });
    await expect(onlineTeachingService.completeSession('ses-1', TEACHER_A, '')).rejects.toThrow(/note/i);
    await expect(onlineTeachingService.completeSession('ses-1', TEACHER_A, '   ')).rejects.toThrow(/note/i);
    expect(writeCalls).toHaveLength(0);
  });

  it('IN_PROGRESS + note → COMPLETED', async () => {
    mockFrom({
      online_sessions: [
        { data: { ...SESSION_SCHEDULED, status: 'IN_PROGRESS' }, error: null },
        { data: { ...SESSION_SCHEDULED, status: 'COMPLETED' }, error: null },
      ],
    });
    const out = await onlineTeachingService.completeSession('ses-1', TEACHER_A, 'Covered fractions Q1–Q6.');
    expect(out!.session.status).toBe('COMPLETED');
    expect(out!.note).toBe('Covered fractions Q1–Q6.');
    const updates = writeCalls.filter((w) => w.table === 'online_sessions');
    expect(updates).toHaveLength(1);
    expect((updates[0].payload as any).status).toBe('COMPLETED');
  });

  it('completing an unstarted (SCHEDULED) session throws', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION_SCHEDULED, error: null }],
    });
    await expect(
      onlineTeachingService.completeSession('ses-1', TEACHER_A, 'Some note'),
    ).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });
});

describe('(f) unauthorized teacher gets denied/empty', () => {
  it('getOnlineSession returns null for another teacher’s session', async () => {
    mockFrom({
      online_sessions: [{ data: { ...SESSION_SCHEDULED, teacher_id: TEACHER_B }, error: null }],
    });
    const detail = await onlineTeachingService.getOnlineSession('ses-1', TEACHER_A);
    expect(detail).toBeNull();
    expect(supabase.from).toHaveBeenCalledWith('online_sessions');
  });

  it('start/complete/record throw for a non-assigned teacher; nothing written', async () => {
    mockFrom({
      online_sessions: [{ data: { ...SESSION_SCHEDULED, teacher_id: TEACHER_A }, error: null }],
    });
    await expect(onlineTeachingService.startSession('ses-1', TEACHER_B)).rejects.toThrow();
    await expect(onlineTeachingService.completeSession('ses-1', TEACHER_B, 'note')).rejects.toThrow();
    await expect(
      onlineTeachingService.recordParticipation('ses-1', TEACHER_B, 'stud-1', 'present'),
    ).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });
});

describe('(g) mock-env honest empties', () => {
  it('no DB calls; day → [], cockpit → null, writes → null', async () => {
    forceMockEnv();
    await expect(onlineTeachingService.getOnlineDay(TEACHER_A, '2026-09-08')).resolves.toEqual([]);
    await expect(onlineTeachingService.getOnlineSession('ses-1', TEACHER_A)).resolves.toBeNull();
    await expect(onlineTeachingService.startSession('ses-1', TEACHER_A)).resolves.toBeNull();
    await expect(
      onlineTeachingService.recordParticipation('ses-1', TEACHER_A, 'stud-1', 'present'),
    ).resolves.toBeNull();
    await expect(onlineTeachingService.completeSession('ses-1', TEACHER_A, 'note')).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('(h) DB error → throws', () => {
  it('session-read failure throws for day, cockpit, and start', async () => {
    mockFrom({ online_sessions: { data: null, error: new Error('DB down') } });
    await expect(onlineTeachingService.getOnlineDay(TEACHER_A, '2026-09-08')).rejects.toThrow();
    await expect(onlineTeachingService.getOnlineSession('ses-1', TEACHER_A)).rejects.toThrow();
    await expect(onlineTeachingService.startSession('ses-1', TEACHER_A)).rejects.toThrow();
  });
});
