/**
 * Phase 9F Task 1 (RED): parent online-learning projections.
 *
 * Extends the Phase 8 parent portal with a per-child "Online Learning" card:
 * upcoming online sessions (schedule info only — parents never join lessons),
 * participation history (never labelled "attendance"), online charges
 * (read-only, existing finance projection pattern), and visible teacher
 * feedback (session notes). Allowlisted via pickers in parentService —
 * no join links, no teacher rates/pay, no phone numbers, sibling-isolated,
 * mock honest empties, DB errors throw (D1).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockResolveMyChildIds } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockResolveMyChildIds: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));
vi.mock('../modules/auth/parentIdentity', () => ({
  resolveMyChildIds: mockResolveMyChildIds,
}));
vi.mock('../modules/finance/financeService', () => ({
  financeService: { getStudentFeeStatement: mockGetFeeStatement },
}));

const { mockGetFeeStatement } = vi.hoisted(() => ({
  mockGetFeeStatement: vi.fn(),
}));

import {
  parentService,
  toParentOnlineOverview,
  PARENT_ONLINE_PROJECTION_ALLOWLIST,
  PARENT_ONLINE_SESSION_ALLOWLIST,
  PARENT_ONLINE_PARTICIPATION_ALLOWLIST,
  PARENT_ONLINE_FEEDBACK_ALLOWLIST,
} from '../modules/parent/parentService';
import { PARENT_FINANCE_CHARGE_ALLOWLIST } from '../types/domain';

// ---------------------------------------------------------------------------
// Supabase stub idiom (mirrors parent-projection.test.ts).
// ---------------------------------------------------------------------------
let tableResponses: Record<string, unknown> = {};

const builderFor = (table: string) => {
  const respond = () => {
    const r: any = tableResponses[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: [], error: null });
  };
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.in = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.maybeSingle = () => respond();
  builder.single = () => respond();
  builder.then = (resolve: any, reject: any) => respond().then(resolve, reject);
  return builder;
};

const REAL_URL = 'https://prod-real-db.supabase.co';
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const origNodeEnv = process.env.NODE_ENV;

function forceLiveEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

function restoreMockEnv() {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = PLACEHOLDER_URL;
}

beforeEach(() => {
  mockFrom.mockImplementation((table: string) => builderFor(table));
  tableResponses = {};
  mockGetFeeStatement.mockReset();
  restoreMockEnv();
});

afterEach(() => {
  restoreMockEnv();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures: child A (linked) + sibling child B (must never leak into A).
// ---------------------------------------------------------------------------
const PARTICIPANTS_A = [
  { session_id: 'ses-a1', student_id: 'stu-A', participation_status: 'confirmed' },
  { session_id: 'ses-a2', student_id: 'stu-A', participation_status: 'present' },
];

const SESSIONS_MIXED = [
  {
    id: 'ses-a1',
    school_id: 'school-1',
    offering_id: 'off-1',
    teacher_id: 'emp-9',
    status: 'SCHEDULED',
    scheduled_start: '2099-10-01T09:00:00Z',
    scheduled_end: '2099-10-01T10:00:00Z',
    session_type: 'lesson',
    join_url: 'https://meet.example/ses-a1',
    session_note: null,
    hourly_rate: 50000,
    teacher_pay: 45000,
    teacher_phone: '+256700000001',
    offering: { id: 'off-1', title: 'Y5 Maths Online', subjects: { name: 'Mathematics' } },
  },
  {
    id: 'ses-a2',
    school_id: 'school-1',
    offering_id: 'off-1',
    teacher_id: 'emp-9',
    status: 'COMPLETED',
    scheduled_start: '2026-08-20T09:00:00Z',
    scheduled_end: '2026-08-20T10:00:00Z',
    session_type: 'lesson',
    join_url: 'https://meet.example/ses-a2',
    session_note: 'Great progress on fractions.',
    hourly_rate: 50000,
    teacher_pay: 45000,
    offering: { id: 'off-1', title: 'Y5 Maths Online', subjects: { name: 'Mathematics' } },
  },
  // Sibling row arriving in the same result set — must be dropped app-side.
  {
    id: 'ses-b1',
    school_id: 'school-1',
    offering_id: 'off-2',
    teacher_id: 'emp-5',
    status: 'SCHEDULED',
    scheduled_start: '2099-10-02T09:00:00Z',
    scheduled_end: '2099-10-02T10:00:00Z',
    session_type: 'lesson',
    join_url: 'https://meet.example/ses-b1',
    session_note: null,
    hourly_rate: 60000,
    teacher_pay: 55000,
    offering: { id: 'off-2', title: 'Y5 Science Online', subjects: { name: 'Science' } },
  },
];

const EMPLOYEES = [
  { id: 'emp-9', people: { first_name: 'Sarah', last_name: 'Nabwire' } },
  { id: 'emp-5', people: { first_name: 'Tom', last_name: 'Okello' } },
];

const STATEMENT_A: any = {
  studentId: 'stu-A',
  studentName: 'Amina Child',
  admissionNumber: '2026/0201',
  className: 'Stage 5 Blue',
  totalAssessed: 2300000,
  totalPaid: 100000,
  balance: 2200000,
  clearanceStatus: 'partial',
  charges: [
    {
      id: 'chg-on-a1',
      description: 'Online lessons — Term 1',
      amount: 300000,
      currency: 'UGX',
      dueDate: '2026-10-15',
      categoryName: 'Online',
      paidAmount: 100000,
      balance: 200000,
      schoolId: 'school-1',
      studentId: 'stu-A',
    },
    {
      id: 'chg-tuition-a',
      description: 'Term 1 Tuition',
      amount: 2000000,
      currency: 'UGX',
      dueDate: '2026-09-15',
      categoryName: 'Tuition',
      paidAmount: 0,
      balance: 2000000,
      schoolId: 'school-1',
      studentId: 'stu-A',
    },
  ],
  payments: [],
};

function mockOnlineLive() {
  forceLiveEnv();
  mockResolveMyChildIds.mockResolvedValue(['stu-A']);
  tableResponses.online_session_participants = { data: PARTICIPANTS_A, error: null };
  tableResponses.online_sessions = { data: SESSIONS_MIXED, error: null };
  tableResponses.employees = { data: EMPLOYEES, error: null };
  mockGetFeeStatement.mockResolvedValue(STATEMENT_A);
}

// ---------------------------------------------------------------------------
// Picker unit pin: allowlist keys only, forbidden extras stripped.
// ---------------------------------------------------------------------------
describe('parent online picker', () => {
  it('emits EXACTLY the allowlisted keys; drops join links, rates, pay, phones', () => {
    const proj = toParentOnlineOverview({
      studentId: 'stu-A',
      upcomingSessions: [
        {
          sessionId: 'ses-a1',
          subject: 'Mathematics',
          teacherName: 'Sarah Nabwire',
          start: '2099-10-01T09:00:00Z',
          end: '2099-10-01T10:00:00Z',
          status: 'SCHEDULED',
          joinUrl: 'https://meet.example/ses-a1',
          join_url: 'https://meet.example/ses-a1',
          hourlyRate: 50000,
          teacherPay: 45000,
          teacherPhone: '+256700000001',
        } as any,
      ],
      participation: [
        {
          sessionId: 'ses-a2',
          subject: 'Mathematics',
          date: '2026-08-20',
          status: 'present',
          teacherNote: 'Great progress on fractions.',
          attendanceId: 'att-1',
          recordedBy: 'emp-9',
        } as any,
      ],
      charges: STATEMENT_A.charges,
      feedback: [
        {
          sessionId: 'ses-a2',
          subject: 'Mathematics',
          date: '2026-08-20',
          text: 'Great progress on fractions.',
          teacherRate: 50000,
        } as any,
      ],
    });

    expect(Object.keys(proj).sort()).toEqual([...PARENT_ONLINE_PROJECTION_ALLOWLIST].sort());
    expect(proj.upcomingSessions).toHaveLength(1);
    expect(Object.keys(proj.upcomingSessions[0]).sort()).toEqual(
      [...PARENT_ONLINE_SESSION_ALLOWLIST].sort(),
    );
    expect(proj.participation).toHaveLength(1);
    expect(Object.keys(proj.participation[0]).sort()).toEqual(
      [...PARENT_ONLINE_PARTICIPATION_ALLOWLIST].sort(),
    );
    expect(Object.keys(proj.feedback[0]).sort()).toEqual([...PARENT_ONLINE_FEEDBACK_ALLOWLIST].sort());
    for (const c of proj.charges) {
      expect(Object.keys(c).sort()).toEqual([...PARENT_FINANCE_CHARGE_ALLOWLIST].sort());
    }
    // Tuition (non-online) charge is excluded from the online card.
    expect(proj.charges.map((c) => c.id)).toEqual(['chg-on-a1']);

    const raw = JSON.stringify(proj);
    expect(raw).not.toMatch(/join_?url|hourly|teacherPay|teacher_pay|attendanceId|recordedBy|teacherRate/i);
    expect(raw).not.toContain('+256700000001');
    expect(raw).not.toContain('meet.example');
  });
});

// ---------------------------------------------------------------------------
// (a) Upcoming sessions: own child only, teacher names, no rates/pay.
// ---------------------------------------------------------------------------
describe('parent online upcoming sessions', () => {
  it('(a) contains own upcoming sessions with teacher names; no join links or rates/pay', async () => {
    mockOnlineLive();
    const online = await parentService.getChildOnlineOverview('school-1', 'stu-A');
    expect(online).not.toBeNull();
    expect(online!.studentId).toBe('stu-A');
    expect(online!.upcomingSessions.map((s) => s.sessionId)).toEqual(['ses-a1']);
    expect(online!.upcomingSessions[0]).toMatchObject({
      subject: 'Mathematics',
      teacherName: 'Sarah Nabwire',
      start: '2099-10-01T09:00:00Z',
      status: 'SCHEDULED',
    });
    const raw = JSON.stringify(online!.upcomingSessions);
    expect(raw).not.toMatch(/join_?url|meet\.example|hourly|teacherPay|teacher_pay|salary/i);
    expect(raw).not.toContain('+256700000001');
  });
});

// ---------------------------------------------------------------------------
// (b) Participation history: present per session, never "attendance".
// ---------------------------------------------------------------------------
describe('parent online participation', () => {
  it('(b) participation present per session with teacher note; never labelled attendance', async () => {
    mockOnlineLive();
    const online = await parentService.getChildOnlineOverview('school-1', 'stu-A');
    expect(online!.participation.map((p) => p.sessionId)).toEqual(['ses-a2']);
    expect(online!.participation[0]).toMatchObject({
      subject: 'Mathematics',
      date: '2026-08-20',
      status: 'present',
      teacherNote: 'Great progress on fractions.',
    });
    const rawOnline = JSON.stringify(online).toLowerCase();
    expect(rawOnline).not.toContain('attendance');
    for (const p of online!.participation) {
      expect(Object.keys(p).sort()).toEqual([...PARENT_ONLINE_PARTICIPATION_ALLOWLIST].sort());
    }
  });
});

// ---------------------------------------------------------------------------
// (c) Online charges: read-only, amounts ONLY in the finance display.
// ---------------------------------------------------------------------------
describe('parent online charges', () => {
  it('(c) online charges visible read-only; amounts appear ONLY in the charges display', async () => {
    mockOnlineLive();
    const online = await parentService.getChildOnlineOverview('school-1', 'stu-A');
    expect(online!.charges.map((c) => c.id)).toEqual(['chg-on-a1']);
    expect(online!.charges[0]).toMatchObject({ description: 'Online lessons — Term 1', amount: 300000 });
    for (const c of online!.charges) {
      expect(Object.keys(c).sort()).toEqual([...PARENT_FINANCE_CHARGE_ALLOWLIST].sort());
    }
    const nonFinance = JSON.stringify({
      upcomingSessions: online!.upcomingSessions,
      participation: online!.participation,
      feedback: online!.feedback,
    });
    expect(nonFinance).not.toMatch(/"amount"|"balance"|"paidAmount"/);
  });
});

// ---------------------------------------------------------------------------
// (d) Sibling isolation + (e) rates/pay never present.
// ---------------------------------------------------------------------------
describe('parent online isolation + paywall', () => {
  it('(d) sibling B online data absent from child A view', async () => {
    mockOnlineLive();
    const online = await parentService.getChildOnlineOverview('school-1', 'stu-A');
    const raw = JSON.stringify(online);
    for (const marker of ['ses-b1', 'Science', 'Tom Okello', 'stu-B', 'Brian Other']) {
      expect(raw).not.toContain(marker);
    }
  });

  it('(d2) non-linked child -> null WITHOUT querying online tables', async () => {
    forceLiveEnv();
    mockResolveMyChildIds.mockResolvedValue(['stu-A']);
    await expect(parentService.getChildOnlineOverview('school-1', 'stu-B')).resolves.toBeNull();
    expect(mockResolveMyChildIds).toHaveBeenCalledWith('school-1');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGetFeeStatement).not.toHaveBeenCalled();
  });

  it('(e) teacher rates/pay never present anywhere in the online overview', async () => {
    mockOnlineLive();
    const online = await parentService.getChildOnlineOverview('school-1', 'stu-A');
    const raw = JSON.stringify(online);
    expect(raw).not.toMatch(/hourly|teacher_?pay|pay_?rate|salary/i);
    const keys: string[] = [];
    JSON.stringify(online, (k, v) => {
      if (k) keys.push(k);
      return v;
    });
    for (const k of keys) {
      expect(k).not.toMatch(/rate|salary/i);
    }
  });
});

// ---------------------------------------------------------------------------
// (f) Mock honest + (g) DB error throws.
// ---------------------------------------------------------------------------
describe('parent online env + failure modes', () => {
  it('(f) mock env -> null with no DB calls (honest empty)', async () => {
    await expect(parentService.getChildOnlineOverview('school-1', 'stu-A')).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGetFeeStatement).not.toHaveBeenCalled();
  });

  it('(g) DB error throws (D1 rule — never silent [] or leaked rows)', async () => {
    forceLiveEnv();
    mockResolveMyChildIds.mockResolvedValue(['stu-A']);
    tableResponses.online_session_participants = {
      data: null,
      error: { code: '42501', message: 'permission denied for table (RLS)' },
    };
    await expect(parentService.getChildOnlineOverview('school-1', 'stu-A')).rejects.toThrow(
      'Failed to load online learning.',
    );
  });
});
