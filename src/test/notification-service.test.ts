import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { notificationService } from '../modules/notifications/notificationService';

describe('Notification Service (Phase 8C Task 2)', () => {
  let tableResponses: Record<string, unknown> = {};
  let tableQueues: Record<string, Array<{ data: any; error: any }>> = {};
  let captured: { table: string; op: string; payload: any; filters: Array<[string, any]> }[] = [];

  const nextResponse = (table: string) => {
    const q = tableQueues[table];
    if (q && q.length > 0) return Promise.resolve(q.shift());
    const r: any = tableResponses[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: null, error: null });
  };

  const builderFor = (table: string) => {
    const filters: Array<[string, any]> = [];
    const b: any = {};
    b.select = () => b;
    b.eq = (col: string, val: any) => {
      filters.push([col, val]);
      return b;
    };
    b.in = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.update = (payload: any) => {
      captured.push({ table, op: 'update', payload, filters });
      return b;
    };
    b.upsert = (payload: any) => {
      captured.push({ table, op: 'upsert', payload, filters });
      return b;
    };
    b.insert = (payload: any) => {
      captured.push({ table, op: 'insert', payload, filters });
      return b;
    };
    b.maybeSingle = () => nextResponse(table);
    b.single = () => nextResponse(table);
    b.then = (res: any, rej: any) => nextResponse(table).then(res, rej);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    tableResponses = {};
    tableQueues = {};
    captured = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('(a) feed returns deliveries with event join mapped newest-first', async () => {
    tableResponses.notification_deliveries = {
      data: [
        {
          id: 'del-old',
          event_id: 'evt-old',
          recipient_person_id: 'person-9',
          channel: 'in_app',
          status: 'read',
          sent_at: '2026-09-01T08:00:00Z',
          read_at: '2026-09-01T09:00:00Z',
          created_at: '2026-09-01T08:00:00Z',
          notification_events: {
            id: 'evt-old',
            event_type: 'announcement_published',
            payload: { title: 'Term dates' },
          },
        },
        {
          id: 'del-new',
          event_id: 'evt-new',
          recipient_person_id: 'person-9',
          channel: 'in_app',
          status: 'sent',
          sent_at: '2026-09-10T08:00:00Z',
          read_at: null,
          created_at: '2026-09-10T08:00:00Z',
          notification_events: {
            id: 'evt-new',
            event_type: 'attendance_absent',
            payload: { studentName: 'Amari', status: 'absent' },
          },
        },
      ],
      error: null,
    };

    const feed = await notificationService.getMyNotifications('person-9');

    expect(feed).toHaveLength(2);
    // Newest first even though the rows arrived oldest-first
    expect(feed[0].id).toBe('del-new');
    expect(feed[0].eventType).toBe('attendance_absent');
    expect(feed[0].unread).toBe(true);
    expect(feed[1].id).toBe('del-old');
    expect(feed[1].unread).toBe(false);
    expect(mockFrom).toHaveBeenCalledWith('notification_deliveries');
  });

  it('(b) mark-as-read updates the delivery with read_at + status read', async () => {
    tableResponses.notification_deliveries = { data: null, error: null };

    const res = await notificationService.markAsRead('del-new');

    expect(res.updated).toBe(true);
    const call = captured.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(call).toBeDefined();
    expect(call!.payload.status).toBe('read');
    expect(typeof call!.payload.read_at).toBe('string');
    expect(call!.filters).toContainEqual(['id', 'del-new']);
  });

  it('(c) preferences get/set per category with mandatory locked on', async () => {
    tableResponses.notification_preferences = {
      data: [
        {
          person_id: 'person-9',
          school_id: 'school-1',
          category: 'attendance',
          in_app: true,
          email: true,
          sms: false,
          is_mandatory: true,
        },
        {
          person_id: 'person-9',
          school_id: 'school-1',
          category: 'fees',
          in_app: true,
          email: false,
          sms: false,
          is_mandatory: false,
        },
      ],
      error: null,
    };

    const prefs = await notificationService.getPreferences('person-9', 'school-1');
    expect(prefs).toHaveLength(2);
    expect(prefs.find((p) => p.category === 'attendance')?.isMandatory).toBe(true);

    // Mandatory category: caller tries to disable in_app, server value wins.
    tableQueues.notification_preferences = [
      {
        data: {
          person_id: 'person-9',
          school_id: 'school-1',
          category: 'attendance',
          in_app: true,
          email: true,
          sms: false,
          is_mandatory: true,
        },
        error: null,
      },
      {
        data: {
          person_id: 'person-9',
          school_id: 'school-1',
          category: 'attendance',
          in_app: true,
          email: false,
          sms: false,
          is_mandatory: true,
        },
        error: null,
      },
    ];

    const saved = await notificationService.setPreference('person-9', 'school-1', 'attendance', {
      inApp: false,
      email: false,
    });
    const upsert = captured.find((c) => c.table === 'notification_preferences' && c.op === 'upsert');
    expect(upsert).toBeDefined();
    expect(upsert!.payload.in_app).toBe(true);
    expect(upsert!.payload.email).toBe(false);
    expect(saved.inApp).toBe(true);
  });

  it('(d) DB error throws (denials are never masked)', async () => {
    tableResponses.notification_deliveries = {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    };
    await expect(notificationService.getMyNotifications('person-9')).rejects.toThrow();
    await expect(notificationService.markAsRead('del-1')).rejects.toThrow();

    tableResponses.notification_preferences = {
      data: null,
      error: { code: '500', message: 'boom' },
    };
    await expect(notificationService.getPreferences('person-9', 'school-1')).rejects.toThrow();
  });

  it('(e) mock env returns honest empties without touching the DB', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    expect(await notificationService.getMyNotifications('person-9')).toEqual([]);
    expect(await notificationService.getPreferences('person-9', 'school-1')).toEqual([]);
    const res = await notificationService.markAsRead('del-1');
    expect(res.updated).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
