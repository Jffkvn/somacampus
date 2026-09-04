import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { studentService } from '../modules/students/studentService';

// Thenable query-builder stub: resolves per-table responses regardless of chain.
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
  builder.maybeSingle = () => respond();
  builder.single = () => respond();
  builder.then = (resolve: any, reject: any) => respond().then(resolve, reject);
  return builder;
};

const enrolmentRows = () => [
  {
    student_id: 'student-1',
    students: {
      id: 'student-1',
      admission_number: 'GCC-2024-001',
      person: { first_name: 'John', last_name: 'Okello' },
    },
    classes: { id: 'class-1', name: 'Stage 5' },
    streams: { id: 'stream-1', name: 'Blue' },
  },
  {
    student_id: 'student-2',
    students: {
      id: 'student-2',
      admission_number: 'GCC-2024-002',
      person: { first_name: 'Grace', last_name: 'Achieng' },
    },
    classes: { id: 'class-1', name: 'Stage 5' },
    streams: null,
  },
];

const studentRow = () => ({
  id: 'student-1',
  admission_number: 'GCC-2024-001',
  person: { first_name: 'John', last_name: 'Okello', photo_url: null },
});

const enrolmentRow = () => ({
  student_id: 'student-1',
  school_id: 'school-1',
  classes: { id: 'class-1', name: 'Stage 5' },
  streams: { id: 'stream-1', name: 'Blue' },
});

const recordRows = () => [
  { date: '2026-09-03', status: 'present', remarks: null },
  { date: '2026-09-02', status: 'absent', remarks: 'Sick' },
  { date: '2026-09-01', status: 'late', remarks: null },
  { date: '2026-08-29', status: 'present', remarks: null },
];

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  mockFrom.mockImplementation((table: string) => builderFor(table));
  tableResponses = {};
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('student directory (Phase 2 Task 5)', () => {
  it('returns rows mapped from enrolments+students+people joins', async () => {
    tableResponses.student_enrolments = { data: enrolmentRows(), error: null };
    const rows = await studentService.getStudentDirectory('school-1');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      studentId: 'student-1',
      admissionNumber: 'GCC-2024-001',
      fullName: 'John Okello',
      className: 'Stage 5 Blue',
      streamName: 'Blue',
    });
    expect(rows[1]).toMatchObject({
      studentId: 'student-2',
      admissionNumber: 'GCC-2024-002',
      fullName: 'Grace Achieng',
      className: 'Stage 5',
    });
  });

  it('returns [] (honest empty) when the directory query fails', async () => {
    tableResponses.student_enrolments = { data: null, error: { message: 'denied' } };
    await expect(studentService.getStudentDirectory('school-1')).resolves.toEqual([]);
  });
});

describe('student profile (Phase 2 Task 5)', () => {
  it('aggregates records (present/absent/late counts + %) and returns recent records desc', async () => {
    tableResponses.students = { data: studentRow(), error: null };
    tableResponses.student_enrolments = { data: enrolmentRow(), error: null };
    tableResponses.student_attendance_records = { data: recordRows(), error: null };
    tableResponses.student_fee_accounts = { data: null, error: { message: 'no policy' } };

    const profile = await studentService.getStudentProfile('student-1');
    expect(profile).not.toBeNull();
    expect(profile!.profile.fullName).toBe('John Okello');
    expect(profile!.profile.admissionNumber).toBe('GCC-2024-001');
    expect(profile!.attendance).toMatchObject({
      total: 4,
      present: 2,
      absent: 1,
      late: 1,
    });
    expect(profile!.attendance.percentage).toBe(50);
    expect(profile!.recentRecords).toHaveLength(4);
    expect(profile!.recentRecords[0]).toMatchObject({ date: '2026-09-03', status: 'present' });
    // Teacher financial privacy firewall: fee status is completely excluded from StudentProfile
    expect((profile as any)?.feeClearanceStatus).toBeUndefined();
  });

  it('zero-division guard: real student with no records → valid 0% profile (not null)', async () => {
    tableResponses.students = { data: studentRow(), error: null };
    tableResponses.student_enrolments = { data: enrolmentRow(), error: null };
    tableResponses.student_attendance_records = { data: [], error: null };
    tableResponses.student_fee_accounts = { data: null, error: { message: 'no policy' } };

    const profile = await studentService.getStudentProfile('student-1');
    expect(profile).not.toBeNull();
    expect(profile!.profile.fullName).toBe('John Okello');
    expect(profile!.attendance.total).toBe(0);
    expect(profile!.attendance.percentage).toBe(0);
    expect(profile!.recentRecords).toEqual([]);
  });

  it('records lookup failure still returns a valid (empty-history) profile', async () => {
    tableResponses.students = { data: studentRow(), error: null };
    tableResponses.student_enrolments = { data: enrolmentRow(), error: null };
    tableResponses.student_attendance_records = { data: null, error: { message: 'denied' } };
    tableResponses.student_fee_accounts = { data: null, error: { message: 'no policy' } };

    const profile = await studentService.getStudentProfile('student-1');
    expect(profile).not.toBeNull();
    expect(profile!.attendance.total).toBe(0);
    expect(profile!.recentRecords).toEqual([]);
  });

  it('not-found: unknown student id returns null (never a synthetic profile)', async () => {
    tableResponses.students = { data: null, error: null };
    const profile = await studentService.getStudentProfile('no-such-student');
    expect(profile).toBeNull();
  });

  it('error state: identity lookup failure returns null without throwing', async () => {
    tableResponses.students = { data: null, error: { message: 'denied' } };
    await expect(studentService.getStudentProfile('student-1')).resolves.toBeNull();
  });

  it('renders raw status for unknown values (counts only the four known)', async () => {
    tableResponses.students = { data: studentRow(), error: null };
    tableResponses.student_enrolments = { data: enrolmentRow(), error: null };
    tableResponses.student_attendance_records = {
      data: [
        { id: 'rec-1', date: '2026-09-03', status: 'present', remarks: null },
        { id: 'rec-2', date: '2026-09-02', status: 'sick', remarks: null },
      ],
      error: null,
    };
    tableResponses.student_fee_accounts = { data: null, error: { message: 'no policy' } };

    const profile = await studentService.getStudentProfile('student-1');
    expect(profile).not.toBeNull();
    expect(profile!.attendance).toMatchObject({ total: 2, present: 1, absent: 0, late: 0 });
    expect(profile!.recentRecords[1]).toMatchObject({ id: 'rec-2', status: 'sick' });
  });

  it('limits recent history to 10 records', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      date: `2026-08-${String(30 - i).padStart(2, '0')}`,
      status: 'present',
      remarks: null,
    }));
    tableResponses.students = { data: studentRow(), error: null };
    tableResponses.student_enrolments = { data: enrolmentRow(), error: null };
    tableResponses.student_attendance_records = { data: many, error: null };
    tableResponses.student_fee_accounts = { data: null, error: { message: 'no policy' } };

    const profile = await studentService.getStudentProfile('student-1');
    expect(profile).not.toBeNull();
    expect(profile!.recentRecords).toHaveLength(10);
  });
});
