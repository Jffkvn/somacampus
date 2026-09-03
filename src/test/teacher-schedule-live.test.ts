import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toDayOfWeek, toHHMM, toLocalYYYYMMDD } from '../modules/teacher/scheduleUtils';
import { teacherService } from '../modules/teacher/teacherService';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

describe('teacher live schedule helpers (Task 3 RED)', () => {
  it('maps ISO dates to Mon1..Sun7 day_of_week', () => {
    // 2026-09-03 is a Thursday -> 4
    expect(toDayOfWeek('2026-09-03')).toBe(4);
    // 2026-09-07 is a Monday -> 1
    expect(toDayOfWeek('2026-09-07')).toBe(1);
    // 2026-09-06 is a Sunday -> 7
    expect(toDayOfWeek('2026-09-06')).toBe(7);
    // 2026-09-05 is a Saturday -> 6
    expect(toDayOfWeek('2026-09-05')).toBe(6);
  });

  it('extracts HH:MM from TIME columns', () => {
    expect(toHHMM('08:00:00')).toBe('08:00');
    expect(toHHMM('13:05:00')).toBe('13:05');
    expect(toHHMM('09:00')).toBe('09:00');
  });

  it('formats local YYYY-MM-DD', () => {
    expect(toLocalYYYYMMDD(new Date(2026, 8, 3))).toBe('2026-09-03');
    expect(toLocalYYYYMMDD(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('teacher mock-branch schedule characterization (Task 3)', () => {
  it('mock branch still serves the Mathematics period owned by David', async () => {
    const vm = await teacherService.getTeacherToday('teacher-sarah-01', '2026-09-03');
    expect(vm.schedule.length).toBeGreaterThanOrEqual(1);
    const mathPeriod = vm.schedule.find((s) => s.subjectName === 'Mathematics');
    expect(mathPeriod).toBeDefined();
    expect(mathPeriod?.teacherName).toBe('Mr. David Musoke');
    // Schedule entries carry no daily-attendance props (those live on classResponsibilities)
    vm.schedule.forEach((entry) => {
      expect(entry).not.toHaveProperty('todayDailyAttendance');
      expect(entry).not.toHaveProperty('attendanceSessionId');
    });
  });
});

describe('teacher live schedule branch (Task 3 follow-up, supabase mocked)', () => {
  const TEACHER_UUID = '99999999-9999-9999-9999-999999999991';
  const SCHOOL_ID = '22222222-2222-2222-2222-222222222222';
  const CLASS_ID = '55555555-5555-5555-5555-555555555551';

  // Minimal thenable query-builder stub: every chain method returns the builder.
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
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.lte = () => builder;
    builder.is = () => builder;
    builder.maybeSingle = () => respond();
    builder.then = (resolve: any, reject: any) => respond().then(resolve, reject);
    return builder;
  };

  const liveRows = () => [
    {
      id: 'tte-live-001',
      timetable_id: 'tt-live-1',
      class_id: CLASS_ID,
      stream_id: null,
      subject_id: 'subj-math',
      teacher_id: TEACHER_UUID,
      room_name: 'Room A',
      day_of_week: 4,
      start_time: '08:00:00',
      end_time: '09:00:00',
      timetables: { is_active: true, school_id: SCHOOL_ID },
      subjects: { id: 'subj-math', name: 'Mathematics' },
      classes: { id: CLASS_ID, name: 'Stage 5' },
      streams: null,
      // people as object form
      teacher: { id: TEACHER_UUID, people: { first_name: 'Sarah', last_name: 'Namukasa' } },
    },
    {
      id: 'tte-live-002',
      timetable_id: 'tt-live-1',
      class_id: CLASS_ID,
      stream_id: null,
      subject_id: 'subj-eng',
      teacher_id: TEACHER_UUID,
      room_name: 'Room B',
      day_of_week: 4,
      start_time: '10:00:00',
      end_time: '11:00:00',
      timetables: { is_active: true, school_id: SCHOOL_ID },
      // subjects/classes/people as array form
      subjects: [{ id: 'subj-eng', name: 'English' }],
      classes: [{ id: CLASS_ID, name: 'Stage 5' }],
      streams: null,
      teacher: [{ id: TEACHER_UUID, people: [{ first_name: 'David', last_name: 'Musoke' }] }],
    },
  ];

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    tableResponses = {
      employees: { data: [], error: null },
      class_teachers: { data: [], error: null },
      timetable_entries: { data: liveRows(), error: null },
      teacher_attendance: { data: null, error: null },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('maps live rows (object + array join forms) with HH:MM and no curriculumPosition', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 7, 30, 0)); // 07:30 local, before both periods
    const today = toLocalYYYYMMDD(new Date());

    const vm = await teacherService.getTeacherToday(TEACHER_UUID, today);

    expect(vm.schedule).toHaveLength(2);
    const [first, second] = vm.schedule;
    expect(first.id).toBe('tte-live-001');
    expect(first.subjectName).toBe('Mathematics');
    expect(first.teacherName).toBe('Sarah Namukasa');
    expect(first.startTime).toBe('08:00');
    expect(first.endTime).toBe('09:00');
    expect(first.schoolId).toBe(SCHOOL_ID);
    expect(second.id).toBe('tte-live-002');
    expect(second.subjectName).toBe('English');
    expect(second.teacherName).toBe('David Musoke');
    expect(second.startTime).toBe('10:00');
    expect(second.endTime).toBe('11:00');
    vm.schedule.forEach((entry) => {
      expect(entry).not.toHaveProperty('curriculumPosition');
      expect(entry).not.toHaveProperty('todayDailyAttendance');
      expect(entry).not.toHaveProperty('attendanceSessionId');
    });
    // At 07:30 today both periods are upcoming -> first upcoming wins
    expect(vm.activeTimetableEntry?.id).toBe('tte-live-001');
  });

  it('selects the upcoming period when viewing today mid-morning', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 9, 30, 0)); // 09:30 local, first period over
    const today = toLocalYYYYMMDD(new Date());

    const vm = await teacherService.getTeacherToday(TEACHER_UUID, today);
    expect(vm.schedule).toHaveLength(2);
    expect(vm.activeTimetableEntry?.id).toBe('tte-live-002');
  });

  it('uses schedule[0] when viewing a past date (not time-aware)', async () => {
    const vm = await teacherService.getTeacherToday(TEACHER_UUID, '2020-01-05');
    expect(vm.schedule).toHaveLength(2);
    expect(vm.activeTimetableEntry?.id).toBe('tte-live-001');
  });

  it('falls back to the 3-entry array on empty rows', async () => {
    tableResponses.timetable_entries = { data: [], error: null };
    const vm = await teacherService.getTeacherToday(TEACHER_UUID, '2020-01-05');
    expect(vm.schedule).toHaveLength(3);
    expect(vm.activeTimetableEntry?.id).toBe('tt-entry-001');
  });

  it('falls back without throwing when the query rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    tableResponses.timetable_entries = new Error('timetable read failed');
    let vm;
    await expect(
      (async () => {
        vm = await teacherService.getTeacherToday(TEACHER_UUID, '2020-01-05');
      })()
    ).resolves.toBeUndefined();
    expect(vm!.schedule).toHaveLength(3);
    expect(vm!.activeTimetableEntry?.id).toBe('tt-entry-001');
    warn.mockRestore();
  });

  it('skips rows with invalid dayOfWeek and guards empty people', async () => {
    tableResponses.timetable_entries = {
      data: [
        { ...liveRows()[0], day_of_week: 9 },
        { ...liveRows()[1], teacher: { id: TEACHER_UUID, people: {} } },
      ],
      error: null,
    };
    const vm = await teacherService.getTeacherToday(TEACHER_UUID, '2020-01-05');
    expect(vm.schedule).toHaveLength(1);
    expect(vm.schedule[0].id).toBe('tte-live-002');
    expect(vm.schedule[0].teacherName).toBe('Teacher');
  });
});
