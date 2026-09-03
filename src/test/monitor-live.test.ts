import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLiveLessonsMonitor } from '../modules/leadership/leadershipService';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

const SCHOOL_ID = '22222222-2222-2222-2222-222222222222';
const DATE = '2026-09-03'; // Thursday -> dow 4

let tableResponses: Record<string, unknown> = {};

const builderFor = (table: string) => {
  const respond = () => {
    const r: any = tableResponses[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: null, error: null });
  };
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.neq = () => builder;
  builder.gte = () => builder;
  builder.gt = () => builder;
  builder.lt = () => builder;
  builder.lte = () => builder;
  builder.is = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.maybeSingle = () => respond();
  builder.single = () => respond();
  builder.then = (resolve: any, reject: any) => respond().then(resolve, reject);
  return builder;
};

const scheduledRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'tt-1',
  day_of_week: 4,
  start_time: '08:00:00',
  end_time: '09:00:00',
  class_id: 'class-1',
  subject_id: 'subj-1',
  teacher_id: 'emp-1',
  classes: { id: 'class-1', name: 'Stage 5' },
  subjects: { id: 'subj-1', name: 'Mathematics' },
  streams: null,
  teacher: { id: 'emp-1', people: { first_name: 'Sarah', last_name: 'Namukasa' } },
  timetables: { is_active: true, school_id: SCHOOL_ID },
  ...overrides,
});

const lessonRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'les-mon-1',
  school_id: SCHOOL_ID,
  teacher_id: 'emp-1',
  class_id: 'class-1',
  subject_id: 'subj-1',
  timetable_entry_id: 'tt-1',
  attendance_session_id: 'sess-1',
  curriculum_topic: 'Fractions',
  visible_lesson_note: 'Covered fractions conversion.',
  lesson_status: 'completed',
  submitted_at: `${DATE}T08:58:00+03:00`,
  classes: { id: 'class-1', name: 'Stage 5' },
  subjects: { id: 'subj-1', name: 'Mathematics' },
  streams: null,
  timetable_entries: { id: 'tt-1', start_time: '08:00:00', end_time: '09:00:00' },
  teacher: { id: 'emp-1', people: { first_name: 'Sarah', last_name: 'Namukasa' } },
  ...overrides,
});

const baseResponses = () => ({
  student_enrolments: {
    data: [
      { id: 'enr-1', class_id: 'class-1' },
      { id: 'enr-2', class_id: 'class-1' },
    ],
    error: null,
  },
  timetable_entries: {
    data: [
      scheduledRow({}),
      scheduledRow({
        id: 'tt-2',
        start_time: '09:00:00',
        end_time: '10:00:00',
        class_id: 'class-2',
        subject_id: 'subj-2',
        teacher_id: 'emp-2',
        classes: { id: 'class-2', name: 'Stage 6' },
        subjects: { id: 'subj-2', name: 'Science' },
        teacher: { id: 'emp-2', people: { first_name: 'David', last_name: 'Ochieng' } },
      }),
      scheduledRow({
        id: 'tt-3',
        start_time: '10:00:00',
        end_time: '11:00:00',
        class_id: 'class-3',
        subject_id: 'subj-3',
        teacher_id: 'emp-3',
        classes: { id: 'class-3', name: 'Stage 4' },
        subjects: { id: 'subj-3', name: 'English' },
        teacher: { id: 'emp-3', people: { first_name: 'James', last_name: 'Kato' } },
      }),
    ],
    error: null,
  },
  lessons: { data: [lessonRow({})], error: null },
  student_attendance_sessions: {
    data: [
      {
        id: 'sess-1',
        date: DATE,
        timetable_entry_id: 'tt-1',
        contextual_timetable_entry_id: null,
      },
    ],
    error: null,
  },
});

describe('live lessons monitor (Phase 3 Task 1 RED)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    tableResponses = baseResponses();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('merges 3 scheduled entries with 1 submitted lesson into 1 submitted + 2 pending', async () => {
    const result = await getLiveLessonsMonitor(SCHOOL_ID, DATE);

    expect(result.expected).toBe(3);
    expect(result.submitted).toBe(1);
    expect(result.pending).toBe(2);
    expect(result.periods).toHaveLength(3);
    expect(result.periods.filter((p) => p.periodState === 'submitted')).toHaveLength(1);
    expect(result.periods.filter((p) => p.periodState === 'pending')).toHaveLength(2);
    const submittedPeriod = result.periods.find((p) => p.periodState === 'submitted');
    expect(submittedPeriod?.lessonId).toBe('les-mon-1');
    expect(submittedPeriod?.startTime).toBe('08:00');
    expect(submittedPeriod?.endTime).toBe('09:00');
    result.periods.forEach((p) => {
      expect(p).toHaveProperty('visibleLessonNote');
      expect(p).not.toHaveProperty('privateReflection');
    });
  });

  it('flags a submitted lesson with no session link as missing attendance', async () => {
    tableResponses.lessons = { data: [lessonRow({ attendance_session_id: null })], error: null };
    tableResponses.student_attendance_sessions = { data: [], error: null };

    const result = await getLiveLessonsMonitor(SCHOOL_ID, DATE);

    expect(result.missingAttendance).toBe(1);
    const submittedPeriod = result.periods.find((p) => p.periodState === 'submitted');
    expect(submittedPeriod?.hasAttendanceRecorded).toBe(false);
  });

  it('returns empty periods and zeros without throwing when no timetable entries', async () => {
    tableResponses.timetable_entries = { data: [], error: null };
    tableResponses.lessons = { data: [], error: null };
    tableResponses.student_attendance_sessions = { data: [], error: null };
    tableResponses.student_enrolments = { data: [], error: null };

    const result = await getLiveLessonsMonitor(SCHOOL_ID, DATE);

    expect(result.periods).toEqual([]);
    expect(result.expected).toBe(0);
    expect(result.submitted).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.missingAttendance).toBe(0);
    expect(result.extraSubmissions).toBe(0);
  });

  it('collapses duplicate lessons for the same entry into a single period with newest winning', async () => {
    tableResponses.lessons = {
      data: [
        lessonRow({ id: 'les-old', submitted_at: `${DATE}T08:10:00+03:00`, visible_lesson_note: 'Older note.' }),
        lessonRow({ id: 'les-new', submitted_at: `${DATE}T08:58:00+03:00`, visible_lesson_note: 'Newer note.' }),
      ],
      error: null,
    };

    const result = await getLiveLessonsMonitor(SCHOOL_ID, DATE);

    const submitted = result.periods.filter((p) => p.periodState === 'submitted');
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.lessonId).toBe('les-new');
    expect(submitted[0]?.visibleLessonNote).toBe('Newer note.');
    expect(result.periods.filter((p) => p.lessonId === 'les-old')).toHaveLength(0);
  });
});
