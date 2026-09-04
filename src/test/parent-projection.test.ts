/**
 * Phase 8A Task 3 (RED): parent home portal projections.
 *
 * Parent-scoped allowlist projections mirroring ActivityParticipantProjection:
 * academic / attendance / finance / activity pickers must emit EXACTLY the
 * allowlisted keys — never teacher internals, payroll/expenses, phone numbers,
 * charge/payment ids, or sibling data.
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

import {
  PARENT_ACADEMIC_PROJECTION_ALLOWLIST,
  PARENT_ACADEMIC_OBSERVATION_ALLOWLIST,
  PARENT_ACADEMIC_ASSIGNMENT_ALLOWLIST,
  PARENT_LESSON_NOTE_ALLOWLIST,
  PARENT_ATTENDANCE_PROJECTION_ALLOWLIST,
  PARENT_ATTENDANCE_RECORD_ALLOWLIST,
  PARENT_FINANCE_PROJECTION_ALLOWLIST,
  PARENT_FINANCE_CHARGE_ALLOWLIST,
  PARENT_FINANCE_PAYMENT_ALLOWLIST,
  PARENT_ACTIVITY_PROJECTION_ALLOWLIST,
  ACTIVITY_PROJECTION_ALLOWLIST,
} from '../types/domain';
import {
  parentService,
  toParentAcademicProjection,
  toParentAttendanceProjection,
  toParentFinanceProjection,
  toParentActivityProjection,
} from '../modules/parent/parentService';
import { canAccessPath } from '../lib/teacherPrivacy';

// ---------------------------------------------------------------------------
// Supabase stub idiom (mirrors parent-identity.test.ts): per-table canned
// responses regardless of select chain; order/limit/eq/in recorded.
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

// ---------------------------------------------------------------------------
// Env idiom (mirrors activity-privacy.test.ts): mock env by default;
// force live env to exercise the service paths.
// ---------------------------------------------------------------------------
const REAL_URL = 'https://prod-real-db.supabase.co';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceLiveEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

function restoreMockEnv() {
  process.env.NODE_ENV = origNodeEnv;
  // NOTE: assigning undefined to import.meta.env coerces to the STRING
  // "undefined" (truthy) — delete instead to restore a truly-absent URL.
  if (origViteUrl === undefined) {
    delete (import.meta.env as any).VITE_SUPABASE_URL;
  } else {
    (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
  }
}

beforeEach(() => {
  mockFrom.mockImplementation((table: string) => builderFor(table));
  tableResponses = {};
  restoreMockEnv();
});

afterEach(() => {
  restoreMockEnv();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Shared fixtures: two siblings with fully distinct identifiers.
// ---------------------------------------------------------------------------
const ACADEMIC_A = {
  studentId: 'stu-A',
  lessonNotes: [
    {
      date: '2026-09-03',
      subjectName: 'Mathematics',
      visibleNote: 'We explored equivalent fractions.',
      privateReflection: 'Amina struggled at first — reteach Friday.',
      teacherId: 'emp-9',
      lessonId: 'les-1',
    },
  ],
  observations: [
    {
      id: 'obs-A1',
      date: '2026-09-02',
      teacherName: 'Sarah Nabwire',
      text: 'Excellent participation in fractions.',
      subjectName: 'Mathematics',
      visibility: 'parent_visible',
      teacherId: 'emp-9',
    },
    {
      id: 'obs-A2',
      date: '2026-09-01',
      teacherName: 'Sarah Nabwire',
      text: 'Internal staffing note — must not leak.',
      subjectName: 'Mathematics',
      visibility: 'internal_only',
      teacherId: 'emp-9',
    },
    {
      id: 'obs-A3',
      date: '2026-08-30',
      teacherName: 'Grace Alupo',
      text: 'Academic team strategy note.',
      subjectName: 'English',
      visibility: 'academic_team',
      teacherId: 'emp-2',
    },
  ],
  assignments: [
    {
      assignmentId: 'asg-A1',
      title: 'Fractions Quiz',
      subjectName: 'Mathematics',
      dueDate: '2026-09-05',
      submissionStatus: 'submitted',
      teacherFeedback: 'Well done!',
      score: 85,
      maxScore: 100,
      teacherId: 'emp-9',
    },
  ],
};

const ATTENDANCE_A = {
  studentId: 'stu-A',
  records: [
    {
      date: '2026-09-03',
      status: 'present',
      remarks: null,
      sessionId: 'sess-A1',
      recordedBy: 'emp-9',
      recordedByTeacherId: 'emp-9',
      recordedAt: '2026-09-03T08:00:00Z',
      correctedBy: null,
    },
    {
      date: '2026-09-02',
      status: 'absent',
      remarks: 'Fever',
      sessionId: 'sess-A2',
      recordedBy: 'emp-9',
      recordedByTeacherId: 'emp-9',
      recordedAt: '2026-09-02T08:00:00Z',
      correctedBy: 'emp-3',
      correctionReason: 'register recount',
    },
    {
      date: '2026-09-01',
      status: 'late',
      remarks: null,
      sessionId: 'sess-A3',
      recordedBy: 'emp-9',
      recordedByTeacherId: 'emp-7',
      recordedAt: '2026-09-01T08:00:00Z',
    },
  ],
};

const FINANCE_A: any = {
  studentId: 'stu-A',
  studentName: 'Amina Child',
  admissionNumber: '2026/0201',
  className: 'Stage 5 Blue',
  totalAssessed: 2000000,
  totalPaid: 500000,
  balance: 1500000,
  clearanceStatus: 'partial',
  charges: [
    {
      id: 'chg-A1',
      description: 'Term 1 Tuition',
      amount: 2000000,
      currency: 'UGX',
      dueDate: '2026-09-15',
      categoryName: 'Tuition',
      paidAmount: 500000,
      balance: 1500000,
      schoolId: 'school-1',
      studentId: 'stu-A',
    },
  ],
  payments: [
    {
      id: 'pmt-A1',
      amount: 500000,
      currency: 'UGX',
      paymentDate: '2026-09-01',
      paymentChannel: 'mobile_money',
      receiptNumber: 'REC-A1',
      status: 'partially_allocated',
      payerName: 'Mama A',
      payerPhone: '+256700000001',
      paymentReference: 'MM-A1',
      unallocatedAmount: 0,
    },
  ],
  // Forbidden extras a naive pass-through would leak:
  payrollTotals: { totalNet: 99999999 },
  schoolTotals: { collected: 88888888 },
  expenses: [{ id: 'exp-1', amount: 777777 }],
  otherStudents: [{ studentId: 'stu-B', name: 'Brian Other', balance: 424242 }],
};

const ACTIVITY_A = {
  studentId: 'stu-A',
  studentName: 'Amina Child',
  className: 'Stage 5',
  streamName: 'Blue',
  activityId: 'act-1',
  activityName: 'Swimming Squad',
  status: 'cleared' as const,
  basis: 'promise_to_pay' as const,
  validUntil: '2026-09-30',
  operationalNote: 'Commitment letter received',
  feeAmount: 250000,
  amount: 250000,
  chargeId: 'chg-ACT1',
  paymentId: 'pmt-ACT1',
  balance: 1000,
};

function bundleB() {
  return {
    academic: {
      ...ACADEMIC_A,
      studentId: 'stu-B',
      lessonNotes: [
        {
          date: '2026-09-03',
          subjectName: 'Science',
          visibleNote: 'Brian built a circuit.',
          privateReflection: 'Brian private reflection.',
          teacherId: 'emp-5',
          lessonId: 'les-B1',
        },
      ],
      observations: [
        {
          id: 'obs-B1',
          date: '2026-09-02',
          teacherName: 'Tom Okello',
          text: 'Brian led the group well.',
          subjectName: 'Science',
          visibility: 'parent_visible',
          teacherId: 'emp-5',
        },
      ],
      assignments: [
        {
          assignmentId: 'asg-B1',
          title: 'Circuits Worksheet',
          subjectName: 'Science',
          dueDate: '2026-09-06',
          submissionStatus: 'pending',
          teacherFeedback: null,
          score: 40,
          maxScore: 50,
          teacherId: 'emp-5',
        },
      ],
    },
    finance: {
      ...FINANCE_A,
      studentId: 'stu-B',
      studentName: 'Brian Other',
      admissionNumber: '2026/0202',
      charges: [
        {
          id: 'chg-B1',
          description: 'Term 1 Tuition B',
          amount: 2300000,
          currency: 'UGX',
          dueDate: '2026-09-15',
          categoryName: 'Tuition',
          paidAmount: 0,
          balance: 2300000,
          schoolId: 'school-1',
          studentId: 'stu-B',
        },
      ],
      payments: [
        {
          id: 'pmt-B9',
          amount: 100000,
          currency: 'UGX',
          paymentDate: '2026-09-01',
          paymentChannel: 'cash',
          receiptNumber: 'REC-B9',
          status: 'unallocated',
          payerName: 'Papa B',
          payerPhone: '+256722222222',
          paymentReference: 'MM-B9',
          unallocatedAmount: 100000,
        },
      ],
      otherStudents: [{ studentId: 'stu-A', name: 'Amina Child', balance: 1500000 }],
    },
  };
}// ---------------------------------------------------------------------------
// (a) Academic projection: exact keys + parent_visible observations only.
// ---------------------------------------------------------------------------
describe('parent academic projection', () => {
  it('(a) emits EXACTLY the allowlisted keys; observations are parent_visible only', () => {
    const proj = toParentAcademicProjection(ACADEMIC_A);
    expect(Object.keys(proj).sort()).toEqual([...PARENT_ACADEMIC_PROJECTION_ALLOWLIST].sort());

    expect(proj.observations).toHaveLength(1);
    expect(proj.observations[0]).toEqual({
      id: 'obs-A1',
      date: '2026-09-02',
      teacherName: 'Sarah Nabwire',
      text: 'Excellent participation in fractions.',
      subjectName: 'Mathematics',
    });
    for (const o of proj.observations) {
      expect(Object.keys(o).sort()).toEqual([...PARENT_ACADEMIC_OBSERVATION_ALLOWLIST].sort());
    }
    for (const n of proj.recentLessonNotes) {
      expect(Object.keys(n).sort()).toEqual([...PARENT_LESSON_NOTE_ALLOWLIST].sort());
    }
    for (const a of proj.assignments) {
      expect(Object.keys(a).sort()).toEqual([...PARENT_ACADEMIC_ASSIGNMENT_ALLOWLIST].sort());
      expect(a).not.toHaveProperty('score');
      expect(a).not.toHaveProperty('maxScore');
    }

    const raw = JSON.stringify(proj);
    expect(raw).not.toMatch(/privateReflection|reteach|staffing|strategy note|internal_only|academic_team/i);
    expect(raw).not.toContain('obs-A2');
    expect(raw).not.toContain('obs-A3');
    expect(raw).not.toContain('emp-9');
  });
});

// ---------------------------------------------------------------------------
// (b) Finance projection: no payroll/expenses/school totals, no phones,
//     no sibling data.
// ---------------------------------------------------------------------------
describe('parent finance projection', () => {
  it('(b) excludes payroll/expenses/school totals, phones and other children', () => {
    const proj = toParentFinanceProjection(FINANCE_A);
    expect(Object.keys(proj).sort()).toEqual([...PARENT_FINANCE_PROJECTION_ALLOWLIST].sort());

    expect(proj.charges).toHaveLength(1);
    for (const c of proj.charges) {
      expect(Object.keys(c).sort()).toEqual([...PARENT_FINANCE_CHARGE_ALLOWLIST].sort());
    }
    expect(proj.payments).toHaveLength(1);
    for (const p of proj.payments) {
      expect(Object.keys(p).sort()).toEqual([...PARENT_FINANCE_PAYMENT_ALLOWLIST].sort());
      expect(p).not.toHaveProperty('payerPhone');
      expect(p).not.toHaveProperty('payerName');
      expect(p).not.toHaveProperty('paymentReference');
      expect(p).not.toHaveProperty('unallocatedAmount');
    }

    const raw = JSON.stringify(proj);
    expect(raw).not.toMatch(/payroll|expense|schoolTotals|otherStudents|stu-B|Brian Other/i);
    expect(raw).not.toMatch(/\+\d{7,}/);
    expect(raw).not.toContain('+256700000001');
  });
});

// ---------------------------------------------------------------------------
// (c) Attendance projection: no teacher/session/recorder fields.
// ---------------------------------------------------------------------------
describe('parent attendance projection', () => {
  it('(c) excludes teacher/session/recorder fields', () => {
    const proj = toParentAttendanceProjection(ATTENDANCE_A);
    expect(Object.keys(proj).sort()).toEqual([...PARENT_ATTENDANCE_PROJECTION_ALLOWLIST].sort());
    expect(proj).toMatchObject({
      studentId: 'stu-A',
      total: 3,
      present: 1,
      absent: 1,
      late: 1,
      excused: 0,
      percentage: 33,
    });
    expect(proj.recentRecords[0].date).toBe('2026-09-03');
    for (const r of proj.recentRecords) {
      expect(Object.keys(r).sort()).toEqual([...PARENT_ATTENDANCE_RECORD_ALLOWLIST].sort());
      expect(r).not.toHaveProperty('sessionId');
      expect(r).not.toHaveProperty('recordedBy');
      expect(r).not.toHaveProperty('recordedByTeacherId');
      expect(r).not.toHaveProperty('recordedAt');
      expect(r).not.toHaveProperty('correctedBy');
    }
    const raw = JSON.stringify(proj);
    expect(raw).not.toMatch(/sessionId|recordedBy|correctedBy|sess-|emp-/);
  });
});

// ---------------------------------------------------------------------------
// (d) Activity projection: mirrors the teacher firewall allowlist —
//     no amounts, no charge/payment ids.
// ---------------------------------------------------------------------------
describe('parent activity projection', () => {
  it('(d) mirrors ACTIVITY_PROJECTION_ALLOWLIST with zero financial keys', () => {
    expect([...PARENT_ACTIVITY_PROJECTION_ALLOWLIST].sort()).toEqual(
      [...ACTIVITY_PROJECTION_ALLOWLIST].sort(),
    );
    const proj = toParentActivityProjection(ACTIVITY_A);
    expect(Object.keys(proj).sort()).toEqual([...PARENT_ACTIVITY_PROJECTION_ALLOWLIST].sort());
    expect(proj.clearanceLabel).toBe('✓ Cleared • Promise to Pay');
    for (const key of [
      'amount',
      'feeAmount',
      'balance',
      'chargeId',
      'paymentId',
      'charge_id',
      'payment_id',
    ]) {
      expect(proj).not.toHaveProperty(key);
    }
    const raw = JSON.stringify(proj);
    expect(raw).not.toMatch(/charge_id|payment_id|feeAmount|250000/i);
  });
});

// ---------------------------------------------------------------------------
// (e) Multi-child isolation: sibling B data never appears in A's projection.
// ---------------------------------------------------------------------------
describe('parent multi-child isolation', () => {
  it('(e) child B data never appears in child A projections (and vice versa)', () => {
    const b = bundleB();
    const projA = {
      academic: toParentAcademicProjection(ACADEMIC_A),
      attendance: toParentAttendanceProjection(ATTENDANCE_A),
      finance: toParentFinanceProjection(FINANCE_A),
      activities: [toParentActivityProjection(ACTIVITY_A)],
    };
    const projB = {
      academic: toParentAcademicProjection(b.academic),
      attendance: toParentAttendanceProjection({ studentId: 'stu-B', records: [] }),
      finance: toParentFinanceProjection(b.finance),
      activities: [
        toParentActivityProjection({
          ...ACTIVITY_A,
          studentId: 'stu-B',
          studentName: 'Brian Other',
        }),
      ],
    };
    const rawA = JSON.stringify(projA);
    const rawB = JSON.stringify(projB);

    for (const marker of ['stu-B', 'Brian Other', '2026/0202', 'REC-B9', 'chg-B1', 'obs-B1', 'asg-B1', '+256722222222']) {
      expect(rawA).not.toContain(marker);
    }
    for (const marker of ['stu-A', 'Amina Child', '2026/0201', 'REC-A1', 'chg-A1', 'obs-A1', 'asg-A1', '+256700000001']) {
      expect(rawB).not.toContain(marker);
    }
  });
});

// ---------------------------------------------------------------------------
// Service behavior: mock-env honest empties + membership gate.
// ---------------------------------------------------------------------------
describe('parentService env + membership', () => {
  it('mock env: getParentChildren -> [] and getChildOverview -> null', async () => {
    restoreMockEnv();
    await expect(parentService.getParentChildren('school-1')).resolves.toEqual([]);
    await expect(parentService.getChildOverview('school-1', 'stu-A')).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('live: non-linked child -> null WITHOUT querying (membership gate)', async () => {
    forceLiveEnv();
    mockResolveMyChildIds.mockResolvedValue(['stu-A']);
    await expect(parentService.getChildOverview('school-1', 'stu-B')).resolves.toBeNull();
    expect(mockResolveMyChildIds).toHaveBeenCalledWith('school-1');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('live: linked child overview is fully allowlisted with no sibling leakage', async () => {
    forceLiveEnv();
    mockResolveMyChildIds.mockResolvedValue(['stu-A']);
    tableResponses.students = {
      data: [
        {
          id: 'stu-A',
          admission_number: '2026/0201',
          person: { first_name: 'Amina', last_name: 'Child' },
        },
      ],
      error: null,
    };
    tableResponses.student_enrolments = {
      data: [
        {
          student_id: 'stu-A',
          class_id: 'class-5',
          classes: { id: 'class-5', name: 'Stage 5' },
          streams: { id: 'stream-b', name: 'Blue' },
          class: { name: 'Stage 5' },
        },
      ],
      error: null,
    };
    tableResponses.student_attendance_records = {
      data: ATTENDANCE_A.records,
      error: null,
    };
    tableResponses.student_submissions = {
      data: [
        {
          id: 'sub-A1',
          assignment_id: 'asg-A1',
          submission_status: 'submitted',
          teacher_feedback: 'Well done!',
          created_at: '2026-09-04T10:00:00Z',
          assignment: {
            id: 'asg-A1',
            title: 'Fractions Quiz',
            due_date: '2026-09-05',
            subjects: { name: 'Mathematics' },
          },
        },
      ],
      error: null,
    };
    tableResponses.teacher_observations = {
      data: [
        {
          id: 'obs-A1',
          observation_text: 'Excellent participation in fractions.',
          observed_at: '2026-09-02',
          visibility: 'parent_visible',
          teacher: { people: { first_name: 'Sarah', last_name: 'Nabwire' } },
          subjects: { name: 'Mathematics' },
        },
        {
          id: 'obs-A2',
          observation_text: 'Internal staffing note — must not leak.',
          observed_at: '2026-09-01',
          visibility: 'internal_only',
          teacher: { people: { first_name: 'Sarah', last_name: 'Nabwire' } },
          subjects: { name: 'Mathematics' },
        },
      ],
      error: null,
    };
    tableResponses.lessons = {
      data: [
        {
          visible_lesson_note: 'We explored equivalent fractions.',
          submitted_at: '2026-09-03T15:00:00Z',
          curriculum_topic: 'Fractions',
          subjects: { name: 'Mathematics' },
          teacher_id: 'emp-9',
        },
      ],
      error: null,
    };
    tableResponses.student_charges = {
      data: [
        {
          id: 'chg-A1',
          school_id: 'school-1',
          student_id: 'stu-A',
          academic_year_id: 'ay-1',
          term_id: 'term-1',
          fee_category_id: 'fc-tuition',
          description: 'Term 1 Tuition',
          amount: 2000000,
          currency: 'UGX',
          due_date: '2026-09-15',
        },
      ],
      error: null,
    };
    tableResponses.fee_payments = {
      data: [
        {
          id: 'pmt-A1',
          school_id: 'school-1',
          student_id: 'stu-A',
          amount: 500000,
          payment_date: '2026-09-01',
          payment_channel: 'mobile_money',
          payment_reference: 'MM-A1',
          payer_name: 'Mama A',
          payer_phone: '+256700000001',
          receipt_number: 'REC-A1',
          unallocated_amount: 0,
          status: 'partially_allocated',
          notes: 'MM transfer',
        },
      ],
      error: null,
    };
    tableResponses.payment_allocations = {
      data: [
        {
          id: 'alloc-A1',
          school_id: 'school-1',
          payment_id: 'pmt-A1',
          charge_id: 'chg-A1',
          amount: 500000,
        },
      ],
      error: null,
    };
    tableResponses.activity_enrolments = {
      data: [
        {
          student_id: 'stu-A',
          student_name: 'Amina Child',
          class_name: 'Stage 5',
          stream_name: 'Blue',
          activity_id: 'act-1',
          fee_amount: 250000,
          charge_id: 'chg-ACT1',
        },
      ],
      error: null,
    };
    tableResponses.activity_clearances = {
      data: [
        {
          student_id: 'stu-A',
          activity_id: 'act-1',
          status: 'cleared',
          basis: 'promise_to_pay',
          valid_until: '2026-09-30',
          operational_note: 'Commitment letter received',
        },
      ],
      error: null,
    };
    tableResponses.school_activities = {
      data: [{ id: 'act-1', name: 'Swimming Squad', school_id: 'school-1' }],
      error: null,
    };

    const overview = await parentService.getChildOverview('school-1', 'stu-A');
    expect(overview).not.toBeNull();
    expect(overview!.child).toEqual({
      studentId: 'stu-A',
      name: 'Amina Child',
      admission: '2026/0201',
      class: 'Stage 5 Blue',
    });
    expect(Object.keys(overview!.academic).sort()).toEqual(
      [...PARENT_ACADEMIC_PROJECTION_ALLOWLIST].sort(),
    );
    expect(overview!.academic.observations).toHaveLength(1);
    expect(Object.keys(overview!.attendance).sort()).toEqual(
      [...PARENT_ATTENDANCE_PROJECTION_ALLOWLIST].sort(),
    );
    expect(overview!.attendance.total).toBe(3);
    expect(Object.keys(overview!.finance!).sort()).toEqual(
      [...PARENT_FINANCE_PROJECTION_ALLOWLIST].sort(),
    );
    expect(overview!.finance!.balance).toBe(1500000);
    expect(overview!.activities).toHaveLength(1);
    expect(Object.keys(overview!.activities[0]).sort()).toEqual(
      [...PARENT_ACTIVITY_PROJECTION_ALLOWLIST].sort(),
    );

    const raw = JSON.stringify(overview);
    expect(raw).not.toMatch(/payer|\+256|internal_only|staffing|emp-|sess-|fee_amount|charge_id|payment_id/i);
    expect(raw).not.toContain('obs-A2');
  });

  it('live: getParentChildren returns allowlisted summaries for linked ids only', async () => {
    forceLiveEnv();
    mockResolveMyChildIds.mockResolvedValue(['stu-A']);
    tableResponses.students = {
      data: [
        {
          id: 'stu-A',
          admission_number: '2026/0201',
          person: { first_name: 'Amina', last_name: 'Child' },
        },
      ],
      error: null,
    };
    tableResponses.student_enrolments = {
      data: [
        {
          student_id: 'stu-A',
          classes: { id: 'class-5', name: 'Stage 5' },
          streams: { id: 'stream-b', name: 'Blue' },
        },
      ],
      error: null,
    };
    await expect(parentService.getParentChildren('school-1')).resolves.toEqual([
      { studentId: 'stu-A', name: 'Amina Child', admission: '2026/0201', class: 'Stage 5 Blue' },
    ]);
  });

  it('live: DB/RLS error throws (D1 rule — never silent [] or leaked rows)', async () => {
    forceLiveEnv();
    mockResolveMyChildIds.mockResolvedValue(['stu-A']);
    const deny = { data: null, error: { code: '42501', message: 'permission denied for table (RLS)' } };
    tableResponses.students = deny;
    await expect(parentService.getParentChildren('school-1')).rejects.toThrow(
      'Failed to load linked children.',
    );
    await expect(parentService.getChildOverview('school-1', 'stu-A')).rejects.toThrow(
      'Failed to load child overview.',
    );
  });
});

// ---------------------------------------------------------------------------
// Route gate: /parent/* is parent-only (matches the family_portal nav group).
// ---------------------------------------------------------------------------
describe('parent route guard', () => {
  it('teacher (and other non-parent roles) are denied on /parent/home; parent allowed', () => {
    expect(canAccessPath('teacher', '/parent/home')).toBe(false);
    expect(canAccessPath('principal', '/parent/home')).toBe(false);
    expect(canAccessPath('bursar', '/parent/home')).toBe(false);
    expect(canAccessPath('admin', '/parent/home')).toBe(false);
    expect(canAccessPath('student', '/parent/home')).toBe(false);
    expect(canAccessPath('parent', '/parent/home')).toBe(true);
  });
});
