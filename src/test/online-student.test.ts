/**
 * Phase 9D Task 1 — student online home (RED).
 *
 * Covers:
 * (a) upcoming sessions for the student (participant rows → session
 *     details, ordered ascending, only SCHEDULED/CONFIRMED future).
 * (b) online-only safety: NO class/timetable/attendance fields on the
 *     payload (assert absent keys) and those tables are never queried.
 * (c) assignments due for the student (own student_submissions rows with
 *     pending/missing status, joined to assignments; submitted excluded).
 * (d) feedback visible (teacher notes on COMPLETED sessions + teacher
 *     feedback on submissions).
 * (e) other student's sessions invisible (sessions outside the student's
 *     own participant rows are dropped, never leaked).
 * (f) mock env → honest empties, no DB calls.
 * (g) DB error → throws (never silent).
 *
 * Locked: online-only learners see NO class/timetable/attendance
 * artifacts; join = link display; no video build.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { onlineStudentService } from '../modules/online/onlineStudentService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

const SCHOOL = '33333333-3333-3333-3333-333333333333';
const AMARI = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEACHER = '11111111-1111-1111-1111-111111111111';

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

function forceMockEnv() {
  process.env.NODE_ENV = 'test';
  (import.meta.env as any).VITE_SUPABASE_URL = PLACEHOLDER_URL;
}

type QResult = { data: any; error: any };

const seenTables: string[] = [];

/** Chainable supabase query mock (mirrors online-cockpit.test.ts). */
function mockQuery(_table: string, result: QResult) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = chain.maybeSingle;
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function mockFrom(resultByTable: Record<string, QResult | QResult[]>) {
  const queues = new Map<string, QResult[]>();
  (supabase.from as any).mockImplementation((table: string) => {
    seenTables.push(table);
    const entry = resultByTable[table] ?? resultByTable['*'] ?? { data: [], error: null };
    if (Array.isArray(entry)) {
      if (!queues.has(table)) queues.set(table, [...entry]);
      const q = queues.get(table)!;
      return mockQuery(table, q.length > 0 ? q.shift()! : { data: [], error: null });
    }
    return mockQuery(table, entry);
  });
}

const PARTICIPANT_ROWS = [
  { id: 'part-1', session_id: 'ses-early', student_id: AMARI, participation_status: 'pending' },
  { id: 'part-2', session_id: 'ses-late', student_id: AMARI, participation_status: 'pending' },
  { id: 'part-3', session_id: 'ses-done', student_id: AMARI, participation_status: 'present' },
];

const SESSION_ROWS = [
  {
    id: 'ses-late',
    school_id: SCHOOL,
    offering_id: 'off-1',
    teacher_id: TEACHER,
    status: 'CONFIRMED',
    scheduled_start: '2099-01-02T10:00:00Z',
    scheduled_end: '2099-01-02T11:00:00Z',
    session_type: 'lesson',
    join_url: 'https://meet.example/ses-late',
    curriculum_objective_id: null,
    session_note: null,
    offering: { id: 'off-1', title: 'Cambridge Y5 Maths Online' },
  },
  {
    id: 'ses-early',
    school_id: SCHOOL,
    offering_id: 'off-1',
    teacher_id: TEACHER,
    status: 'SCHEDULED',
    scheduled_start: '2099-01-01T09:00:00Z',
    scheduled_end: '2099-01-01T10:00:00Z',
    session_type: 'lesson',
    join_url: 'https://meet.example/ses-early',
    curriculum_objective_id: null,
    session_note: null,
    offering: { id: 'off-1', title: 'Cambridge Y5 Maths Online' },
  },
  {
    id: 'ses-done',
    school_id: SCHOOL,
    offering_id: 'off-1',
    teacher_id: TEACHER,
    status: 'COMPLETED',
    scheduled_start: '2026-01-01T09:00:00Z',
    scheduled_end: '2026-01-01T10:00:00Z',
    session_type: 'lesson',
    join_url: 'https://meet.example/ses-done',
    curriculum_objective_id: null,
    session_note: 'Fractions recap went well — revisit Q4.',
    offering: { id: 'off-1', title: 'Cambridge Y5 Maths Online' },
  },
  {
    id: 'ses-cancelled',
    school_id: SCHOOL,
    offering_id: 'off-1',
    teacher_id: TEACHER,
    status: 'CANCELLED',
    scheduled_start: '2099-01-03T09:00:00Z',
    scheduled_end: '2099-01-03T10:00:00Z',
    session_type: 'lesson',
    join_url: 'https://meet.example/ses-cancelled',
    curriculum_objective_id: null,
    session_note: null,
    offering: { id: 'off-1', title: 'Cambridge Y5 Maths Online' },
  },
  // Another student's session — Amari holds NO participant row for it.
  {
    id: 'ses-other',
    school_id: SCHOOL,
    offering_id: 'off-1',
    teacher_id: TEACHER,
    status: 'SCHEDULED',
    scheduled_start: '2099-01-01T08:00:00Z',
    scheduled_end: '2099-01-01T09:00:00Z',
    session_type: 'lesson',
    join_url: 'https://meet.example/ses-other',
    curriculum_objective_id: null,
    session_note: null,
    offering: { id: 'off-1', title: 'Cambridge Y5 Maths Online' },
  },
];

