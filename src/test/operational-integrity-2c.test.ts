/**
 * Phase 2c: remaining write-path GAP repairs.
 * - Calendar: fail-closed school + class-audience guard.
 * - Threads: compensating rollback on participant/message failure.
 * - Hire: no dead direct-insert fallback (clear throw on missing RPC).
 * - Official subjects: routed through appoint_teacher_subject RPC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

import { calendarService } from '../modules/calendar/calendarService';
import { communicationService } from '../modules/communication/communicationService';
import { staffService } from '../modules/staff/staffService';
import { timetablePolicyService } from '../modules/planning/timetablePolicyService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const SCHOOL = '22222222-2222-2222-2222-222222222222';
const TEACHER = '99999999-9999-9999-9999-999999999992';
const SUBJECT = '77777777-7777-7777-7777-777777777771';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}
function restoreEnv() {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
}

function chain(result: { data: unknown; error: unknown }) {
  const c: any = {};
  c.select = vi.fn().mockReturnValue(c);
  c.insert = vi.fn().mockReturnValue(c);
  c.update = vi.fn().mockReturnValue(c);
  c.delete = vi.fn().mockReturnValue(c);
  c.eq = vi.fn().mockReturnValue(c);
  c.order = vi.fn().mockReturnValue(c);
  c.limit = vi.fn().mockReturnValue(c);
  c.single = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  forceProductionEnv();
});
afterEach(() => {
  restoreEnv();
});

describe('calendar fail-closed guards', () => {
  it('rejects non-UUID school before any DB call', async () => {
    await expect(
      calendarService.createCalendarEvent({
        schoolId: 'x',
        title: 'T',
        eventType: 'meeting',
        startDatetime: '2026-09-10T08:00:00Z',
        endDatetime: '2026-09-10T09:00:00Z',
      })
    ).rejects.toThrow(/no school selected/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects class-audience events without a target class', async () => {
    await expect(
      calendarService.createCalendarEvent({
        schoolId: SCHOOL,
        title: 'T',
        eventType: 'meeting',
        startDatetime: '2026-09-10T08:00:00Z',
        endDatetime: '2026-09-10T09:00:00Z',
        audience: 'class',
        targetClassId: null,
      })
    ).rejects.toThrow(/require a target class/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('thread creation rollback', () => {
  it('archives the thread when participant insert fails, naming the step', async () => {
    const updated: Array<{ table: string; payload: unknown }> = [];
    const updateEq: Array<{ table: string; col: string; val: unknown }> = [];
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockFrom.mockImplementation((table: string) => {
      const c: any = chain(
        table === 'communication_participants'
          ? { data: null, error: { message: 'RLS denied' } }
          : { data: null, error: null }
      );
      const origUpdate = c.update;
      c.update = vi.fn((payload: unknown) => {
        updated.push({ table, payload });
        return c;
      });
      const origEq = c.eq;
      void origUpdate;
      c.eq = vi.fn((col: string, val: unknown) => {
        updateEq.push({ table, col, val });
        return origEq(col, val);
      });
      return c;
    });
    await expect(
      communicationService.createThread({
        schoolId: SCHOOL,
        creatorPersonId: 'person-1',
        participantPersonIds: ['person-2'],
        initialBody: 'hello',
      })
    ).rejects.toThrow(/participants insert failed.*rolled back \(archived\)/);
    expect(updated).toContainEqual({ table: 'communication_threads', payload: { archived: true } });
    expect(updateEq).toContainEqual({
      table: 'communication_threads',
      col: 'id',
      val: expect.any(String),
    });
  });

  it('archives the thread when the initial message insert fails', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'communication_messages') {
        return chain({ data: null, error: { message: 'RLS denied' } });
      }
      return chain({ data: null, error: null });
    });
    await expect(
      communicationService.createThread({
        schoolId: SCHOOL,
        creatorPersonId: 'person-1',
        participantPersonIds: ['person-2'],
        initialBody: 'hello',
      })
    ).rejects.toThrow(/initial message insert failed.*rolled back \(archived\)/);
  });
});

describe('hire has no silent fallback', () => {
  it('missing RPC throws a clear migration error (no direct people insert)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'schema cache' } });
    await expect(
      staffService.hireStaff(
        {
          schoolId: SCHOOL,
          firstName: 'A',
          lastName: 'B',
          role: 'teacher',
          department: 'Academics',
          isTeacher: true,
        } as any,
        'principal'
      )
    ).rejects.toThrow(/hire_staff_member RPC is not available/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('official subjects route through the RPC', () => {
  it('assignOfficialTeachingSubject calls appoint_teacher_subject, not upsert', async () => {
    mockRpc.mockResolvedValue({ data: 'row-1', error: null });
    mockFrom.mockReturnValue(
      chain({
        data: {
          id: 'row-1',
          school_id: SCHOOL,
          teacher_id: TEACHER,
          subject_id: SUBJECT,
          appointed_at: '2026-09-10',
          notes: null,
          subjects: { name: 'Math' },
        },
        error: null,
      })
    );
    const res = await timetablePolicyService.assignOfficialTeachingSubject({
      schoolId: SCHOOL,
      teacherId: TEACHER,
      subjectId: SUBJECT,
    });
    expect(mockRpc).toHaveBeenCalledWith(
      'appoint_teacher_subject',
      expect.objectContaining({ p_school_id: SCHOOL, p_teacher_id: TEACHER, p_subject_id: SUBJECT })
    );
    expect(res.id).toBe('row-1');
  });
});
