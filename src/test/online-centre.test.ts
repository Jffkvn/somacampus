/**
 * Phase 9A Task 2 — online centre services + finance hook (RED).
 *
 * Catalogue reads, pricing display scoping by viewer role, enrolment
 * resolution, assignment/participation-scoped session reads, staff-only
 * engagement reads (rates never leak to non-finance), and the finance-hook
 * proof: buildChargeFromPricing is a PURE mapper (no DB) from
 * (pricing option + enrolment) to a valid student_charges payload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import {
  onlineCentreService,
  buildChargeFromPricing,
} from '../modules/online/onlineCentreService';

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
  chain.limit = vi.fn().mockReturnValue(chain);
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

describe('online centre catalogue reads', () => {
  it('getProgrammes returns school-scoped programmes', async () => {
    mockFrom({
      online_programmes: {
        data: [
          { id: 'prog-1', school_id: 's1', name: 'Holiday Coding', description: 'Kids code', active: true },
        ],
        error: null,
      },
    });
    const rows = await onlineCentreService.getProgrammes('s1');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Holiday Coding');
    expect(supabase.from).toHaveBeenCalledWith('online_programmes');
  });

  it('getProgrammes mock env -> honest []', async () => {
    forceMockEnv();
    const rows = await onlineCentreService.getProgrammes('s1');
    expect(rows).toEqual([]);
  });

  it('getOfferings resolves offerings for a programme', async () => {
    mockFrom({
      online_offerings: {
        data: [
          { id: 'off-1', school_id: 's1', programme_id: 'prog-1', title: 'Python Basics', delivery_format: 'small_group', active: true },
        ],
        error: null,
      },
    });
    const rows = await onlineCentreService.getOfferings('s1', 'prog-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Python Basics');
  });

  it('DB error throws (D1: never silent mock)', async () => {
    mockFrom({
      online_programmes: { data: null, error: new Error('DB down') },
    });
    await expect(onlineCentreService.getProgrammes('s1')).rejects.toThrow();
  });
});

describe('pricing display scoping by viewer role', () => {
  const rows = [
    { id: 'pr-public', school_id: 's1', offering_id: 'off-1', billing_model: 'per_term', amount: 450000, currency: 'UGX', display_mode: 'PUBLIC', active: true },
    { id: 'pr-internal', school_id: 's1', offering_id: 'off-1', billing_model: 'per_term', amount: 380000, currency: 'UGX', display_mode: 'INTERNAL', active: true },
    { id: 'pr-enquiry', school_id: 's1', offering_id: 'off-1', billing_model: 'per_term', amount: 500000, currency: 'UGX', display_mode: 'ENQUIRY_ONLY', active: true },
  ];

  it('learner sees PUBLIC-only pricing', async () => {
    mockFrom({ online_pricing_options: { data: rows, error: null } });
    const out = await onlineCentreService.getPricing('s1', 'off-1', 'learner');
    expect(out.map((p) => p.id)).toEqual(['pr-public']);
  });

  it('guardian sees PUBLIC-only pricing', async () => {
    mockFrom({ online_pricing_options: { data: rows, error: null } });
    const out = await onlineCentreService.getPricing('s1', 'off-1', 'guardian');
    expect(out.map((p) => p.id)).toEqual(['pr-public']);
  });

  it('staff (teacher) sees all display modes', async () => {
    mockFrom({ online_pricing_options: { data: rows, error: null } });
    const out = await onlineCentreService.getPricing('s1', 'off-1', 'teacher');
    expect(out).toHaveLength(3);
  });
});

describe('enrolment resolve (student -> offerings)', () => {
  it('getEnrolments returns student enrolments with offering titles', async () => {
    mockFrom({
      online_enrolments: {
        data: [
          {
            id: 'enr-1', school_id: 's1', student_id: 'stud-1', offering_id: 'off-1',
            status: 'active', offering: { id: 'off-1', title: 'Python Basics' },
          },
        ],
        error: null,
      },
    });
    const rows = await onlineCentreService.getEnrolments('s1', 'stud-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].offeringTitle).toBe('Python Basics');
    expect(rows[0].studentId).toBe('stud-1');
  });
});

describe('session reads scoped to assignment/participation', () => {
  it('teacher scope queries by teacher assignment', async () => {
    mockFrom({
      online_sessions: {
        data: [
          { id: 'ses-1', school_id: 's1', teacher_id: 'emp-t1', offering_id: 'off-1', status: 'SCHEDULED' },
        ],
        error: null,
      },
    });
    const rows = await onlineCentreService.getSessions('s1', { teacherId: 'emp-t1' });
    expect(rows).toHaveLength(1);
    expect(rows[0].teacherId).toBe('emp-t1');
  });

  it('student scope resolves via participation rows only', async () => {
    mockFrom({
      online_session_participants: {
        data: [{ session_id: 'ses-9', student_id: 'stud-1', participation_status: 'present' }],
        error: null,
      },
      online_sessions: {
        data: [{ id: 'ses-9', school_id: 's1', teacher_id: 'emp-t2', offering_id: 'off-2', status: 'COMPLETED' }],
        error: null,
      },
    });
    const rows = await onlineCentreService.getSessions('s1', { studentId: 'stud-1' });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('ses-9');
    expect(supabase.from).toHaveBeenCalledWith('online_session_participants');
  });

  it('unscoped session read is rejected, not silently broad', async () => {
    await expect(onlineCentreService.getSessions('s1', {})).rejects.toThrow();
  });
});

describe('engagement reads (rates never leak to non-finance)', () => {
  // Schema shape: engagement -> assignments[] -> compensation[] (nested).
  const engagementRows = [
    {
      id: 'eng-1', school_id: 's1', employee_id: 'emp-t1', engagement_type: 'sessional',
      status: 'active',
      assignments: [
        {
          id: 'asg-1', offering_id: 'off-1',
          compensation: [{ id: 'comp-1', pay_model: 'per_session', rate: 75000, currency: 'UGX' }],
        },
        { id: 'asg-1b', offering_id: 'off-3', compensation: null },
      ],
    },
    {
      id: 'eng-2', school_id: 's1', employee_id: 'emp-t2', engagement_type: 'part_time',
      status: 'active',
      assignments: [
        {
          id: 'asg-2', offering_id: 'off-2',
          compensation: [{ id: 'comp-2', pay_model: 'monthly', rate: 1200000, currency: 'UGX' }],
        },
      ],
    },
  ];

  it('learner gets no engagement rows (no rates leaked)', async () => {
    mockFrom({ online_teacher_engagements: { data: engagementRows, error: null } });
    const rows = await onlineCentreService.getEngagements('s1', { role: 'learner' });
    expect(rows).toEqual([]);
  });

  it('teacher sees own rows with own assignments rates, never peers', async () => {
    mockFrom({ online_teacher_engagements: { data: engagementRows, error: null } });
    const rows = await onlineCentreService.getEngagements('s1', { role: 'teacher', employeeId: 'emp-t1' });
    expect(rows).toHaveLength(1);
    expect(rows[0].employeeId).toBe('emp-t1');
    expect(rows[0].assignments[0].compensation[0].rate).toBe(75000);
  });

  it('bursar (finance role) sees all rows with rates', async () => {
    mockFrom({ online_teacher_engagements: { data: engagementRows, error: null } });
    const rows = await onlineCentreService.getEngagements('s1', { role: 'bursar' });
    expect(rows).toHaveLength(2);
    expect(rows[1].assignments[0].compensation[0].rate).toBe(1200000);
  });

  it('multi-assignment engagement returns both assignments (no silent drops)', async () => {
    mockFrom({ online_teacher_engagements: { data: engagementRows, error: null } });
    const rows = await onlineCentreService.getEngagements('s1', { role: 'bursar' });
    expect(rows[0].assignments).toHaveLength(2);
    expect(rows[0].assignments.map((a) => a.id)).toEqual(['asg-1', 'asg-1b']);
  });

  it('rate-less assignment is returned with empty compensation', async () => {
    mockFrom({ online_teacher_engagements: { data: engagementRows, error: null } });
    const finance = await onlineCentreService.getEngagements('s1', { role: 'bursar' });
    expect(finance[0].assignments[1].compensation).toEqual([]);
    const owner = await onlineCentreService.getEngagements('s1', { role: 'teacher', employeeId: 'emp-t1' });
    expect(owner).toHaveLength(1);
    expect(owner[0].assignments[1].compensation).toEqual([]);
  });

  it('engagement without compensation rows is returned (rates omitted)', async () => {
    mockFrom({
      online_teacher_engagements: {
        data: [
          {
            id: 'eng-3', school_id: 's1', employee_id: 'emp-t3', engagement_type: 'contract',
            status: 'active',
            assignments: [{ id: 'asg-3', offering_id: 'off-3', compensation: null }],
          },
        ],
        error: null,
      },
    });
    const finance = await onlineCentreService.getEngagements('s1', { role: 'bursar' });
    expect(finance).toHaveLength(1);
    expect(finance[0].id).toBe('eng-3');
    expect(finance[0].assignments[0].compensation).toEqual([]);
    const owner = await onlineCentreService.getEngagements('s1', { role: 'teacher', employeeId: 'emp-t3' });
    expect(owner).toHaveLength(1);
    expect(owner[0].assignments[0].compensation).toEqual([]);
  });

  it('engagement DB error throws (compensation data: never silent)', async () => {
    mockFrom({
      online_teacher_engagements: { data: null, error: new Error('DB down') },
    });
    await expect(
      onlineCentreService.getEngagements('s1', { role: 'bursar' }),
    ).rejects.toThrow();
  });
});

describe('finance hook PROOF (pure mapper, no DB)', () => {
  const pricing = {
    id: 'pr-public', schoolId: 's1', offeringId: 'off-1',
    feeCategoryId: 'fc-tuition', billingModel: 'per_term',
    amount: 450000, currency: 'UGX', displayMode: 'PUBLIC' as const, active: true,
  };
  const enrolment = {
    id: 'enr-1', schoolId: 's1', studentId: 'stud-1', offeringId: 'off-1',
    offeringTitle: 'Python Basics', status: 'active',
  };

  it('maps (pricing + enrolment) to valid student_charges columns', () => {
    const charge = buildChargeFromPricing(pricing, enrolment, {
      academicYearId: 'ay-2026',
      termId: 'term-1',
    });
    // student_charges columns: school/student/year/term/category/amount/currency
    expect(charge.school_id).toBe('s1');
    expect(charge.student_id).toBe('stud-1');
    expect(charge.academic_year_id).toBe('ay-2026');
    expect(charge.term_id).toBe('term-1');
    expect(charge.fee_category_id).toBe('fc-tuition');
    expect(charge.amount).toBe(450000);
    expect(charge.currency).toBe('UGX');
    expect(typeof charge.description).toBe('string');
    expect(charge.description.length).toBeGreaterThan(0);
    expect(charge.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('throws when pricing has no fee category (charge wiring unresolved)', () => {
    expect(() =>
      buildChargeFromPricing({ ...pricing, feeCategoryId: null }, enrolment, {
        academicYearId: 'ay-2026',
        termId: 'term-1',
      }),
    ).toThrow();
  });

  it('throws on non-positive amount (student_charges amount > 0)', () => {
    expect(() =>
      buildChargeFromPricing({ ...pricing, amount: 0 }, enrolment, {
        academicYearId: 'ay-2026',
        termId: 'term-1',
      }),
    ).toThrow();
  });
});
