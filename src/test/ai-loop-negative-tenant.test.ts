/**
 * Phase D — Negative tenant isolation tests (MOCKED, fail-closed).
 *
 * Honesty label: MOCKED-UNIT. No live database is touched. Every denial below
 * is a simulated RLS / guard rejection asserting the client and the Edge guard
 * fail closed (throw / 403 / 401) instead of leaking cross-tenant rows or
 * persisting phantom writes.
 *
 * Covers:
 *  A. School A caller vs School B resources: list / byId / create-as-B all
 *     deny fail-closed through resourceLibraryService.
 *  B. Observation + assignment writes denied by RLS propagate (no silent ok).
 *  C. AI invoke carrying School B IDs → Edge guard 403 (mocked store).
 *  D. Unauthenticated caller → 401 contract; caller with no/wrong-school
 *     role → 403.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { resourceLibraryService } from '../modules/teaching/resourceLibraryService';
import { observationService } from '../modules/teaching/observationService';
import { assignmentService } from '../modules/teaching/assignmentService';
import {
  authorizeAndValidate,
  extractBearerToken,
  HttpError,
  type GroundingStore,
} from '../../supabase/functions/ai-teaching-assistant/guard';

const SCHOOL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCHOOL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_A = 'user-school-a';

// ---------------------------------------------------------------------------
// Chainable supabase fake. Terminals resolve the currently configured result.
// ---------------------------------------------------------------------------
let result: { data: any; error: any } = { data: [], error: null };
let calls: Array<{ method: string; args: any[] }> = [];

function makeBuilder(): any {
  const b: any = {};
  for (const m of ['select', 'eq', 'order', 'or', 'in', 'limit']) {
    b[m] = (...args: any[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b.insert = (...args: any[]) => {
    calls.push({ method: 'insert', args });
    return b;
  };
  b.update = (...args: any[]) => {
    calls.push({ method: 'update', args });
    return b;
  };
  b.maybeSingle = (...args: any[]) => {
    calls.push({ method: 'maybeSingle', args });
    return Promise.resolve(result);
  };
  b.single = (...args: any[]) => {
    calls.push({ method: 'single', args });
    return Promise.resolve(result);
  };
  b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
  return b;
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  calls = [];
  result = { data: [], error: null };
  mockFrom.mockImplementation(() => makeBuilder());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function mockStore(overrides: Partial<GroundingStore> = {}): GroundingStore {
  return {
    getUserRoles: async () => [{ school_id: SCHOOL_A, role_id: 'teacher' }],
    getClassSchool: async () => SCHOOL_A,
    getStreamSchool: async () => SCHOOL_A,
    getSubjectSchool: async () => SCHOOL_A,
    getEmployeeSchool: async () => SCHOOL_A,
    isStudentInSchool: async () => true,
    getResourceSchool: async () => SCHOOL_A,
    objectiveExists: async () => true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A/B. Resource + write isolation: School A caller, School B rows.
// ---------------------------------------------------------------------------
describe('Phase D negative tenant isolation (mocked, fail-closed)', () => {
  it('School A cannot list School B resources: RLS denial throws, never silent []', async () => {
    result = { data: null, error: { message: 'RLS denial: cross-tenant access prohibited' } };
    await expect(resourceLibraryService.getResources(SCHOOL_B)).rejects.toThrow(
      /Failed to load school resources: RLS denial/,
    );
  });

  it('School A cannot read a School B resource byId: no-row returns null, scoped by school_id + id', async () => {
    result = { data: null, error: null };
    const row = await resourceLibraryService.getResourceById(SCHOOL_B, 'res-school-b-1');
    expect(row).toBeNull();
    expect(calls).toContainEqual({ method: 'eq', args: ['school_id', SCHOOL_B] });
    expect(calls).toContainEqual({ method: 'eq', args: ['id', 'res-school-b-1'] });
  });

  it('School A cannot create-as-B: denied write throws, no phantom row', async () => {
    result = { data: null, error: { message: 'RLS denial: cross-tenant write prohibited' } };
    await expect(
      resourceLibraryService.createResource({
        schoolId: SCHOOL_B,
        title: 'Cross-school write attempt',
        type: 'worksheet',
        subject: 'Mathematics',
        stageLevel: 'Stage 5',
        topic: 'Fractions',
        curriculumObjectiveCode: '5Nn.01',
        curriculumObjectiveText: 'Understand equivalent fractions.',
        authorName: 'Attacker',
        previewText: 'Must never persist.',
      }),
    ).rejects.toThrow(/Failed to create school resource: RLS denial/);
  });

  it('cross-tenant observation write denied by RLS propagates fail-closed', async () => {
    result = { data: null, error: { message: 'RLS denial: cross-tenant write prohibited' } };
    await expect(
      observationService.createObservation({
        schoolId: SCHOOL_B,
        studentId: 'student-b-1',
        teacherId: 'teacher-a-1',
        classId: 'class-b-1',
        subjectId: 'subject-b-1',
        observationType: 'misconception',
        observationText: 'Attempt to plant evidence in another school.',
      }),
    ).rejects.toThrow(/Failed to record teacher observation: RLS denial/);
  });

  it('create-as-B assignment insert denied by RLS throws, no assignment returned', async () => {
    result = { data: null, error: { message: 'RLS denial: cross-tenant write prohibited' } };
    await expect(
      assignmentService.createAssignment({
        schoolId: SCHOOL_B,
        teacherId: 'teacher-a-1',
        classId: 'class-b-1',
        subjectId: 'subject-b-1',
        title: 'TEST cross-tenant plant',
        instructions: 'Must never persist.',
        assignedDate: '2026-09-19',
        dueDate: '2026-09-26',
        submissionType: 'homework',
        evidenceTrack: 'diagnostic_evidence',
        status: 'draft',
      }),
    ).rejects.toThrow(/Failed to create assignment: RLS denial/);
  });
});

// ---------------------------------------------------------------------------
// C/D. Edge guard: cross-tenant AI invoke, authN/authZ mapping.
// ---------------------------------------------------------------------------
describe('Phase D Edge guard negative auth (mocked store)', () => {
  const extractPayload = {
    schoolId: SCHOOL_A,
    teacherId: 'teacher-1',
    classId: 'class-1',
    streamId: 'stream-1',
    subjectId: 'subject-1',
    studentId: 'student-1',
    resourceIds: ['res-1'],
    objectiveCode: '5Nn.01',
  };

  it('AI extract invoke with School B class/subject/resource IDs → 403 TENANT_MISMATCH', async () => {
    const store = mockStore({
      getClassSchool: async () => SCHOOL_B,
      getSubjectSchool: async () => SCHOOL_B,
      getResourceSchool: async () => SCHOOL_B,
    });
    const err = await authorizeAndValidate(store, USER_A, 'extract_work_observation', {
      ...extractPayload,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('TENANT_MISMATCH');
  });

  it('AI suggest invoke for a School B student → 403 TENANT_MISMATCH', async () => {
    const store = mockStore({ isStudentInSchool: async () => false });
    const err = await authorizeAndValidate(store, USER_A, 'suggest_intervention', {
      schoolId: SCHOOL_A,
      studentId: 'student-school-b',
      curriculumObjective: '5Nn.01',
      approvedObservationSnippets: ['friction'],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('TENANT_MISMATCH');
  });

  it('caller whose role belongs to another school → 403 TENANT_FORBIDDEN (wrong-school role)', async () => {
    const store = mockStore({
      getUserRoles: async () => [{ school_id: SCHOOL_B, role_id: 'teacher' }],
    });
    const err = await authorizeAndValidate(store, USER_A, 'generate_assignment', {
      schoolId: SCHOOL_A,
      teacherId: 'teacher-1',
      classId: 'class-1',
      subjectId: 'subject-1',
      objectiveCode: '5Nn.01',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('TENANT_FORBIDDEN');
  });

  it('caller with no role anywhere → 403 TENANT_FORBIDDEN', async () => {
    const store = mockStore({ getUserRoles: async () => [] });
    const err = await authorizeAndValidate(store, 'user-nobody', 'generate_assignment', {
      schoolId: SCHOOL_A,
      objectiveCode: '5Nn.01',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('TENANT_FORBIDDEN');
  });

  it('unauthenticated caller (missing/malformed Bearer) yields no token → HTTP 401 contract', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('not-a-bearer-token')).toBeNull();
    // Contract: the Edge HTTP layer maps a null token to 401 Unauthorized
    // before the guard below ever runs (which only emits 403/400).
    expect(extractBearerToken('Bearer valid-token-123')).toBe('valid-token-123');
  });

  it('control: same-school extract + suggest payloads pass (no 403)', async () => {
    const store = mockStore();
    const t1 = await authorizeAndValidate(store, USER_A, 'extract_work_observation', {
      ...extractPayload,
    });
    expect(t1).toEqual({ schoolId: SCHOOL_A, roleId: 'teacher' });
    const t2 = await authorizeAndValidate(store, USER_A, 'suggest_intervention', {
      schoolId: SCHOOL_A,
      studentId: 'student-1',
      curriculumObjective: '5Nn.01',
      approvedObservationSnippets: ['friction'],
    });
    expect(t2).toEqual({ schoolId: SCHOOL_A, roleId: 'teacher' });
  });
});