const EMPLOYEE_ROWS = [
  { id: TEACHER, people: { first_name: 'Sarah', last_name: 'Namukasa' } },
];

const STUDENT_ROW = {
  id: AMARI,
  admission_number: 'GCC-2024-009',
  person: { first_name: 'Amari', last_name: 'Kato' },
};

const SUBMISSION_ROWS = [
  {
    id: 'sub-1',
    assignment_id: 'asg-1',
    student_id: AMARI,
    submission_status: 'pending',
    teacher_review_status: 'unreviewed',
    teacher_feedback: null,
    score: null,
    assignment: {
      id: 'asg-1',
      title: 'Fractions worksheet 4',
      due_date: '2099-01-10',
      subjects: { name: 'Mathematics' },
    },
  },
  {
    id: 'sub-2',
    assignment_id: 'asg-2',
    student_id: AMARI,
    submission_status: 'submitted',
    teacher_review_status: 'reviewed',
    teacher_feedback: 'Great working on Q2 — check the denominator on Q5.',
    score: 8,
    assignment: {
      id: 'asg-2',
      title: 'Fractions worksheet 3',
      due_date: '2026-01-05',
      subjects: { name: 'Mathematics' },
    },
  },
  // Another student's row — must never leak into this student's home even
  // though it arrives in the same result set (pins the student_id filter).
  {
    id: 'sub-9',
    assignment_id: 'asg-9',
    student_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    submission_status: 'pending',
    teacher_review_status: 'reviewed',
    teacher_feedback: 'Someone else’s feedback — invisible here.',
    score: 10,
    assignment: {
      id: 'asg-9',
      title: 'Someone else’s worksheet',
      due_date: '2099-02-01',
      subjects: { name: 'Mathematics' },
    },
  },
];

