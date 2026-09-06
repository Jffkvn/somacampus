/**
 * Phase 9B Task 2 — online admissions/booking service + conflict checker (RED).
 *
 * Covers:
 * (a) acceptOffer happy path: offer in `sent` status → offer `accepted` +
 *     online_enrolments row created + enquiry → `enrolled` (mocks).
 * (b) acceptOffer on a non-sent offer throws (no writes).
 * (c) checkTeacherConflict: physical lesson 14:00-15:00 + online session
 *     14:30-15:30 → conflict true; online 15:30-16:30 → false;
 *     CANCELLED/COMPLETED/NO_SHOW sessions never block.
 * (d) confirmBooking validates no conflict first: conflicting → throws and
 *     nothing is written (no status update).
 * (e) DB error → throws (D1: never silent).
 * (f) Mock env → honest no-ops (no DB calls).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import {
  acceptOffer,
  checkTeacherConflict,
  confirmBooking,
} from '../modules/online/onlineBookingService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

function forceMockEnv() {
  process.env.NODE_ENV = 'test';
  (import.meta.env as any).VITE_SUPABASE_URL = PLACEHOLDER_URL;
}

/**
 * Chainable supabase query mock: `await query` resolves to the table result
 * via .then; .single()/.maybeSingle() resolve the same result. Tracks write
 * calls (update/insert) so tests can assert "nothing written".
 */
const writeCalls: { kind: string; table: string; payload?: unknown }[] = [];

