import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, auth: { getUser: mockGetUser } },
}));

import { resolveMyChildIds } from '../modules/auth/parentIdentity';

// Thenable query-builder stub: resolves per-table responses regardless of chain.
// Mirrors the student-profile.test.ts idiom; records eq/in filters for scoping assertions.
let tableResponses: Record<string, unknown> = {};
let eqCalls: Array<{ table: string; col: string; val: unknown }> = [];
let inCalls: Array<{ table: string; col: string; vals: unknown }> = [];

const builderFor = (table: string) => {
  const respond = () => {
    const r: any = tableResponses[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: null, error: null });
  };
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = (col: string, val: unknown) => {
    eqCalls.push({ table, col, val });
    return builder;
  };
  builder.in = (col: string, vals: unknown) => {
    inCalls.push({ table, col, vals });
    return builder;
  };
  builder.maybeSingle = () => respond();
  builder.single = () => respond();
  builder.then = (resolve: any, reject: any) => respond().then(resolve, reject);
  return builder;
};

function mockSignedIn(authUid = 'auth-guardian-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id: authUid } }, error: null });
}

function enrolmentFilter(table: string, col: string) {
  return eqCalls.filter((c) => c.table === table && c.col === col).map((c) => c.val);
}

beforeEach(() => {
  mockFrom.mockImplementation((table: string) => builderFor(table));
  tableResponses = {};
  eqCalls = [];
  inCalls = [];
  mockSignedIn();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveMyChildIds (Phase 8A Task 2)', () => {
  it('(a) guardian with 2 children in the same school -> both ids', async () => {
    tableResponses.people = { data: { id: 'person-g1' }, error: null };
    tableResponses.student_guardians = {
      data: [{ student_id: 'stu-1' }, { student_id: 'stu-2' }],
      error: null,
    };
    tableResponses.student_enrolments = {
      data: [{ student_id: 'stu-1' }, { student_id: 'stu-2' }],
      error: null,
    };
    const ids = await resolveMyChildIds('school-A');
    expect([...ids].sort()).toEqual(['stu-1', 'stu-2']);
  });

  it('(b) no guardian link -> [] (fail-closed)', async () => {
    tableResponses.people = { data: { id: 'person-g1' }, error: null };
    tableResponses.student_guardians = { data: [], error: null };
    await expect(resolveMyChildIds('school-A')).resolves.toEqual([]);
  });

  it('(c) child enrolled at another school is excluded (school scoping)', async () => {
    tableResponses.people = { data: { id: 'person-g1' }, error: null };
    tableResponses.student_guardians = {
      data: [{ student_id: 'stu-1' }, { student_id: 'stu-other' }],
      error: null,
    };
    tableResponses.student_enrolments = { data: [{ student_id: 'stu-1' }], error: null };
    const ids = await resolveMyChildIds('school-A');
    expect(ids).toEqual(['stu-1']);
    expect(enrolmentFilter('student_enrolments', 'school_id')).toContain('school-A');
  });

  it('(d) DB error throws (never silent [])', async () => {
    tableResponses.people = { data: { id: 'person-g1' }, error: null };
    tableResponses.student_guardians = { data: null, error: { message: 'denied' } };
    await expect(resolveMyChildIds('school-A')).rejects.toThrow();
  });

  it('(e) WITHDRAWN enrolment excluded (active filter)', async () => {
    tableResponses.people = { data: { id: 'person-g1' }, error: null };
    tableResponses.student_guardians = {
      data: [{ student_id: 'stu-1' }, { student_id: 'stu-withdrawn' }],
      error: null,
    };
    tableResponses.student_enrolments = { data: [{ student_id: 'stu-1' }], error: null };
    const ids = await resolveMyChildIds('school-A');
    expect(ids).toEqual(['stu-1']);
    expect(enrolmentFilter('student_enrolments', 'status')).toContain('active');
  });

  it('requires a schoolId (mirrors resolveMyEmployeeId error convention)', async () => {
    await expect(resolveMyChildIds('')).rejects.toThrow('requires a schoolId');
  });

  it('no signed-in user -> [] (fail-closed)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(resolveMyChildIds('school-A')).resolves.toEqual([]);
  });
});
