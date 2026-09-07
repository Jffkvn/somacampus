/**
 * Slice 2 Task 2A — Classes & Streams Operations Test Suite
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classesService } from '../modules/classes/classesService';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

describe('Classes & Streams Operations (Slice 2)', () => {
  let tableResponses: Record<string, unknown> = {};

  const builderFor = (table: string) => {
    const respond = () => {
      const r = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.is = vi.fn(() => b);
    b.or = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.insert = vi.fn(() => b);
    b.update = vi.fn(() => b);
    b.single = vi.fn(() => respond());
    b.maybeSingle = vi.fn(() => respond());
    (b as { then: unknown }).then = (res: unknown, rej: unknown) =>
      respond().then(res as never, rej as never);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    mockRpc.mockResolvedValue({ data: null, error: null });
    tableResponses = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('(1) listClassesWithStreams groups streams, calculates enrolment, and maps class teachers', async () => {
    tableResponses.classes = {
      data: [
        {
          id: 'cls-1',
          school_id: 'school-1',
          name: 'Primary 5',
          stage_level: 'Stage 5',
          capacity: 80,
          created_at: '2026-01-01',
        },
      ],
      error: null,
    };

    tableResponses.streams = {
      data: [
        {
          id: 'strm-1',
          class_id: 'cls-1',
          name: 'P.5 Blue',
          default_room: 'Room 5A',
          capacity: 40,
        },
        {
          id: 'strm-2',
          class_id: 'cls-1',
          name: 'P.5 Green',
          default_room: 'Room 5B',
          capacity: 40,
        },
      ],
      error: null,
    };

    tableResponses.class_teachers = {
      data: [
        {
          id: 'ct-1',
          class_id: 'cls-1',
          stream_id: 'strm-1',
          teacher_id: 'emp-1',
          employee: {
            id: 'emp-1',
            employee_number: 'EMP-001',
            role: 'teacher',
            person: { first_name: 'Grace', last_name: 'Nakato' },
          },
        },
      ],
      error: null,
    };

    tableResponses.student_enrolments = {
      data: [
        { id: 'enr-1', class_id: 'cls-1', stream_id: 'strm-1' },
        { id: 'enr-2', class_id: 'cls-1', stream_id: 'strm-1' },
        { id: 'enr-3', class_id: 'cls-1', stream_id: 'strm-2' },
      ],
      error: null,
    };

    const classes = await classesService.listClassesWithStreams('school-1');
    expect(classes).toHaveLength(1);
    const p5 = classes[0];
    expect(p5.name).toBe('Primary 5');
    expect(p5.enrolledCount).toBe(3);
    expect(p5.streams).toHaveLength(2);

    const blue = p5.streams.find((s) => s.name === 'P.5 Blue')!;
    expect(blue.enrolledCount).toBe(2);
    expect(blue.classTeacher?.teacherName).toBe('Grace Nakato');

    const green = p5.streams.find((s) => s.name === 'P.5 Green')!;
    expect(green.enrolledCount).toBe(1);
    expect(green.classTeacher).toBeNull();
  });

  it('(2) getClassDetails returns roster with today attendance statuses', async () => {
    tableResponses.classes = {
      data: {
        id: 'cls-1',
        school_id: 'school-1',
        name: 'Primary 5',
        stage_level: 'Stage 5',
        capacity: 80,
      },
      error: null,
    };

    tableResponses.streams = {
      data: [{ id: 'strm-1', class_id: 'cls-1', name: 'P.5 Blue', default_room: '5A', capacity: 40 }],
      error: null,
    };

    tableResponses.class_teachers = {
      data: null,
      error: null,
    };

    tableResponses.student_enrolments = {
      data: [
        {
          id: 'enr-1',
          student_id: 'stu-1',
          stream_id: 'strm-1',
          start_date: '2026-02-01',
          student: {
            id: 'stu-1',
            admission_number: 'SOM-001',
            person: { first_name: 'Amina', last_name: 'Kato', gender: 'female' },
          },
          stream: { name: 'P.5 Blue' },
        },
        {
          id: 'enr-2',
          student_id: 'stu-2',
          stream_id: 'strm-1',
          start_date: '2026-02-01',
          student: {
            id: 'stu-2',
            admission_number: 'SOM-002',
            person: { first_name: 'Brian', last_name: 'Mukasa', gender: 'male' },
          },
          stream: { name: 'P.5 Blue' },
        },
      ],
      error: null,
    };

    tableResponses.student_attendance_sessions = {
      data: [
        {
          id: 'sess-today',
          class_id: 'cls-1',
          stream_id: 'strm-1',
          student_attendance_records: [
            { student_id: 'stu-1', status: 'present' },
            { student_id: 'stu-2', status: 'absent', remarks: 'Sick' },
          ],
        },
      ],
      error: null,
    };

    const details = await classesService.getClassDetails('cls-1', 'school-1');
    expect(details.name).toBe('Primary 5');
    expect(details.roster).toHaveLength(2);
    expect(details.roster[0].todayAttendanceStatus).toBe('present');
    expect(details.roster[1].todayAttendanceStatus).toBe('absent');
    expect(details.roster[1].attendanceRemarks).toBe('Sick');
    expect(details.attendanceSummary.totalEnrolled).toBe(2);
    expect(details.attendanceSummary.presentCount).toBe(1);
    expect(details.attendanceSummary.absentCount).toBe(1);
    expect(details.attendanceSummary.attendanceRate).toBe(50);
  });

  it('(3) assignClassTeacher calls atomic assign_class_teacher RPC', async () => {
    mockRpc.mockResolvedValue({ data: 'ct-new-id', error: null });

    const res = await classesService.assignClassTeacher(
      'school-1',
      'cls-1',
      'strm-1',
      'emp-1',
      '2026-09-07'
    );

    expect(res).toBe('ct-new-id');
    expect(mockRpc).toHaveBeenCalledWith('assign_class_teacher', {
      p_school_id: 'school-1',
      p_class_id: 'cls-1',
      p_stream_id: 'strm-1',
      p_teacher_id: 'emp-1',
      p_effective_date: '2026-09-07',
    });
  });

  it('(4) transferStudentStream calls atomic transfer_student_enrolment RPC', async () => {
    mockRpc.mockResolvedValue({ data: 'enr-transfer-id', error: null });

    const res = await classesService.transferStudentStream(
      'stu-1',
      'cls-1',
      'strm-2',
      'Balanced stream sizes'
    );

    expect(res).toBe('enr-transfer-id');
    expect(mockRpc).toHaveBeenCalledWith('transfer_student_enrolment', {
      p_student_id: 'stu-1',
      p_target_class_id: 'cls-1',
      p_target_stream_id: 'strm-2',
      p_reason: 'Balanced stream sizes',
    });
  });
});
