import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc, auth: { getUser: vi.fn() } },
}));

import { createEventAndFanOut, fanOutAttendanceRecord } from '../modules/notifications/notificationFanout';
import { announcementService } from '../modules/communication/announcementService';
import { communicationService } from '../modules/communication/communicationService';
import { teacherService } from '../modules/teacher/teacherService';

/**
 * Fan-out via the server-side RPC (migration 20260913000009).
 *
 * The client sends (school, type, source, payload) and NEVER recipient
 * lists — derivation (guardians / audience / participants), preference
 * honoring, and dedupe live in SQL. These tests therefore assert the RPC
 * contract: exact arg shape, no recipient material on the wire, result
 * mapping, spoof rejection that never breaks primaries, and replay
 * idempotency. Recipient-derivation truth lives in the migration; a
 * live-probe note (staging: publish/asbence/message as each role, count
 * bells) covers end-to-end delivery.
 */
describe('Notification fan-out via server RPC (no client inserts)', () => {
  let tableResponses: Record<string, unknown> = {};
  let tableQueues: Record<string, Array<{ data: any; error: any }>> = {};
  let rpcQueue: Array<{ data: any; error: any }> = [];
  let rpcCalls: Array<{ fn: string; args: any }> = [];
  let selects: { table: string; filters: Array<[string, any]>; inFilters: Array<[string, any[]]> }[] = [];

  const rpcOk = (overrides: Record<string, unknown> = {}) => ({
    data: {
      event_id: 'evt-rpc-1',
      attempted: 0,
      inserted: 0,
      duplicates: 0,
      skipped_by_preference: 0,
      failed: 0,
      ...overrides,
    },
    error: null,
  });

  const nextResponse = (table: string) => {
    const q = tableQueues[table];
    if (q && q.length > 0) return Promise.resolve(q.shift());
    const r: any = tableResponses[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: null, error: null });
  };

  const builderFor = (table: string) => {
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    const snap = () => ({
      table,
      filters: [...filters],
      inFilters: inFilters.map(([c, v]) => [c, [...v]] as [string, any[]]),
    });
    const b: any = {};
    b.select = () => b;
    b.eq = (col: string, val: any) => {
      filters.push([col, val]);
      return b;
    };
    b.is = (col: string, val: any) => {
      filters.push([col, val]);
      return b;
    };
    b.in = (col: string, vals: any[]) => {
      inFilters.push([col, vals]);
      return b;
    };
    b.order = () => b;
    b.limit = () => b;
    b.update = () => b;
    b.upsert = () => b;
    b.insert = () => b;
    b.maybeSingle = () => {
      selects.push(snap());
      return nextResponse(table);
    };
    b.single = () => {
      selects.push(snap());
      return nextResponse(table);
    };
    b.then = (res: any, rej: any) => {
      selects.push(snap());
      return nextResponse(table).then(res, rej);
    };
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    mockRpc.mockImplementation((fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      if (rpcQueue.length > 0) return Promise.resolve(rpcQueue.shift());
      return Promise.resolve(rpcOk());
    });
    tableResponses = {};
    tableQueues = {};
    rpcQueue = [];
    rpcCalls = [];
    selects = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  /** Caller sends exactly (school, type, source, payload) — no recipients. */
  const expectRpcContract = (call: { fn: string; args: any }) => {
    expect(call.fn).toBe('create_event_and_fan_out');
    expect(Object.keys(call.args).sort()).toEqual(
      ['p_event_type', 'p_payload', 'p_school_id', 'p_source_entity_id', 'p_source_entity_type'].sort()
    );
    expect(JSON.stringify(call.args)).not.toMatch(/recipient|guardian|participant/i);
  };

  it('(a) absent hook calls the RPC with (school, type, source, payload) and maps server counts', async () => {
    tableResponses.notification_events = { data: [], error: null };
    rpcQueue = [rpcOk({ attempted: 2, inserted: 2 })];

    const res = await fanOutAttendanceRecord({
      schoolId: 'school-1',
      studentId: 'student-1',
      sessionId: 'session-1',
      date: '2026-09-04',
      status: 'absent',
    });

    expect(rpcCalls).toHaveLength(1);
    expectRpcContract(rpcCalls[0]);
    expect(rpcCalls[0].args).toMatchObject({
      p_school_id: 'school-1',
      p_event_type: 'attendance_absent',
      p_source_entity_type: 'student_attendance_record',
      p_source_entity_id: null,
    });
    expect(rpcCalls[0].args.p_payload).toMatchObject({ studentId: 'student-1', sessionId: 'session-1' });
    expect(res).toMatchObject({ attempted: 2, inserted: 2, duplicates: 0 });
    // I2: the trigger-event hint lookup is school-scoped.
    const lookups = selects.filter((s) => s.table === 'notification_events');
    expect(lookups).toHaveLength(1);
    expect(lookups[0].filters).toContainEqual(['school_id', 'school-1']);
    // Single mechanism: no direct delivery/event inserts from the client.
    expect(mockFrom).not.toHaveBeenCalledWith('notification_deliveries');
  });

  it('(a2) attendance write: absent record triggers one RPC, present triggers none', async () => {
    const sessionRow = {
      id: 'session-1',
      school_id: 'school-1',
      class_id: 'class-5',
      stream_id: 'stream-b',
      class_teacher_id: 'emp-ct',
      recorded_by_teacher_id: 'emp-rec',
      date: '2026-09-04',
      total_students: 2,
      present_count: 1,
      absent_count: 1,
      late_count: 0,
      excused_count: 0,
      created_at: '2026-09-04T08:00:00Z',
      updated_at: '2026-09-04T08:00:00Z',
    };
    tableQueues.student_attendance_sessions = [
      { data: [], error: null },
      { data: sessionRow, error: null },
    ];
    tableQueues.student_attendance_records = [
      { data: null, error: null },
      { data: null, error: null },
    ];
    tableResponses.notification_events = { data: [], error: null };
    rpcQueue = [rpcOk({ attempted: 1, inserted: 1 })];

    const session = await teacherService.recordDailyAttendance({
      schoolId: 'school-1',
      classId: 'class-5',
      streamId: 'stream-b',
      date: '2026-09-04',
      classTeacherId: 'emp-ct',
      recordedByTeacherId: 'emp-rec',
      records: [
        { studentId: 'student-absent', status: 'absent' },
        { studentId: 'student-present', status: 'present' },
      ],
    });

    expect(session.id).toBe('session-1');
    expect(rpcCalls).toHaveLength(1);
    expectRpcContract(rpcCalls[0]);
    expect(rpcCalls[0].args.p_payload).toMatchObject({ studentId: 'student-absent' });
  });

  it('(a3) all-present attendance touches neither RPC nor notification tables', async () => {
    tableQueues.student_attendance_sessions = [
      { data: [], error: null },
      {
        data: {
          id: 'session-2',
          school_id: 'school-1',
          class_id: 'class-5',
          stream_id: 'stream-b',
          class_teacher_id: 'emp-ct',
          recorded_by_teacher_id: 'emp-rec',
          date: '2026-09-04',
          total_students: 1,
          present_count: 1,
          absent_count: 0,
          late_count: 0,
          excused_count: 0,
          created_at: '2026-09-04T08:00:00Z',
          updated_at: '2026-09-04T08:00:00Z',
        },
        error: null,
      },
    ];
    tableResponses.student_attendance_records = { data: null, error: null };

    await teacherService.recordDailyAttendance({
      schoolId: 'school-1',
      classId: 'class-5',
      streamId: 'stream-b',
      date: '2026-09-04',
      classTeacherId: 'emp-ct',
      recordedByTeacherId: 'emp-rec',
      records: [{ studentId: 'student-present', status: 'present' }],
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalledWith('notification_events');
    expect(mockFrom).not.toHaveBeenCalledWith('notification_deliveries');
  });

  it('(b) announcement publish fans out via RPC (audience in payload, no client inserts)', async () => {
    tableResponses.school_announcements = {
      data: {
        id: 'ann-1',
        school_id: 'school-1',
        title: 'Sports Day',
        body: 'Friday at the main field.',
        priority: 'normal',
        target_audience: 'parents',
        target_class_id: null,
        requires_acknowledgement: false,
        published_by: 'person-1',
        published_at: '2026-09-12T08:00:00Z',
        expires_at: null,
      },
      error: null,
    };
    rpcQueue = [rpcOk({ attempted: 2, inserted: 2 })];

    const created = await announcementService.createAnnouncement({
      schoolId: 'school-1',
      title: 'Sports Day',
      body: 'Friday at the main field.',
      audience: 'parents',
      actorRole: 'principal',
    });

    expect(created.id).toBe('ann-1');
    expect(rpcCalls).toHaveLength(1);
    expectRpcContract(rpcCalls[0]);
    expect(rpcCalls[0].args).toMatchObject({
      p_school_id: 'school-1',
      p_event_type: 'announcement_published',
      p_source_entity_type: 'school_announcement',
      p_source_entity_id: 'ann-1',
    });
    expect(rpcCalls[0].args.p_payload).toMatchObject({ announcementId: 'ann-1', audience: 'parents' });
    expect(mockFrom).not.toHaveBeenCalledWith('notification_events');
    expect(mockFrom).not.toHaveBeenCalledWith('notification_deliveries');
  });

  it('(b2) school-wide audience is carried in the payload for server derivation', async () => {
    rpcQueue = [rpcOk({ attempted: 2, inserted: 2 })];

    const { eventId, fanout } = await createEventAndFanOut({
      schoolId: 'school-1',
      eventType: 'announcement_published',
      sourceEntityType: 'school_announcement',
      sourceEntityId: 'ann-9',
      payload: { announcementId: 'ann-9', audience: 'school' },
    });

    expect(eventId).toBe('evt-rpc-1');
    expect(fanout.inserted).toBe(2);
    expect(rpcCalls).toHaveLength(1);
    expectRpcContract(rpcCalls[0]);
    expect(rpcCalls[0].args.p_payload).toMatchObject({ audience: 'school' });
  });

  it('(c) new message fans out via RPC (thread identity in payload, not recipients)', async () => {
    tableResponses.communication_participants = {
      data: [{ thread_id: 'thread-1', person_id: 'teacher-1' }],
      error: null,
    };
    tableResponses.communication_messages = {
      data: {
        id: 'msg-2',
        thread_id: 'thread-1',
        sender_id: 'teacher-1',
        body: 'See you Friday.',
        is_ai_drafted: false,
        created_at: '2026-09-12T09:00:00Z',
      },
      error: null,
    };
    tableResponses.communication_threads = {
      data: { id: 'thread-1', school_id: 'school-1' },
      error: null,
    };
    rpcQueue = [rpcOk({ attempted: 1, inserted: 1 })];

    const sent = await communicationService.sendMessage('thread-1', 'teacher-1', 'See you Friday.');

    expect(sent.id).toBe('msg-2');
    expect(rpcCalls).toHaveLength(1);
    expectRpcContract(rpcCalls[0]);
    expect(rpcCalls[0].args).toMatchObject({
      p_event_type: 'message_received',
      p_source_entity_type: 'communication_message',
      p_source_entity_id: 'msg-2',
    });
    expect(rpcCalls[0].args.p_payload).toMatchObject({
      threadId: 'thread-1',
      senderId: 'teacher-1',
      messageId: 'msg-2',
    });
  });

  it('(d) idempotent replay: same RPC args twice, server counts the duplicate, nothing throws', async () => {
    rpcQueue = [
      rpcOk({ attempted: 1, inserted: 1 }),
      rpcOk({ event_id: 'evt-rpc-1', attempted: 1, inserted: 0, duplicates: 1 }),
    ];
    const input = {
      schoolId: 'school-1',
      eventType: 'attendance_absent' as const,
      sourceEntityType: 'student_attendance_record',
      payload: { studentId: 'student-1', sessionId: 'session-1' },
    };

    const first = await createEventAndFanOut(input);
    const second = await createEventAndFanOut(input);

    expect(first.fanout.inserted).toBe(1);
    expect(second.fanout.inserted).toBe(0);
    expect(second.fanout.duplicates).toBe(1);
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[1].args).toEqual(rpcCalls[0].args);
  });

  it('(e) spoof rejection (RPC RAISE) never breaks the primary write', async () => {
    // Caller without a school relationship: the RPC raises P0001.
    mockRpc.mockImplementation((fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({
        data: null,
        error: { code: 'P0001', message: 'notify fan-out: caller has no relationship to school' },
      });
    });

    // Message still sends.
    tableResponses.communication_participants = {
      data: [{ thread_id: 'thread-1', person_id: 'teacher-1' }],
      error: null,
    };
    tableResponses.communication_messages = {
      data: {
        id: 'msg-9',
        thread_id: 'thread-1',
        sender_id: 'teacher-1',
        body: 'Hello.',
        is_ai_drafted: false,
        created_at: '2026-09-12T09:00:00Z',
      },
      error: null,
    };
    tableResponses.communication_threads = {
      data: { id: 'thread-1', school_id: 'school-1' },
      error: null,
    };
    const sent = await communicationService.sendMessage('thread-1', 'teacher-1', 'Hello.');
    expect(sent.id).toBe('msg-9');

    // Announcement still publishes.
    tableResponses.school_announcements = {
      data: {
        id: 'ann-9',
        school_id: 'school-1',
        title: 'Notice',
        body: 'Read me.',
        priority: 'normal',
        target_audience: 'parents',
        target_class_id: null,
        requires_acknowledgement: false,
        published_by: 'person-1',
        published_at: '2026-09-12T08:00:00Z',
        expires_at: null,
      },
      error: null,
    };
    const created = await announcementService.createAnnouncement({
      schoolId: 'school-1',
      title: 'Notice',
      body: 'Read me.',
      audience: 'parents',
      actorRole: 'admin',
    });
    expect(created.id).toBe('ann-9');

    // Attendance still records.
    tableQueues.student_attendance_sessions = [
      { data: [], error: null },
      {
        data: {
          id: 'session-9',
          school_id: 'school-1',
          class_id: 'class-5',
          stream_id: 'stream-b',
          class_teacher_id: 'emp-ct',
          recorded_by_teacher_id: 'emp-rec',
          date: '2026-09-04',
          total_students: 1,
          present_count: 0,
          absent_count: 1,
          late_count: 0,
          excused_count: 0,
          created_at: '2026-09-04T08:00:00Z',
          updated_at: '2026-09-04T08:00:00Z',
        },
        error: null,
      },
    ];
    tableResponses.student_attendance_records = { data: null, error: null };
    tableResponses.notification_events = { data: [], error: null };
    const session = await teacherService.recordDailyAttendance({
      schoolId: 'school-1',
      classId: 'class-5',
      streamId: 'stream-b',
      date: '2026-09-04',
      classTeacherId: 'emp-ct',
      recordedByTeacherId: 'emp-rec',
      records: [{ studentId: 'student-1', status: 'absent' }],
    });
    expect(session.id).toBe('session-9');
    // All three primaries attempted fan-out (and survived its rejection).
    expect(rpcCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('(f) mock env is a no-op without touching the DB', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');

    const created = await createEventAndFanOut({
      schoolId: 'school-1',
      eventType: 'message_received',
      payload: { threadId: 'thread-1', senderId: 'teacher-1' },
    });
    expect(created.eventId).toBeNull();
    expect(created.fanout).toEqual({ attempted: 0, inserted: 0, duplicates: 0, skippedByPreference: 0, failed: 0 });

    const att = await fanOutAttendanceRecord({
      schoolId: 'school-1',
      studentId: 'student-1',
      status: 'absent',
    });
    expect(att.inserted).toBe(0);

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('(g) preference matrix is preserved via server counts (opt-out / mandatory)', async () => {
    // Server honored stored preferences: 1 opt-out skipped, mandatory + default delivered.
    rpcQueue = [rpcOk({ attempted: 3, inserted: 2, skipped_by_preference: 1 })];

    const { fanout } = await createEventAndFanOut({
      schoolId: 'school-1',
      eventType: 'attendance_late',
      sourceEntityType: 'student_attendance_record',
      payload: { studentId: 'student-1' },
    });

    expect(fanout).toMatchObject({ attempted: 3, inserted: 2, skippedByPreference: 1 });
  });
});
