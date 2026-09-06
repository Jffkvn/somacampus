/**
 * Phase 9G Task 1 — centre operations dashboard (RED).
 *
 * Director needs: today's sessions (scheduled/completed/cancelled/pending),
 * active learners/teachers, teaching hours, revenue (charges from online
 * enrolments), teacher cost (approved completed sessions × engagement rates,
 * salaried = 0), contribution margin, programme/offering management.
 *
 * Locked: amounts visible ONLY to director/admin/principal/bursar roles
 * (teachers see operational counts, never revenue/cost); no new billing
 * logic (read student_charges + compute aggregates, no migrations).
 *
 * "Approved completed" = status COMPLETED (the 9C completion flow requires
 * a completion note = approval evidence; no approval table exists, and this
 * task adds no migrations — documented in centreOpsService).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { centreOpsService } from '../modules/online/centreOpsService';

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

/** Chainable supabase query mock: `await query` resolves to result via .then */
function mockQuery(result: { data: any; error: any }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function mockFrom(resultByTable: Record<string, { data: any; error: any }>) {
  (supabase.from as any).mockImplementation((table: string) => {
    const result =
      resultByTable[table] ?? resultByTable['*'] ?? { data: [], error: null };
    return mockQuery(result);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  forceProductionEnv();
});

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

const DAY = '2026-09-08';

const sessionRows = [
  {
    id: 'ses-1', school_id: 's1', offering_id: 'off-1', teacher_id: 'emp-t1',
    status: 'COMPLETED', scheduled_start: `${DAY}T09:00:00Z`, scheduled_end: `${DAY}T10:00:00Z`,
  },
  {
    id: 'ses-2', school_id: 's1', offering_id: 'off-2', teacher_id: 'emp-t2',
    status: 'COMPLETED', scheduled_start: `${DAY}T10:00:00Z`, scheduled_end: `${DAY}T12:00:00Z`,
  },
  {
    id: 'ses-3', school_id: 's1', offering_id: 'off-1', teacher_id: 'emp-t1',
    status: 'SCHEDULED', scheduled_start: `${DAY}T13:00:00Z`, scheduled_end: `${DAY}T14:00:00Z`,
  },
  {
    id: 'ses-4', school_id: 's1', offering_id: 'off-1', teacher_id: 'emp-t2',
    status: 'CANCELLED', scheduled_start: `${DAY}T14:00:00Z`, scheduled_end: `${DAY}T15:00:00Z`,
  },
];

const participantRows = [
  { session_id: 'ses-1', student_id: 'stud-1', participation_status: 'present' },
  { session_id: 'ses-1', student_id: 'stud-2', participation_status: 'absent' },
  { session_id: 'ses-2', student_id: 'stud-3', participation_status: 'present' },
  { session_id: 'ses-3', student_id: 'stud-1', participation_status: 'pending' },
];

const enrolmentRows = [
  { id: 'enr-1', school_id: 's1', student_id: 'stud-1', offering_id: 'off-1', status: 'active' },
  { id: 'enr-2', school_id: 's1', student_id: 'stud-2', offering_id: 'off-1', status: 'active' },
  { id: 'enr-3', school_id: 's1', student_id: 'stud-3', offering_id: 'off-2', status: 'active' },
];

const chargeRows = [
  { id: 'ch-1', school_id: 's1', student_id: 'stud-1', amount: 450000, created_at: `${DAY}T10:00:00Z` },
  { id: 'ch-2', school_id: 's1', student_id: 'stud-2', amount: 450000, created_at: `${DAY}T11:00:00Z` },
  { id: 'ch-3', school_id: 's1', student_id: 'stud-3', amount: 300000, created_at: `${DAY}T12:00:00Z` },
  // Not enrolled in any online offering -> excluded from centre revenue.
  { id: 'ch-4', school_id: 's1', student_id: 'stud-9', amount: 999000, created_at: `${DAY}T13:00:00Z` },
  // Outside the day window -> excluded (service filters app-side too).
  { id: 'ch-5', school_id: 's1', student_id: 'stud-1', amount: 777000, created_at: '2026-09-01T10:00:00Z' },
];

const engagementRows = [
  {
    id: 'eng-1', school_id: 's1', employee_id: 'emp-t1', engagement_type: 'sessional',
    status: 'active',
    assignments: [
      {
        id: 'asg-1', offering_id: 'off-1',
        compensation: [{ id: 'comp-1', pay_model: 'per_session', rate: 75000, currency: 'UGX' }],
      },
    ],
  },
  {
    id: 'eng-2', school_id: 's1', employee_id: 'emp-t2', engagement_type: 'full_time',
    status: 'active',
    assignments: [
      {
        id: 'asg-2', offering_id: 'off-2',
        // Salaried-included work: pay_model 'none', rate 0 -> cost 0.
        compensation: [{ id: 'comp-2', pay_model: 'none', rate: 0, currency: 'UGX' }],
      },
    ],
  },
];

const offeringRows = [
  { id: 'off-1', school_id: 's1', programme_id: 'prog-1', title: 'Python Basics', delivery_format: 'small_group', active: true },
  { id: 'off-2', school_id: 's1', programme_id: 'prog-1', title: 'Scratch Junior', delivery_format: 'group', active: true },
];

function mockCentreTables() {
  mockFrom({
    online_sessions: { data: sessionRows, error: null },
    online_session_participants: { data: participantRows, error: null },
    online_enrolments: { data: enrolmentRows, error: null },
    student_charges: { data: chargeRows, error: null },
    online_teacher_engagements: { data: engagementRows, error: null },
    online_offerings: { data: offeringRows, error: null },
    online_programmes: {
      data: [{ id: 'prog-1', school_id: 's1', name: 'Holiday Coding', description: 'Kids code', active: true }],
      error: null,
    },
  });
}

describe('centre day stats aggregate from sessions (counts by status)', () => {
  it('buckets scheduled/completed/cancelled/pending with no drops', async () => {
    mockCentreTables();
    const day = await centreOpsService.getCentreDay('s1', DAY, { role: 'bursar' });
    expect(day.stats.total).toBe(4);
    expect(day.stats.scheduled).toBe(1);
    expect(day.stats.completed).toBe(2);
    expect(day.stats.cancelled).toBe(1);
    expect(day.stats.pending).toBe(0);
    expect(day.stats.activeLearners).toBe(3);
    expect(day.stats.activeTeachers).toBe(2);
    expect(day.sessions).toHaveLength(4);
  });
});

describe('teaching hours sum from completed durations', () => {
  it('sums COMPLETED session durations only (1h + 2h = 3h)', async () => {
    mockCentreTables();
    const day = await centreOpsService.getCentreDay('s1', DAY, { role: 'bursar' });
    expect(day.stats.teachingHours).toBe(3);
  });
});

describe('revenue = sum charges for online enrolments in period', () => {
  it('sums enrolled-student charges inside the window only', async () => {
    mockCentreTables();
    const day = await centreOpsService.getCentreDay('s1', DAY, { role: 'bursar' });
    // 450k + 450k + 300k; stud-9 (not enrolled) and Sep-01 charge excluded.
    expect(day.revenue).toBe(1200000);
  });
});

describe('cost = completed-approved sessions x rates (salaried = 0)', () => {
  it('charges per_session rate once per COMPLETED session; none/model rows cost 0', async () => {
    mockCentreTables();
    const day = await centreOpsService.getCentreDay('s1', DAY, { role: 'bursar' });
    // ses-1 (emp-t1 per_session 75k) + ses-2 (emp-t2 salaried none -> 0).
    // ses-3 SCHEDULED and ses-4 CANCELLED are not costed.
    expect(day.cost).toBe(75000);
  });
});

describe('margin = revenue - cost', () => {
  it('computes contribution margin from aggregates', async () => {
    mockCentreTables();
    const day = await centreOpsService.getCentreDay('s1', DAY, { role: 'principal' });
    expect(day.margin).toBe(1200000 - 75000);
  });
});

describe('programme economics per offering', () => {
  it('attributes revenue/cost/margin per offering with totals', async () => {
    mockCentreTables();
    const econ = await centreOpsService.getProgrammeEconomics(
      's1',
      'prog-1',
      { from: DAY, to: DAY },
      { role: 'bursar' },
    );
    expect(econ.offerings).toHaveLength(2);
    const off1 = econ.offerings.find((o) => o.offeringId === 'off-1')!;
    const off2 = econ.offerings.find((o) => o.offeringId === 'off-2')!;
    expect(off1.revenue).toBe(900000);
    expect(off1.cost).toBe(75000);
    expect(off1.margin).toBe(900000 - 75000);
    expect(off1.sessionsCompleted).toBe(1);
    expect(off2.revenue).toBe(300000);
    expect(off2.cost).toBe(0);
    expect(off2.margin).toBe(300000);
    expect(econ.totals.revenue).toBe(1200000);
    expect(econ.totals.cost).toBe(75000);
    expect(econ.totals.margin).toBe(1200000 - 75000);
  });

  it('teacher role is denied programme economics (money-only surface)', async () => {
    mockCentreTables();
    await expect(
      centreOpsService.getProgrammeEconomics('s1', 'prog-1', { from: DAY, to: DAY }, { role: 'teacher' }),
    ).rejects.toThrow();
  });
});

describe('teacher role sees counts but NO revenue/cost keys', () => {
  it('operational stats + sessions present; money keys absent', async () => {
    mockCentreTables();
    const day = await centreOpsService.getCentreDay('s1', DAY, { role: 'teacher' });
    expect(day.stats.total).toBe(4);
    expect(day.stats.completed).toBe(2);
    expect(day.sessions).toHaveLength(4);
    expect(day).not.toHaveProperty('revenue');
    expect(day).not.toHaveProperty('cost');
    expect(day).not.toHaveProperty('margin');
  });
});

describe('programme/offering management basics (staff-only)', () => {
  it('lists programmes for staff', async () => {
    mockCentreTables();
    const rows = await centreOpsService.listProgrammes('s1', { role: 'bursar' });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Holiday Coding');
  });

  it('creates a programme (staff write)', async () => {
    mockFrom({
      online_programmes: {
        data: { id: 'prog-9', school_id: 's1', name: 'Weekend Robotics', description: null, active: true },
        error: null,
      },
    });
    const row = await centreOpsService.createProgramme('s1', { name: 'Weekend Robotics' }, { role: 'admin' });
    expect(row?.name).toBe('Weekend Robotics');
    expect(supabase.from).toHaveBeenCalledWith('online_programmes');
  });

  it('teacher cannot write programmes (centre managed by director/principal/bursar)', async () => {
    mockCentreTables();
    await expect(
      centreOpsService.createProgramme('s1', { name: 'Weekend Robotics' }, { role: 'teacher' }),
    ).rejects.toThrow();
  });

  it('edits an offering (active flag)', async () => {
    mockFrom({
      online_offerings: {
        data: { id: 'off-1', school_id: 's1', programme_id: 'prog-1', title: 'Python Basics', delivery_format: 'small_group', active: false },
        error: null,
      },
    });
    const row = await centreOpsService.updateOffering('s1', 'off-1', { active: false }, { role: 'principal' });
    expect(row?.active).toBe(false);
  });
});

describe('mock honest', () => {
  it('mock env -> honest empty day (zeros, no mock data)', async () => {
    forceMockEnv();
    const day = await centreOpsService.getCentreDay('s1', DAY, { role: 'bursar' });
    expect(day.stats.total).toBe(0);
    expect(day.stats.teachingHours).toBe(0);
    expect(day.sessions).toEqual([]);
    expect(day.revenue).toBe(0);
    expect(day.cost).toBe(0);
    expect(day.margin).toBe(0);
  });

  it('mock env -> honest empty programmes list', async () => {
    forceMockEnv();
    expect(await centreOpsService.listProgrammes('s1', { role: 'bursar' })).toEqual([]);
  });
});

describe('DB error throws', () => {
  it('session read failure throws (never silent)', async () => {
    mockFrom({
      online_sessions: { data: null, error: new Error('DB down') },
    });
    await expect(centreOpsService.getCentreDay('s1', DAY, { role: 'bursar' })).rejects.toThrow();
  });

  it('charge read failure throws (money: never silent)', async () => {
    mockFrom({
      online_sessions: { data: sessionRows, error: null },
      online_session_participants: { data: participantRows, error: null },
      online_enrolments: { data: enrolmentRows, error: null },
      student_charges: { data: null, error: new Error('DB down') },
    });
    await expect(centreOpsService.getCentreDay('s1', DAY, { role: 'bursar' })).rejects.toThrow();
  });
});
