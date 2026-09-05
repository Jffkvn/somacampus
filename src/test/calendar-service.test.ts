import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { calendarService } from '../modules/calendar/calendarService';

const DAY = 24 * 60 * 60 * 1000;

function iso(offsetDays: number, hour = 9): string {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe('Calendar Service (Phase 8E Task 1)', () => {
  let tableResponses: Record<string, unknown> = {};
  let captured: {
    table: string;
    filters: Array<[string, unknown]>;
    inFilters: Array<[string, unknown[]]>;
  }[] = [];

  const builderFor = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];
    captured.push({ table, filters, inFilters });
    const respond = () => {
      const r: any = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: any = {};
    b.select = () => b;
    b.eq = (col: string, val: unknown) => {
      filters.push([col, val]);
      return b;
    };
    b.in = (col: string, vals: unknown[]) => {
      inFilters.push([col, vals]);
      return b;
    };
    b.gte = () => b;
    b.order = () => b;
    b.then = (res: any, rej: any) => respond().then(res, rej);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    tableResponses = {};
    captured = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function seedCalendars(ids: string[] = ['cal-1']) {
    tableResponses.school_calendars = {
      data: ids.map((id) => ({ id, school_id: 'school-1', name: 'Main' })),
      error: null,
    };
  }

  it('(a) events mapped with audience filter for role (parent sees school+parents+class, not staff-only)', async () => {
    seedCalendars();
    tableResponses.calendar_events = {
      // Deliberately out of chronological order: the service must return asc.
      data: [
        {
          id: 'evt-students',
          school_calendar_id: 'cal-1',
          title: 'Inter-house athletics heats',
          description: 'Pupils report to the field.',
          event_type: 'sports',
          start_datetime: iso(3),
          end_datetime: iso(3, 12),
          all_day: false,
          location: 'Main field',
          target_audience: 'students',
          target_class_id: null,
        },
        {
          id: 'evt-past',
          school_calendar_id: 'cal-1',
          title: 'Old assembly',
          description: null,
          event_type: 'assembly',
          start_datetime: iso(-2),
          end_datetime: iso(-2, 10),
          all_day: false,
          location: null,
          target_audience: 'school',
          target_class_id: null,
        },
        {
          id: 'evt-teachers',
          school_calendar_id: 'cal-1',
          title: 'Staff moderation meeting',
          description: 'Internal marking review.',
          event_type: 'meeting',
          start_datetime: iso(1, 14),
          end_datetime: iso(1, 16),
          all_day: false,
          location: 'Staff room',
          target_audience: 'teachers',
          target_class_id: null,
        },
        {
          id: 'evt-class-p5b',
          school_calendar_id: 'cal-1',
          title: 'P5B museum trip',
          description: 'Bring packed lunch.',
          event_type: 'trip',
          start_datetime: iso(1, 8),
          end_datetime: iso(1, 13),
          all_day: false,
          location: 'National museum',
          target_audience: 'class',
          target_class_id: 'class-p5b',
        },
        {
          id: 'evt-parents',
          school_calendar_id: 'cal-1',
          title: 'Parents clinic',
          description: 'Meet class teachers.',
          event_type: 'meeting',
          start_datetime: iso(2),
          end_datetime: iso(2, 11),
          all_day: false,
          location: 'Main hall',
          target_audience: 'parents',
          target_class_id: null,
        },
        {
          id: 'evt-school',
          school_calendar_id: 'cal-1',
          title: 'Sports Day',
          description: 'Whole-school event.',
          event_type: 'sports',
          start_datetime: iso(4),
          end_datetime: iso(4, 15),
          all_day: true,
          location: 'Main field',
          target_audience: 'school',
          target_class_id: null,
        },
      ],
      error: null,
    };

    const events = await calendarService.getCalendarEvents('school-1', {
      role: 'parent',
      childClassIds: ['class-p5b'],
    });

    const ids = events.map((e) => e.id);
    // Parent sees school + parents + students + own class; past + staff-only excluded.
    expect(ids).toContain('evt-school');
    expect(ids).toContain('evt-parents');
    expect(ids).toContain('evt-students');
    expect(ids).toContain('evt-class-p5b');
    expect(ids).not.toContain('evt-teachers');
    expect(ids).not.toContain('evt-past');
    // Ascending by start datetime even though rows arrived shuffled.
    const starts = events.map((e) => new Date(e.startDatetime).getTime());
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    // View-model mapping spot-check.
    const sportsDay = events.find((e) => e.id === 'evt-school');
    expect(sportsDay?.title).toBe('Sports Day');
    expect(sportsDay?.audience).toBe('school');
    expect(sportsDay?.allDay).toBe(true);
    // School scoping: calendars read filtered to the school; events read
    // restricted to that school's calendars.
    expect(mockFrom).toHaveBeenCalledWith('school_calendars');
    expect(mockFrom).toHaveBeenCalledWith('calendar_events');
    const calCall = captured.find((c) => c.table === 'school_calendars');
    expect(calCall?.filters).toContainEqual(['school_id', 'school-1']);
    const evtCall = captured.find((c) => c.table === 'calendar_events');
    expect(evtCall?.inFilters).toContainEqual(['school_calendar_id', ['cal-1']]);
  });

  it('(b) class-audience scoping (parent of P5B sees P5B class events, not P6)', async () => {
    seedCalendars();
    tableResponses.calendar_events = {
      data: [
        {
          id: 'evt-p5b',
          school_calendar_id: 'cal-1',
          title: 'P5B trip',
          description: null,
          event_type: 'trip',
          start_datetime: iso(1),
          end_datetime: iso(1, 12),
          all_day: false,
          location: null,
          target_audience: 'class',
          target_class_id: 'class-p5b',
        },
        {
          id: 'evt-p6',
          school_calendar_id: 'cal-1',
          title: 'P6 trip',
          description: null,
          event_type: 'trip',
          start_datetime: iso(1),
          end_datetime: iso(1, 12),
          all_day: false,
          location: null,
          target_audience: 'class',
          target_class_id: 'class-p6',
        },
        {
          id: 'evt-untargeted',
          school_calendar_id: 'cal-1',
          title: 'Mystery class event',
          description: null,
          event_type: 'custom',
          start_datetime: iso(2),
          end_datetime: iso(2, 12),
          all_day: false,
          location: null,
          target_audience: 'class',
          target_class_id: null,
        },
      ],
      error: null,
    };

    const parentEvents = await calendarService.getCalendarEvents('school-1', {
      role: 'parent',
      childClassIds: ['class-p5b'],
    });
    const parentIds = parentEvents.map((e) => e.id);
    expect(parentIds).toContain('evt-p5b');
    expect(parentIds).not.toContain('evt-p6');
    // Untargeted class rows fail closed for family roles (no cross-class leak).
    expect(parentIds).not.toContain('evt-untargeted');

    // Staff see every class event (they supervise across classes).
    const staffEvents = await calendarService.getCalendarEvents('school-1', {
      role: 'teacher',
    });
    const staffIds = staffEvents.map((e) => e.id);
    expect(staffIds).toContain('evt-p5b');
    expect(staffIds).toContain('evt-p6');
    expect(staffIds).toContain('evt-untargeted');
  });

  it('(c) DB error throws (denials are never masked)', async () => {
    seedCalendars();
    tableResponses.calendar_events = {
      data: null,
      error: { code: '42501', message: 'permission denied for table calendar_events' },
    };
    await expect(
      calendarService.getCalendarEvents('school-1', { role: 'parent' })
    ).rejects.toThrow('permission denied');

    tableResponses.school_calendars = {
      data: null,
      error: { code: '500', message: 'boom' },
    };
    await expect(
      calendarService.getCalendarEvents('school-1', { role: 'teacher' })
    ).rejects.toThrow('boom');
  });

  it('(d) mock env returns honest empty without touching the DB', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    const events = await calendarService.getCalendarEvents('school-1', {
      role: 'parent',
      childClassIds: ['class-p5b'],
    });
    expect(events).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