function mockHome() {
  mockFrom({
    online_session_participants: { data: PARTICIPANT_ROWS, error: null },
    online_sessions: { data: SESSION_ROWS, error: null },
    employees: { data: EMPLOYEE_ROWS, error: null },
    students: { data: STUDENT_ROW, error: null },
    student_submissions: { data: SUBMISSION_ROWS, error: null },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  seenTables.length = 0;
  forceProductionEnv();
});

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

describe('(a) upcoming sessions for the student', () => {
  it('returns participant sessions ordered ascending, only SCHEDULED/CONFIRMED future', async () => {
    mockHome();
    const home = await onlineStudentService.getOnlineHome(AMARI, SCHOOL);
    expect(home.upcomingSessions.map((s) => s.id)).toEqual(['ses-early', 'ses-late']);
    expect(home.upcomingSessions[0].joinUrl).toBe('https://meet.example/ses-early');
    expect(home.upcomingSessions[0].teacherName).toBe('Sarah Namukasa');
    expect(home.upcomingSessions[0].subject).toBe('Cambridge Y5 Maths Online');
    expect(home.upcomingSessions[0].start).toBe('2099-01-01T09:00:00Z');
  });
});

describe('(b) online-only student gets NO class/timetable/attendance fields', () => {
  it('payload carries no class/timetable/attendance keys and those tables are never read', async () => {
    mockHome();
    const home = await onlineStudentService.getOnlineHome(AMARI, SCHOOL);
    const json = JSON.stringify(home).toLowerCase();
    for (const banned of ['class', 'timetable', 'attendance', 'stream', 'enrolment']) {
      expect(json).not.toContain(banned);
    }
    expect(home).not.toHaveProperty('className');
    expect(home).not.toHaveProperty('timetable');
    expect(home).not.toHaveProperty('attendance');
    for (const t of seenTables) {
      expect(t).not.toMatch(/student_enrolments|classes|streams|timetable|student_attendance/);
    }
  });
});

describe('(c) assignments due for the student', () => {
  it('lists pending work with title/due date; submitted work is not due', async () => {
    mockHome();
    const home = await onlineStudentService.getOnlineHome(AMARI, SCHOOL);
    expect(home.assignmentsDue.map((a) => a.assignmentId)).toEqual(['asg-1']);
    expect(home.assignmentsDue[0].title).toBe('Fractions worksheet 4');
    expect(home.assignmentsDue[0].dueDate).toBe('2099-01-10');
  });

  it('drops another student’s submission rows from due + feedback', async () => {
    mockHome();
    const home = await onlineStudentService.getOnlineHome(AMARI, SCHOOL);
    expect(home.assignmentsDue.map((a) => a.assignmentId)).not.toContain('asg-9');
    expect(home.recentFeedback.map((f) => f.text)).not.toContain(
      'Someone else’s feedback — invisible here.',
    );
  });

  it('unknown login email throws instead of resolving another learner', async () => {
    mockFrom({ people: { data: null, error: null } });
    await expect(
      onlineStudentService.getOnlineHome('ghost@somacampus.ug', SCHOOL),
    ).rejects.toThrow();
  });
});

describe('(d) feedback visible', () => {
  it('surfaces COMPLETED session notes and submission teacher feedback', async () => {
    mockHome();
    const home = await onlineStudentService.getOnlineHome(AMARI, SCHOOL);
    const texts = home.recentFeedback.map((f) => f.text);
    expect(texts).toContain('Fractions recap went well — revisit Q4.');
    expect(texts).toContain('Great working on Q2 — check the denominator on Q5.');
    expect(home.recentFeedback.length).toBeGreaterThanOrEqual(2);
  });
});

describe('(e) other student sessions invisible', () => {
  it('never returns sessions outside the student’s own participant rows', async () => {
    mockFrom({
      online_session_participants: {
        data: [{ id: 'part-9', session_id: 'ses-mine', student_id: OTHER, participation_status: 'pending' }],
        error: null,
      },
      online_sessions: { data: SESSION_ROWS, error: null },
      employees: { data: EMPLOYEE_ROWS, error: null },
      students: { data: { ...STUDENT_ROW, id: OTHER }, error: null },
      student_submissions: { data: [], error: null },
    });
    const home = await onlineStudentService.getOnlineHome(OTHER, SCHOOL);
    const ids = home.upcomingSessions.map((s) => s.id);
    expect(ids).not.toContain('ses-other');
    expect(ids).not.toContain('ses-early');
    expect(ids).not.toContain('ses-late');
    expect(home.upcomingSessions).toEqual([]);
    expect(home.assignmentsDue).toEqual([]);
    expect(home.recentFeedback).toEqual([]);
  });
});

describe('(f) mock-env honest empties', () => {
  it('no DB calls; empty home, never mock data', async () => {
    forceMockEnv();
    const home = await onlineStudentService.getOnlineHome(AMARI, SCHOOL);
    expect(home.upcomingSessions).toEqual([]);
    expect(home.assignmentsDue).toEqual([]);
    expect(home.recentFeedback).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('(g) DB error → throws', () => {
  it('participant-read failure throws', async () => {
    mockFrom({
      online_session_participants: { data: null, error: new Error('DB down') },
    });
    await expect(onlineStudentService.getOnlineHome(AMARI, SCHOOL)).rejects.toThrow();
  });
});
