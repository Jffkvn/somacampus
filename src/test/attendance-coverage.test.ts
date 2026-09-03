import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDailyAttendanceCoverage } from '../modules/teacher/attendanceCoverage';
import { getLiveLessonsMonitor } from '../modules/leadership/leadershipService';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

const SCHOOL_ID = '22222222-2222-2222-2222-222222222222';
const DATE = '2026-09-03'; // Thursday -> dow 4
const CLASS_ID = 'class-1';
const STREAM_ID = 'stream-1';

let tableResponses: Record<string, unknown> = {};
// Tracks filter calls per table for the most recent query builder
let filterCalls: Array<{ table: string; op: string; col: string; val: unknown }> = [];

const builderFor = (table: string) => {
  const respond = () => {
    const r: any = tableResponses[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: null, error: null });
  };
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = (col: string, val: unknown) => {
    filterCalls.push({ table, op: 'eq', col, val });
    return builder;
  };
  builder.neq = () => builder;
  builder.gte = () => builder;
  builder.gt = () => builder;
  builder.lt = () => builder;
  builder.lte = () => builder;
  builder.is = (col: string, val: unknown) => {
    filterCalls.push({ table, op: 'is', col, val });
    return builder;
  };
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.maybeSingle = () => respond();
  builder.single = () => respond();
  builder.then = (resolve: any, reject: any) => respond().then(resolve, reject);
  return builder;
};

const sessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'sess-daily-1',
  class_teacher_id: 'emp-ct-1',
  recorded_by_teacher_id: 'emp-1',
  recorded_at: `${DATE}T07:55:00+03:00`,
  present_count: 18,
  absent_count: 2,
  late_count: 0,
  excused_count: 0,
  total_students: 20,
  ...overrides,
});

