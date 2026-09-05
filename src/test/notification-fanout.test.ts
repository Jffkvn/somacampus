import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc, auth: { getUser: vi.fn() } },
}));

import { fanOutDeliveries, createEventAndFanOut, fanOutAttendanceRecord } from '../modules/notifications/notificationFanout';
import { announcementService } from '../modules/communication/announcementService';
import { communicationService } from '../modules/communication/communicationService';
import { teacherService } from '../modules/teacher/teacherService';

describe('Notification fan-out (event -> in_app deliveries)', () => {
  let tableResponses: Record<string, unknown> = {};
  let tableQueues: Record<string, Array<{ data: any; error: any }>> = {};
  let captured: { table: string; op: string; payload: any; filters: Array<[string, any]>; inFilters: Array<[string, any[]]> }[] = [];
  let selects: { table: string; filters: Array<[string, any]>; inFilters: Array<[string, any[]]> }[] = [];

  const err = (code: string, message = 'boom'): Error & { code: string } =>
    Object.assign(new Error(message), { code });

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
    const snap = (): { table: string; filters: Array<[string, any]>; inFilters: Array<[string, any[]]> } => ({
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
    b.update = (payload: any) => {
      captured.push({ table, op: 'update', payload, filters: [...filters], inFilters: [...inFilters] });
      return b;
    };
    b.upsert = (payload: any) => {
      captured.push({ table, op: 'upsert', payload, filters: [...filters], inFilters: [...inFilters] });
      return b;
    };
    b.insert = (payload: any) => {
      captured.push({ table, op: 'insert', payload, filters: [...filters], inFilters: [...inFilters] });
      return b;
    };
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
    mockRpc.mockImplementation(() => Promise.resolve({ data: true, error: null }));
    tableResponses = {};
    tableQueues = {};
    captured = [];
    selects = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  const deliveriesFor = () =>
    captured.filter((c) => c.table === 'notification_deliveries' && c.op === 'insert');

  it('(a) absent event fans out one in_app delivery per guardian', async () => {
    tableResponses.student_guardians = {
      data: [
        { guardian_person_id: 'guardian-1', student_id: 'student-1' },
        { guardian_person_id: 'guardian-2', student_id: 'student-1' },
      ],
      error: null,
    };
    tableResponses.notification_preferences = { data: [], error: null };
    tableResponses.notification_deliveries = { data: null, error: null };

    const res = await fanOutDeliveries({
      id: 'evt-absent-1',
      schoolId: 'school-1',
      eventType: 'attendance_absent',
      payload: { studentId: 'student-1' },
    });

    expect(res.inserted).toBe(2);
    expect(res.attempted).toBe(2);
    const inserts = deliveriesFor();
    expect(inserts).toHaveLength(2);
    for (const ins of inserts) {
      expect(ins.payload.channel).toBe('in_app');
      expect(ins.payload.event_id).toBe('evt-absent-1');
    }
    expect(new Set(inserts.map((i) => i.payload.recipient_person_id))).toEqual(
      new Set(['guardian-1', 'guardian-2'])
    );
  });

  it('(a2) attendance write: absent student notifies guardians, present student notifies nobody', async () => {
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
    // Two records: absent (no existing row) + present (no existing row).
    tableQueues.student_attendance_records = [
      { data: null, error: null },
      { data: null, error: null },
    ];
    // Fan-out lookup for the absent record: no trigger-created event visible
    // -> the hook creates the event itself, then fans out.
    tableQueues.notification_events = [
      { data: [], error: null },
      {
        data: {
          id: 'evt-absent-1',
          school_id: 'school-1',
          event_type: 'attendance_absent',
          payload: { studentId: 'student-absent' },
        },
        error: null,
      },
    ];
    tableResponses.student_guardians = {
      data: [{ guardian_person_id: 'guardian-1', student_id: 'student-absent' }],
      error: null,
    };
    tableResponses.notification_preferences = { data: [], error: null };
    tableResponses.notification_deliveries = { data: null, error: null };

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
    const inserts = deliveriesFor();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload.recipient_person_id).toBe('guardian-1');
    // The present student's guardians are never even resolved.
    const guardianLookups = selects.filter((s) => s.table === 'student_guardians');
    expect(guardianLookups).toHaveLength(1);
    expect(guardianLookups[0].inFilters).toContainEqual(['student_id', ['student-absent']]);
  });

  it('(a3) all-present attendance writes nothing to the notification engine', async () => {
    tableResponses.student_attendance_sessions = { data: [], error: null };
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

    expect(mockFrom).not.toHaveBeenCalledWith('notification_events');
    expect(mockFrom).not.toHaveBeenCalledWith('notification_deliveries');
  });

  it('(b) announcement publish fans out to audience members (parents -> guardians)', async () => {
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
    tableResponses.notification_events = {
      data: {
        id: 'evt-ann-1',
        school_id: 'school-1',
        event_type: 'announcement_published',
        payload: { announcementId: 'ann-1', audience: 'parents' },
      },
      error: null,
    };
    tableResponses.student_enrolments = {
      data: [{ student_id: 'student-1' }, { student_id: 'student-2' }],
      error: null,
    };
    tableResponses.student_guardians = {
      data: [
        { guardian_person_id: 'guardian-1', student_id: 'student-1' },
        { guardian_person_id: 'guardian-2', student_id: 'student-2' },
      ],
      error: null,
    };
    tableResponses.notification_preferences = { data: [], error: null };
    tableResponses.notification_deliveries = { data: null, error: null };

    const created = await announcementService.createAnnouncement({
      schoolId: 'school-1',
      title: 'Sports Day',
      body: 'Friday at the main field.',
      audience: 'parents',
      actorRole: 'principal',
    });

    expect(created.id).toBe('ann-1');
    const eventInsert = captured.find(
      (c) => c.table === 'notification_events' && c.op === 'insert'
    );
    expect(eventInsert).toBeDefined();
    expect(eventInsert!.payload.event_type).toBe('announcement_published');
    const inserts = deliveriesFor();
    expect(inserts).toHaveLength(2);
    expect(new Set(inserts.map((i) => i.payload.recipient_person_id))).toEqual(
      new Set(['guardian-1', 'guardian-2'])
    );
  });

  it('(b2) school-wide announcement fans out to guardians + staff', async () => {
    tableResponses.student_enrolments = {
      data: [{ student_id: 'student-1' }],
      error: null,
    };
    tableResponses.student_guardians = {
      data: [{ guardian_person_id: 'guardian-1', student_id: 'student-1' }],
      error: null,
    };
    tableResponses.employees = {
      data: [{ id: 'emp-1', person_id: 'staff-1' }],
      error: null,
    };
    tableResponses.notification_preferences = { data: [], error: null };
    tableResponses.notification_deliveries = { data: null, error: null };

    const res = await fanOutDeliveries({
      id: 'evt-ann-school',
      schoolId: 'school-1',
      eventType: 'announcement_published',
      payload: { audience: 'school', announcementId: 'ann-9' },
    });

    expect(res.inserted).toBe(2);
    expect(new Set(deliveriesFor().map((i) => i.payload.recipient_person_id))).toEqual(
      new Set(['guardian-1', 'staff-1'])
    );
  });

  it('(c) new message fans out to other participants only', async () => {
    tableQueues.communication_participants = [
      { data: [{ thread_id: 'thread-1', person_id: 'teacher-1' }], error: null },
      {
        data: [
          { thread_id: 'thread-1', person_id: 'teacher-1' },
          { thread_id: 'thread-1', person_id: 'parent-1' },
        ],
        error: null,
      },
    ];
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
    tableResponses.notification_events = {
      data: {
        id: 'evt-msg-1',
        school_id: 'school-1',
        event_type: 'message_received',
        payload: { threadId: 'thread-1', senderId: 'teacher-1' },
      },
      error: null,
    };
    tableResponses.notification_preferences = { data: [], error: null };
    tableResponses.notification_deliveries = { data: null, error: null };
    tableResponses.communication_threads = {
      data: { id: 'thread-1', school_id: 'school-1' },
      error: null,
    };

    const sent = await communicationService.sendMessage('thread-1', 'teacher-1', 'See you Friday.');
    expect(sent.id).toBe('msg-2');
    const inserts = deliveriesFor();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload.recipient_person_id).toBe('parent-1');
    expect(inserts[0].payload.channel).toBe('in_app');
  });

  it('(d) duplicate run resolves to a single delivery (UNIQUE event+recipient+channel)', async () => {
    tableResponses.student_guardians = {
      data: [{ guardian_person_id: 'guardian-1', student_id: 'student-1' }],
      error: null,
    };
    tableResponses.notification_preferences = { data: [], error: null };
    // Every delivery insert hits the UNIQUE constraint -> idempotent replay.
    tableResponses.notification_deliveries = err('23505', 'duplicate key value violates unique constraint');

    const event = {
      id: 'evt-dup-1',
      schoolId: 'school-1',
      eventType: 'attendance_absent',
      payload: { studentId: 'student-1' },
    };
    const first = await fanOutDeliveries(event);
    const second = await fanOutDeliveries(event);

    expect(first.inserted).toBe(0);
    expect(first.duplicates).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(1);
    // The replay was attempted (2 delivery writes) but counts as one delivery.
    expect(deliveriesFor()).toHaveLength(2);
  });

  it('(e) fan-out failure never breaks the primary write (message/announcement/attendance)', async () => {
    tableResponses.notification_events = {
      data: { id: 'evt-fail', school_id: 'school-1', event_type: 'x', payload: {} },
      error: null,
    };
    tableResponses.notification_deliveries = err('500', 'delivery store down');

    // Message still sends.
    tableResponses.communication_threads = {
      data: { id: 'thread-1', school_id: 'school-1' },
      error: null,
    };
    tableResponses.communication_participants = {
      data: [
        { thread_id: 'thread-1', person_id: 'teacher-1' },
        { thread_id: 'thread-1', person_id: 'parent-1' },
      ],
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
    tableResponses.notification_preferences = { data: [], error: null };
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
    tableResponses.student_enrolments = { data: [{ student_id: 'student-1' }], error: null };
    tableResponses.student_guardians = {
      data: [{ guardian_person_id: 'guardian-1', student_id: 'student-1' }],
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
    tableQueues.notification_events = [
      { data: [], error: null },
      {
        data: {
          id: 'evt-att-9',
          school_id: 'school-1',
          event_type: 'attendance_absent',
          payload: { studentId: 'student-1' },
        },
        error: null,
      },
    ];
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
  });

  it('(f) mock env is a no-op without touching the DB', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');

    const res = await fanOutDeliveries({
      id: 'evt-mock',
      schoolId: 'school-1',
      eventType: 'attendance_absent',
      payload: { studentId: 'student-1' },
    });
    expect(res).toEqual({ attempted: 0, inserted: 0, duplicates: 0, skippedByPreference: 0, failed: 0 });

    const created = await createEventAndFanOut({
      schoolId: 'school-1',
      eventType: 'message_received',
      payload: { threadId: 'thread-1', senderId: 'teacher-1' },
    });
    expect(created.eventId).toBeNull();

    const att = await fanOutAttendanceRecord({
      schoolId: 'school-1',
      studentId: 'student-1',
      status: 'absent',
    });
    expect(att.inserted).toBe(0);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('(g) in_app opt-out is respected unless the preference row is mandatory', async () => {
    tableResponses.student_guardians = {
      data: [
        { guardian_person_id: 'guardian-optout', student_id: 'student-1' },
        { guardian_person_id: 'guardian-mandatory', student_id: 'student-1' },
        { guardian_person_id: 'guardian-default', student_id: 'student-1' },
      ],
      error: null,
    };
    tableResponses.notification_preferences = {
      data: [
        { person_id: 'guardian-optout', category: 'attendance', in_app: false, is_mandatory: false },
        { person_id: 'guardian-mandatory', category: 'attendance', in_app: false, is_mandatory: true },
      ],
      error: null,
    };
    tableResponses.notification_deliveries = { data: null, error: null };

    const res = await fanOutDeliveries({
      id: 'evt-pref-1',
      schoolId: 'school-1',
      eventType: 'attendance_late',
      payload: { studentId: 'student-1' },
    });

    expect(res.skippedByPreference).toBe(1);
    expect(res.inserted).toBe(2);
    expect(new Set(deliveriesFor().map((i) => i.payload.recipient_person_id))).toEqual(
      new Set(['guardian-mandatory', 'guardian-default'])
    );
  });
});
