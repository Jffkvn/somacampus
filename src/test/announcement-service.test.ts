import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { announcementService } from '../modules/communication/announcementService';

describe('Announcement Service (Phase 8B)', () => {
  let tableResponses: Record<string, unknown> = {};
  let insertedRows: Record<string, any[]> = {};

  const builderFor = (table: string) => {
    const respond = () => {
      const r: any = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: any = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.maybeSingle = () => respond();
    b.single = () => respond();
    b.insert = (payload: any) => {
      if (!insertedRows[table]) insertedRows[table] = [];
      insertedRows[table].push(payload);
      return b;
    };
    b.then = (res: any, rej: any) => respond().then(res, rej);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    tableResponses = {};
    insertedRows = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('(a) feed returns audience-filtered rows mapped to the view model, newest first', async () => {
    tableResponses.school_announcements = {
      data: [
        {
          id: 'ann-new',
          school_id: 'school-1',
          title: 'Sports Day',
          body: 'Friday at the main field.',
          priority: 'important',
          target_audience: 'parents',
          target_class_id: null,
          requires_acknowledgement: true,
          published_by: 'person-1',
          published_at: '2026-09-10T08:00:00Z',
          expires_at: null,
        },
        {
          id: 'ann-old',
          school_id: 'school-1',
          title: 'Term dates',
          body: 'Term ends Dec 5.',
          priority: 'normal',
          target_audience: 'school',
          target_class_id: null,
          requires_acknowledgement: false,
          published_by: null,
          published_at: '2026-09-01T08:00:00Z',
          expires_at: '2026-09-02T00:00:00Z',
        },
      ],
      error: null,
    };
    tableResponses.announcement_acknowledgements = {
      data: [{ announcement_id: 'ann-new', response: 'yes' }],
      error: null,
    };

    const feed = await announcementService.getAnnouncements('school-1', 'person-9');

    expect(feed).toHaveLength(2);
    expect(feed[0].id).toBe('ann-new');
    expect(feed[0].title).toBe('Sports Day');
    expect(feed[0].audience).toBe('parents');
    expect(feed[0].priority).toBe('important');
    expect(feed[0].requiresAcknowledgement).toBe(true);
    expect(feed[0].acknowledged).toBe(true);
    expect(feed[0].myResponse).toBe('yes');
    // Expired row stays readable but flagged
    expect(feed[1].isExpired).toBe(true);
    expect(feed[1].acknowledged).toBe(false);
    // School-scoped read
    expect(mockFrom).toHaveBeenCalledWith('school_announcements');
  });

  it('(b) staff create inserts school/audience/priority/ack-flag (+ class id when class)', async () => {
    tableResponses.school_announcements = {
      data: {
        id: 'ann-created',
        school_id: 'school-1',
        title: 'Class trip',
        body: 'Bring packed lunch.',
        priority: 'urgent',
        target_audience: 'class',
        target_class_id: 'class-5',
        requires_acknowledgement: true,
        published_by: 'person-1',
        published_at: '2026-09-12T08:00:00Z',
        expires_at: null,
      },
      error: null,
    };

    const created = await announcementService.createAnnouncement({
      schoolId: 'school-1',
      title: 'Class trip',
      body: 'Bring packed lunch.',
      audience: 'class',
      priority: 'urgent',
      requiresAcknowledgement: true,
      targetClassId: 'class-5',
      actorRole: 'principal',
    });

    expect(created.id).toBe('ann-created');
    expect(insertedRows.school_announcements).toBeDefined();
    const payload = insertedRows.school_announcements[0];
    expect(payload.school_id).toBe('school-1');
    expect(payload.target_audience).toBe('class');
    expect(payload.priority).toBe('urgent');
    expect(payload.requires_acknowledgement).toBe(true);
    expect(payload.target_class_id).toBe('class-5');
  });

  it('(b2) non-staff create is rejected client-side before any insert', async () => {
    await expect(
      announcementService.createAnnouncement({
        schoolId: 'school-1',
        title: 'Sneaky',
        body: 'Should not publish.',
        audience: 'school',
        actorRole: 'teacher',
      })
    ).rejects.toThrow();
    expect(insertedRows.school_announcements ?? []).toHaveLength(0);
  });

  it('(c) acknowledge inserts {announcement, self person} and duplicate is graceful', async () => {
    tableResponses.announcement_acknowledgements = { data: null, error: null };
    const first = await announcementService.acknowledge('ann-1', 'person-9', 'yes');
    expect(first.duplicate).toBe(false);
    expect(insertedRows.announcement_acknowledgements).toBeDefined();
    expect(insertedRows.announcement_acknowledgements[0]).toMatchObject({
      announcement_id: 'ann-1',
      person_id: 'person-9',
      response: 'yes',
    });

    // UNIQUE violation → graceful "already acknowledged", not a throw
    tableResponses.announcement_acknowledgements = {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    };
    const second = await announcementService.acknowledge('ann-1', 'person-9', 'yes');
    expect(second.duplicate).toBe(true);
  });

  it('(d) DB error throws (D1 rule — denials are never masked)', async () => {
    tableResponses.school_announcements = {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    };
    await expect(announcementService.getAnnouncements('school-1')).rejects.toThrow();

    tableResponses.announcement_acknowledgements = {
      data: null,
      error: { code: '500', message: 'boom' },
    };
    await expect(announcementService.acknowledge('ann-1', 'person-9')).rejects.toThrow(
      'boom'
    );
  });

  it('(e) mock env returns honest empties and no-ops without touching the DB', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    const feed = await announcementService.getAnnouncements('school-1');
    expect(feed).toEqual([]);
    const ack = await announcementService.acknowledge('ann-1', 'person-9');
    expect(ack.duplicate).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