describe('daily attendance coverage (class+stream+date)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    filterCalls = [];
    tableResponses = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('(a) returns covered=true with session details when a session row exists (no entry ids)', async () => {
    tableResponses.student_attendance_sessions = {
      data: sessionRow({ id: 'sess-daily-1' }),
      error: null,
    };
    const result = await getDailyAttendanceCoverage(SCHOOL_ID, CLASS_ID, STREAM_ID, DATE);
    expect(result.covered).toBe(true);
    expect(result.session?.id).toBe('sess-daily-1');
    expect(result.session?.present_count ?? result.session?.presentCount).toBeDefined();
  });

  it('(b) returns covered=false when no session', async () => {
    tableResponses.student_attendance_sessions = { data: null, error: null };
    const result = await getDailyAttendanceCoverage(SCHOOL_ID, CLASS_ID, STREAM_ID, DATE);
    expect(result.covered).toBe(false);
    expect(result.session ?? null).toBeNull();
  });

  it('(c) stream NULL uses .is(stream_id, null), non-null uses .eq', async () => {
    tableResponses.student_attendance_sessions = {
      data: sessionRow({ id: 'sess-null-stream' }),
      error: null,
    };
    filterCalls = [];
    await getDailyAttendanceCoverage(SCHOOL_ID, CLASS_ID, null, DATE);
    const isCalls = filterCalls.filter((c) => c.table === 'student_attendance_sessions' && c.col === 'stream_id');
    expect(isCalls).toHaveLength(1);
    expect(isCalls[0].op).toBe('is');
    expect(isCalls[0].val).toBeNull();

    filterCalls = [];
    await getDailyAttendanceCoverage(SCHOOL_ID, CLASS_ID, STREAM_ID, DATE);
    const eqCalls = filterCalls.filter((c) => c.table === 'student_attendance_sessions' && c.col === 'stream_id');
    expect(eqCalls).toHaveLength(1);
    expect(eqCalls[0].op).toBe('eq');
    expect(eqCalls[0].val).toBe(STREAM_ID);
  });

  it('(d) monitor-level: 3 lessons same class/date + 1 daily session (no entry ids, no explicit links) -> all covered', async () => {
    const lessonBase = (id: string, start: string, end: string) => ({
      id,
      school_id: SCHOOL_ID,
      teacher_id: 'emp-1',
      class_id: CLASS_ID,
      stream_id: null,
      subject_id: 'subj-1',
      timetable_entry_id: `tt-${id}`,
      attendance_session_id: null,
      curriculum_topic: 'Fractions',
      visible_lesson_note: 'Note.',
      lesson_status: 'completed',
      submitted_at: `${DATE}T${start}:00+03:00`,
      classes: { id: CLASS_ID, name: 'Stage 5' },
      subjects: { id: 'subj-1', name: 'Mathematics' },
      streams: null,
      timetable_entries: { id: `tt-${id}`, start_time: `${start}:00`, end_time: `${end}:00` },
      teacher: { id: 'emp-1', people: { first_name: 'Sarah', last_name: 'Namukasa' } },
    });
    // Scheduled rows mirror the same class so pending-or-submitted merge stays on CLASS_ID
    const sched = (id: string, start: string, end: string) => ({
      id: `tt-les-${id}`,
      day_of_week: 4,
      start_time: `${start}:00`,
      end_time: `${end}:00`,
      class_id: CLASS_ID,
      stream_id: null,
      subject_id: 'subj-1',
      teacher_id: 'emp-1',
      classes: { id: CLASS_ID, name: 'Stage 5' },
      subjects: { id: 'subj-1', name: 'Mathematics' },
      streams: null,
      teacher: { id: 'emp-1', people: { first_name: 'Sarah', last_name: 'Namukasa' } },
      timetables: { is_active: true, school_id: SCHOOL_ID },
    });
    tableResponses.student_enrolments = { data: [{ id: 'enr-1', class_id: CLASS_ID }], error: null };
    tableResponses.timetable_entries = {
      data: [sched('a', '08:00', '09:00'), sched('b', '09:00', '10:00'), sched('c', '10:00', '11:00')],
      error: null,
    };
    tableResponses.lessons = {
      data: [
        // Link each lesson to its scheduled entry so all 3 become submitted periods
        { ...lessonBase('les-a', '08:00', '09:00'), timetable_entry_id: 'tt-les-a' },
        { ...lessonBase('les-b', '09:00', '10:00'), timetable_entry_id: 'tt-les-b' },
        { ...lessonBase('les-c', '10:00', '11:00'), timetable_entry_id: 'tt-les-c' },
      ],
      error: null,
    };
    tableResponses.student_attendance_sessions = {
      data: [
        {
          id: 'sess-daily-1',
          date: DATE,
          school_id: SCHOOL_ID,
          class_id: CLASS_ID,
          stream_id: null,
          timetable_entry_id: null,
          contextual_timetable_entry_id: null,
        },
      ],
      error: null,
    };

    const result = await getLiveLessonsMonitor(SCHOOL_ID, DATE);
    const submitted = result.periods.filter((p) => p.periodState === 'submitted');
    expect(submitted).toHaveLength(3);
    for (const p of submitted) {
      expect(p.hasAttendanceRecorded).toBe(true);
    }
  });

  it('(e) different class with no session -> false', async () => {
    tableResponses.student_enrolments = { data: [{ id: 'enr-1', class_id: 'class-other' }], error: null };
    tableResponses.timetable_entries = {
      data: [
        {
          id: 'tt-other',
          day_of_week: 4,
          start_time: '08:00:00',
          end_time: '09:00:00',
          class_id: 'class-other',
          stream_id: null,
          subject_id: 'subj-1',
          teacher_id: 'emp-9',
          classes: { id: 'class-other', name: 'Stage 9' },
          subjects: { id: 'subj-1', name: 'Mathematics' },
          streams: null,
          teacher: { id: 'emp-9', people: { first_name: 'Zed', last_name: 'Teacher' } },
          timetables: { is_active: true, school_id: SCHOOL_ID },
        },
      ],
      error: null,
    };
    tableResponses.lessons = {
      data: [
        {
          id: 'les-other',
          school_id: SCHOOL_ID,
          teacher_id: 'emp-9',
          class_id: 'class-other',
          stream_id: null,
          subject_id: 'subj-1',
          timetable_entry_id: 'tt-other',
          attendance_session_id: null,
          curriculum_topic: 'Topic',
          visible_lesson_note: 'Note.',
          lesson_status: 'completed',
          submitted_at: `${DATE}T08:58:00+03:00`,
          classes: { id: 'class-other', name: 'Stage 9' },
          subjects: { id: 'subj-1', name: 'Mathematics' },
          streams: null,
          timetable_entries: { id: 'tt-other', start_time: '08:00:00', end_time: '09:00:00' },
          teacher: { id: 'emp-9', people: { first_name: 'Zed', last_name: 'Teacher' } },
        },
      ],
      error: null,
    };
    tableResponses.student_attendance_sessions = { data: [], error: null };

    const result = await getLiveLessonsMonitor(SCHOOL_ID, DATE);
    const submitted = result.periods.find((p) => p.periodState === 'submitted');
    expect(submitted?.hasAttendanceRecorded).toBe(false);
  });
});
