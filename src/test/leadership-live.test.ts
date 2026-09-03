import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { leadershipService } from '../modules/leadership/leadershipService';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

const SCHOOL_ID = '22222222-2222-2222-2222-222222222222';
const DATE = '2026-09-03'; // Thursday -> dow 4, day label Thu

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

const baseResponses = () => ({
  schools: { data: { id: SCHOOL_ID, name: "Grace's Cambridge Centre" }, error: null },
  terms: {
    data: [{ id: 'term-1', name: 'Term 1', academic_years: { school_id: SCHOOL_ID, name: 'Academic Year 2026-2027' } }],
    error: null,
  },
  student_enrolments: {
    data: [
      { id: 'enr-1', class_id: 'class-1' },
      { id: 'enr-2', class_id: 'class-1' },
      { id: 'enr-3', class_id: 'class-2' },
    ],
    error: null,
  },
  employees: { data: [{ id: 'emp-1' }, { id: 'emp-2' }], error: null },
  timetable_entries: {
    data: [
      { id: 'tte-1', day_of_week: 4, timetables: { is_active: true, school_id: SCHOOL_ID } },
      { id: 'tte-2', day_of_week: 4, timetables: { is_active: true, school_id: SCHOOL_ID } },
    ],
    error: null,
  },
  student_attendance_sessions: {
    data: [
      {
        id: 'sess-1',
        date: DATE,
        present_count: 18,
        total_students: 20,
        absent_count: 2,
        timetable_entry_id: 'tte-live-1',
      },
      {
        id: 'sess-2',
        date: DATE,
        present_count: 9,
        total_students: 10,
        absent_count: 0,
        timetable_entry_id: null,
      },
    ],
    error: null,
  },
  teacher_attendance: {
    data: [
      { id: 'ta-1', date: DATE, employee_id: 'emp-1' },
      { id: 'ta-2', date: DATE, employee_id: 'emp-2' },
    ],
    error: null,
  },
  lessons: {
    data: [
      {
        id: 'les-live-1',
        school_id: SCHOOL_ID,
        teacher_id: 'emp-1',
        class_id: 'class-1',
        subject_id: 'subj-1',
        timetable_entry_id: 'tte-live-1',
        curriculum_topic: 'Fractions',
        visible_lesson_note: 'Covered fractions conversion.',
        lesson_status: 'completed',
        submitted_at: `${DATE}T08:58:00+03:00`,
        classes: { id: 'class-1', name: 'Stage 5' },
        subjects: { id: 'subj-1', name: 'Mathematics' },
        timetable_entries: { id: 'tte-live-1', start_time: '08:00:00', end_time: '09:00:00' },
        teacher: { id: 'emp-1', people: { first_name: 'David', last_name: 'Musoke' } },
      },
      {
        id: 'les-live-2',
        school_id: SCHOOL_ID,
        teacher_id: 'emp-2',
        class_id: 'class-2',
        subject_id: 'subj-2',
        timetable_entry_id: 'tte-live-2',
        curriculum_topic: 'Habitats',
        visible_lesson_note: 'Lesson submission pending.',
        lesson_status: 'not_completed',
        submitted_at: `${DATE}T09:00:00+03:00`,
        classes: { id: 'class-2', name: 'Stage 6' },
        subjects: { id: 'subj-2', name: 'Science' },
        timetable_entries: { id: 'tte-live-2', start_time: '09:00:00', end_time: '10:00:00' },
        teacher: { id: 'emp-2', people: { first_name: 'Mary', last_name: 'Nabatanzi' } },
      },
    ],
    error: null,
  },
  fee_payment_imports: { data: [], error: null },
});

describe('leadership live dashboard (Phase 2 Task 4 RED)', () => {
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

  it('derives stats and lessons from live queries, not mocks', async () => {
    const vm = await leadershipService.getSchoolLeadershipDashboard(SCHOOL_ID, DATE);

    // Stats derived from mocked rows
    expect(vm.stats.enrolledStudents).toBe(3);
    expect(vm.stats.enrolledStudents).not.toBe(1204);
    expect(vm.stats.activeTeachers).toBe(2);
    expect(vm.stats.lessonsExpected).toBe(2);
    expect(vm.stats.lessonsCompleted).toBe(2);
    // 27 present / 30 total = 90
    expect(vm.stats.attendanceRate).toBe(90);

    // Term scoped to this school
    expect(vm.academicTerm).toBe('Term 1, 2026-2027');

    // Lessons derived from rows
    expect(vm.activeLessons).toHaveLength(2);
    const ids = vm.activeLessons.map((l) => l.lessonId);
    expect(ids).not.toContain('les-001');
    expect(vm.activeLessons.map((l) => l.teacherName)).not.toContain('Sarah Namukasa');
    const withSession = vm.activeLessons.find((l) => l.lessonId === 'les-live-1');
    const withoutSession = vm.activeLessons.find((l) => l.lessonId === 'les-live-2');
    expect(withSession?.hasAttendanceRecorded).toBe(true);
    expect(withoutSession?.hasAttendanceRecorded).toBe(false);
    expect(withSession?.studentCount).toBe(2);
    expect(withoutSession?.studentCount).toBe(1);
    vm.activeLessons.forEach((l) => {
      expect(l).toHaveProperty('visibleLessonNote');
      expect(l).not.toHaveProperty('privateReflection');
    });

    // No dead links
    const routes = vm.alerts.map((a) => a.actionRoute).filter(Boolean) as string[];
    expect(routes).not.toContain('/dashboard/school/teaching');
    expect(routes).not.toContain('/fees/reconciliation');
    routes.forEach((r) => {
      expect(['/dashboard/school', '/teacher/today', '/students', '/fees']).toContain(r);
    });
  });

  it('returns empty activeLessons with honest stats when no lessons today', async () => {
    tableResponses.lessons = { data: [], error: null };
    const vm = await leadershipService.getSchoolLeadershipDashboard(SCHOOL_ID, DATE);

    expect(vm.activeLessons).toHaveLength(0);
    expect(vm.stats.lessonsCompleted).toBe(0);
    expect(vm.stats.enrolledStudents).toBe(3);
    expect(vm.stats.enrolledStudents).not.toBe(1204);
  });

  it('ignores current terms belonging to other schools', async () => {
    tableResponses.terms = {
      data: [{ id: 'term-x', name: 'Term 2', academic_years: { school_id: 'other-school-id', name: 'Academic Year 2026-2027' } }],
      error: null,
    };
    const vm = await leadershipService.getSchoolLeadershipDashboard(SCHOOL_ID, DATE);

    expect(vm.academicTerm).toBe('Term 1, 2026-2027');
    expect(vm.stats.enrolledStudents).toBe(3);
  });
});
