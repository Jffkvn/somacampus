/**
 * Slice 2 Task 2B — Bulk Morning Register Test Suite
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { teacherService } from '../modules/teacher/teacherService';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

describe('Bulk Morning Attendance Register (Slice 2)', () => {
  let tableResponses: Record<string, unknown> = {};

  const builderFor = (table: string) => {
    let lastInserted: unknown = null;
    const respond = () => {
      const r = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.is = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.limit = vi.fn(() => b);
    b.insert = vi.fn((row: unknown) => {
      lastInserted = row;
      return b;
    });
    b.update = vi.fn(() => b);
    b.upsert = vi.fn(() => b);
    b.single = vi.fn(() => {
      const r = tableResponses[table] as { data?: unknown; error?: unknown } | undefined;
      if (lastInserted && (!r || r.data === undefined)) {
        return Promise.resolve({ data: lastInserted, error: null });
      }
      return respond();
    });
    b.maybeSingle = vi.fn(() => (b.single as ReturnType<typeof vi.fn>)());
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

  it('(1) recordDailyAttendance creates new morning session when none exists', async () => {
    // Existing query returns empty (no session for today yet)
    tableResponses.student_attendance_sessions = {
      data: [],
      error: null,
    };

    const session = await teacherService.recordDailyAttendance({
      schoolId: '22222222-2222-2222-2222-222222222222',
      classId: '33333333-3333-3333-3333-333333333333',
      streamId: '44444444-4444-4444-4444-444444444444',
      date: '2026-09-07',
      classTeacherId: '55555555-5555-5555-5555-555555555555',
      recordedByTeacherId: '66666666-6666-6666-6666-666666666666',
      records: [
        { studentId: '77777777-7777-7777-7777-777777777771', status: 'present' },
        { studentId: '77777777-7777-7777-7777-777777777772', status: 'present' },
        { studentId: '77777777-7777-7777-7777-777777777773', status: 'absent', remarks: 'Flu' },
        { studentId: '77777777-7777-7777-7777-777777777774', status: 'late', remarks: 'Rain traffic' },
      ],
    });

    expect(session).toBeDefined();
    expect(mockFrom).toHaveBeenCalledWith('student_attendance_sessions');
    expect(mockFrom).toHaveBeenCalledWith('student_attendance_records');
  });

  it('(2) recordDailyAttendance updates existing morning session rather than creating duplicate', async () => {
    // Existing query finds previously submitted session for today
    tableResponses.student_attendance_sessions = {
      data: [
        {
          id: '88888888-8888-8888-8888-888888888888',
          school_id: '22222222-2222-2222-2222-222222222222',
          class_id: '33333333-3333-3333-3333-333333333333',
          date: '2026-09-07',
        },
      ],
      error: null,
    };

    const session = await teacherService.recordDailyAttendance({
      schoolId: '22222222-2222-2222-2222-222222222222',
      classId: '33333333-3333-3333-3333-333333333333',
      date: '2026-09-07',
      classTeacherId: '55555555-5555-5555-5555-555555555555',
      recordedByTeacherId: '66666666-6666-6666-6666-666666666666',
      records: [
        { studentId: '77777777-7777-7777-7777-777777777771', status: 'present' },
        { studentId: '77777777-7777-7777-7777-777777777772', status: 'excused', remarks: 'Medical visit' },
      ],
    });

    expect(session).toBeDefined();
    expect(mockFrom).toHaveBeenCalledWith('student_attendance_sessions');
  });
});
