import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { teacherService } from '../modules/teacher/teacherService';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

describe('teacher class sizes from student_enrolments (RED)', () => {
  const TEACHER_UUID = '99999999-9999-9999-9999-999999999991';
  const CLASS_ID = '55555555-5555-5555-5555-555555555551';
  const STREAM_ID = '66666666-6666-6666-6666-666666666661';
  const OTHER_CLASS = '55555555-5555-5555-5555-555555555552';
  const OTHER_STREAM = '66666666-6666-6666-6666-666666666662';

  let tableResponses: Record<string, unknown> = {};

  // Records every .eq() call so tests can pin the enrolment status vocabulary.
  let eqCalls: Array<{ table: string; args: unknown[] }> = [];
  // Minimal thenable query-builder stub: every chain method returns the builder.
  const builderFor = (table: string) => {
    const respond = () => {
      const r: any = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const builder: any = {};
    builder.select = () => builder;
    builder.eq = (...args: unknown[]) => {
      eqCalls.push({ table, args });
      return builder;
    };
    builder.in = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.lte = () => builder;
    builder.is = () => builder;
    builder.maybeSingle = () => respond();
    builder.then = (resolve: any, reject: any) => respond().then(resolve, reject);
    return builder;
  };

  const ctRow = () => ({
    id: 'ct-1',
    class_id: CLASS_ID,
    stream_id: STREAM_ID,
    teacher_id: TEACHER_UUID,
    effective_from: '2026-01-01',
    effective_to: null,
    classes: { id: CLASS_ID, name: 'Stage 5' },
    streams: { id: STREAM_ID, name: 'Blue' },
    teacher: { id: TEACHER_UUID, people: { first_name: 'Sarah', last_name: 'Namukasa' } },
  });

  const liveTimetableRow = () => ({
    id: 'tte-live-001',
    timetable_id: 'tt-live-1',
    class_id: CLASS_ID,
    stream_id: STREAM_ID,
    subject_id: 'subj-math',
    teacher_id: TEACHER_UUID,
    room_name: 'Room A',
    day_of_week: 4,
    start_time: '08:00:00',
    end_time: '09:00:00',
    timetables: { is_active: true, school_id: '22222222-2222-2222-2222-222222222222' },
    subjects: { id: 'subj-math', name: 'Mathematics' },
    classes: { id: CLASS_ID, name: 'Stage 5' },
    streams: { id: STREAM_ID, name: 'Blue' },
    teacher: { id: TEACHER_UUID, people: { first_name: 'Sarah', last_name: 'Namukasa' } },
  });

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    eqCalls = [];
    tableResponses = {
      employees: { data: [], error: null },
      class_teachers: { data: [ctRow()], error: null },
      student_attendance_sessions: { data: null, error: null },
      student_enrolments: { data: [], error: null },
      timetable_entries: { data: [liveTimetableRow()], error: null },
      teacher_attendance: { data: null, error: null },
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('(a) responsibilities get counts from enrolment rows (class+stream match)', async () => {
    tableResponses.student_enrolments = {
      data: [
        { class_id: CLASS_ID, stream_id: STREAM_ID, status: 'active' },
        { class_id: CLASS_ID, stream_id: STREAM_ID, status: 'active' },
        { class_id: CLASS_ID, stream_id: STREAM_ID, status: 'active' },
        { class_id: CLASS_ID, stream_id: OTHER_STREAM, status: 'active' }, // other stream: not counted
        { class_id: OTHER_CLASS, stream_id: STREAM_ID, status: 'active' }, // other class: not counted
      ],
      error: null,
    };
    const vm = await teacherService.getTeacherToday(TEACHER_UUID, '2026-09-03');
    // CHECK-conformant vocabulary: the query must filter status='active', not 'enrolled'
    expect(eqCalls).toContainEqual({
      table: 'student_enrolments',
      args: ['status', 'active'],
    });
    expect(vm.classResponsibilities).toHaveLength(1);
    expect(vm.classResponsibilities[0].studentCount).toBe(3);
    // Live timetable mapping picks up the derived count via classId/streamId match
    expect(vm.schedule).toHaveLength(1);
    expect(vm.schedule[0].studentCount).toBe(3);
  });

  it('(b) enrolments error falls back without throwing (view still loads)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    tableResponses.student_enrolments = new Error('enrolments read denied');
    let vm: any;
    await expect(
      (async () => {
        vm = await teacherService.getTeacherToday(TEACHER_UUID, '2026-09-03');
      })(),
    ).resolves.toBeUndefined();
    expect(vm.classResponsibilities).toHaveLength(1);
    expect(vm.classResponsibilities[0].studentCount).toBe(24);
    expect(vm.schedule).toHaveLength(1);
    warn.mockRestore();
  });

  it('(c) enrolments error falls back to today session total_students when present', async () => {
    tableResponses.student_enrolments = new Error('enrolments read denied');
    tableResponses.student_attendance_sessions = {
      data: {
        id: 'sess-1',
        class_teacher_id: TEACHER_UUID,
        recorded_by_teacher_id: TEACHER_UUID,
        recorded_at: '2026-09-03T08:00:00.000Z',
        total_students: 8,
        present_count: 7,
        absent_count: 1,
        late_count: 0,
        excused_count: 0,
        recorder: { people: { first_name: 'Sarah', last_name: 'Namukasa' } },
      },
      error: null,
    };
    const vm = await teacherService.getTeacherToday(TEACHER_UUID, '2026-09-03');
    expect(vm.classResponsibilities[0].studentCount).toBe(8);
  });
});