function mockQuery(table: string, result: { data: any; error: any }) {
  const chain: any = {};
  let lastUpdate: unknown = null;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn((payload: unknown) => {
    writeCalls.push({ kind: 'update', table, payload });
    lastUpdate = payload;
    return chain;
  });
  chain.insert = vi.fn((payload: unknown) => {
    writeCalls.push({ kind: 'insert', table, payload });
    return chain;
  });
  chain.single = vi.fn(() =>
    Promise.resolve(
      lastUpdate && result.data && typeof result.data === 'object' && !Array.isArray(result.data)
        ? { data: { ...result.data, ...lastUpdate }, error: result.error }
        : result,
    ),
  );
  chain.maybeSingle = chain.single;
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function mockFrom(resultByTable: Record<string, { data: any; error: any }>) {
  (supabase.from as any).mockImplementation((table: string) => {
    const result =
      resultByTable[table] ?? resultByTable['*'] ?? { data: [], error: null };
    return mockQuery(table, result);
  });
}

const SENT_OFFER = {
  id: 'offer-1',
  school_id: 's1',
  enquiry_id: 'enq-1',
  offering_id: 'off-1',
  pricing_option_id: 'pr-1',
  status: 'sent',
  valid_until: '2099-01-01',
};

const REQUESTED_BOOKING = {
  id: 'book-1',
  school_id: 's1',
  offering_id: 'off-1',
  student_id: 'stud-1',
  scheduled_date: '2026-09-08', // a Tuesday → day_of_week 2
  start_time: '14:30:00',
  end_time: '15:30:00',
  status: 'requested',
};

beforeEach(() => {
  vi.resetAllMocks();
  writeCalls.length = 0;
  forceProductionEnv();
});

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

describe('acceptOffer', () => {
  it('(a) happy path: sent offer → accepted + enrolment created + enquiry enrolled', async () => {
    mockFrom({
      online_offers: { data: SENT_OFFER, error: null },
      online_enrolments: {
        data: { id: 'enr-1', school_id: 's1', student_id: 'stud-1', offering_id: 'off-1', status: 'active' },
        error: null,
      },
      online_enquiries: { data: { id: 'enq-1', status: 'enrolled' }, error: null },
    });
    const out = await acceptOffer('offer-1', 'stud-1');
    expect(out).not.toBeNull();
    expect(out!.status).toBe('active');
    expect(out!.offeringId).toBe('off-1');
    // All three tables touched: offer update, enrolment insert, enquiry update.
    expect(supabase.from).toHaveBeenCalledWith('online_offers');
    expect(supabase.from).toHaveBeenCalledWith('online_enrolments');
    expect(supabase.from).toHaveBeenCalledWith('online_enquiries');
    expect(writeCalls.filter((w) => w.kind === 'insert' && w.table === 'online_enrolments')).toHaveLength(1);
    expect(writeCalls.filter((w) => w.kind === 'update' && w.table === 'online_offers')).toHaveLength(1);
    expect(writeCalls.filter((w) => w.kind === 'update' && w.table === 'online_enquiries')).toHaveLength(1);
  });

  it('(b) non-sent offer throws and writes nothing', async () => {
    mockFrom({
      online_offers: { data: { ...SENT_OFFER, status: 'draft' }, error: null },
    });
    await expect(acceptOffer('offer-1', 'stud-1')).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });

  it('(b2) expired offer (valid_until past) throws and writes nothing', async () => {
    mockFrom({
      online_offers: { data: { ...SENT_OFFER, valid_until: '2000-01-01' }, error: null },
    });
    await expect(acceptOffer('offer-1', 'stud-1')).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });

  it('(e) offer-read DB error throws', async () => {
    mockFrom({ online_offers: { data: null, error: new Error('DB down') } });
    await expect(acceptOffer('offer-1', 'stud-1')).rejects.toThrow();
  });

  it('(f) mock env no-op: no DB calls', async () => {
    forceMockEnv();
    const out = await acceptOffer('offer-1', 'stud-1');
    expect(out).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('checkTeacherConflict', () => {
  // Tuesday 2026-09-08 → day_of_week 2 (Mon=1..Sun=7).
  const TUE = '2026-09-08';
  const start = new Date(`${TUE}T14:30:00Z`);
  const end = new Date(`${TUE}T15:30:00Z`);

  const physicalLesson = {
    id: 'tt-1',
    teacher_id: 'emp-t1',
    day_of_week: 2,
    start_time: '14:00:00',
    end_time: '15:00:00',
  };

  it('(c1) physical 14:00-15:00 + online 14:30-15:30 → conflict true', async () => {
    mockFrom({
      timetable_entries: { data: [physicalLesson], error: null },
      online_sessions: { data: [], error: null },
    });
    await expect(checkTeacherConflict('emp-t1', start, end)).resolves.toBe(true);
  });

  it('(c2) online 15:30-16:30 vs request 14:30-15:30 (adjacent, half-open) → false', async () => {
    mockFrom({
      timetable_entries: { data: [], error: null },
      online_sessions: {
        data: [
          {
            id: 'ses-1',
            teacher_id: 'emp-t1',
            status: 'SCHEDULED',
            scheduled_start: `${TUE}T15:30:00Z`,
            scheduled_end: `${TUE}T16:30:00Z`,
          },
        ],
        error: null,
      },
    });
    await expect(checkTeacherConflict('emp-t1', start, end)).resolves.toBe(false);
  });

  it('(c3) overlapping online SCHEDULED session → true', async () => {
    mockFrom({
      timetable_entries: { data: [], error: null },
      online_sessions: {
        data: [
          {
            id: 'ses-2',
            teacher_id: 'emp-t1',
            status: 'SCHEDULED',
            scheduled_start: `${TUE}T14:45:00Z`,
            scheduled_end: `${TUE}T15:15:00Z`,
          },
        ],
        error: null,
      },
    });
    await expect(checkTeacherConflict('emp-t1', start, end)).resolves.toBe(true);
  });

  it('(c4) CANCELLED / COMPLETED / NO_SHOW sessions are ignored', async () => {
    mockFrom({
      timetable_entries: { data: [], error: null },
      online_sessions: {
        data: [
          { id: 'ses-c', teacher_id: 'emp-t1', status: 'CANCELLED', scheduled_start: `${TUE}T14:00:00Z`, scheduled_end: `${TUE}T16:00:00Z` },
          { id: 'ses-d', teacher_id: 'emp-t1', status: 'COMPLETED', scheduled_start: `${TUE}T14:00:00Z`, scheduled_end: `${TUE}T16:00:00Z` },
          { id: 'ses-n', teacher_id: 'emp-t1', status: 'NO_SHOW', scheduled_start: `${TUE}T14:00:00Z`, scheduled_end: `${TUE}T16:00:00Z` },
        ],
        error: null,
      },
    });
    await expect(checkTeacherConflict('emp-t1', start, end)).resolves.toBe(false);
  });

  it('(e) timetable DB error throws', async () => {
    mockFrom({ timetable_entries: { data: null, error: new Error('DB down') } });
    await expect(checkTeacherConflict('emp-t1', start, end)).rejects.toThrow();
  });

  it('(f) mock env → false with no DB calls', async () => {
    forceMockEnv();
    await expect(checkTeacherConflict('emp-t1', start, end)).resolves.toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('confirmBooking', () => {
  it('(d) conflicting booking throws and writes nothing', async () => {
    mockFrom({
      online_bookings: { data: REQUESTED_BOOKING, error: null },
      timetable_entries: {
        data: [
          { id: 'tt-1', teacher_id: 'emp-t1', day_of_week: 2, start_time: '14:00:00', end_time: '15:00:00' },
        ],
        error: null,
      },
      online_sessions: { data: [], error: null },
    });
    await expect(confirmBooking('book-1', 'emp-t1')).rejects.toThrow();
    expect(writeCalls.filter((w) => w.table === 'online_bookings')).toHaveLength(0);
  });

  it('conflict-free requested booking → confirmed', async () => {
    mockFrom({
      online_bookings: { data: REQUESTED_BOOKING, error: null },
      timetable_entries: { data: [], error: null },
      online_sessions: { data: [], error: null },
    });
    const out = await confirmBooking('book-1', 'emp-t1');
    expect(out).not.toBeNull();
    expect(out!.status).toBe('confirmed');
    expect(writeCalls.filter((w) => w.kind === 'update' && w.table === 'online_bookings')).toHaveLength(1);
  });

  it('non-requested booking throws and writes nothing', async () => {
    mockFrom({
      online_bookings: { data: { ...REQUESTED_BOOKING, status: 'confirmed' }, error: null },
      timetable_entries: { data: [], error: null },
      online_sessions: { data: [], error: null },
    });
    await expect(confirmBooking('book-1', 'emp-t1')).rejects.toThrow();
    expect(writeCalls).toHaveLength(0);
  });

  it('(e) booking-read DB error throws', async () => {
    mockFrom({ online_bookings: { data: null, error: new Error('DB down') } });
    await expect(confirmBooking('book-1', 'emp-t1')).rejects.toThrow();
  });

  it('(f) mock env no-op: no DB calls', async () => {
    forceMockEnv();
    const out = await confirmBooking('book-1', 'emp-t1');
    expect(out).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
