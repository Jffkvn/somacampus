import { describe, it, expect } from 'vitest';
import {
  authorizeAndValidate,
  extractBearerToken,
  extractObjectiveCode,
  extractTenantIds,
  HttpError,
  type GroundingStore,
} from '../../supabase/functions/ai-teaching-assistant/guard';

/**
 * Phase A2 — Edge auth + server-side grounding gate.
 * Tests the pure guard (same code imported by the Deno Edge function).
 * Edge HTTP mapping: missing/invalid Bearer -> 401 (asserted via
 * extractBearerToken null contract); HttpError status/code asserted below.
 */

const SCHOOL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCHOOL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER = 'user-1';

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

const genPayload = (extra: Record<string, unknown> = {}) => ({
  schoolId: SCHOOL_A,
  teacherId: 'teacher-1',
  classId: 'class-1',
  streamId: 'stream-1',
  subjectId: 'subject-1',
  resourceIds: ['res-1'],
  objectiveCode: '5Nn.01',
  ...extra,
});

describe('Phase A2 edge auth + grounding gate', () => {
  it('401 contract: missing / malformed Bearer yields no token', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('garbage-no-scheme')).toBeNull();
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('403: valid user with no role for requested school', async () => {
    const store = mockStore(); // roles only for SCHOOL_A
    const err = await authorizeAndValidate(
      store,
      USER,
      'generate_assignment',
      genPayload({ schoolId: SCHOOL_B })
    ).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('TENANT_FORBIDDEN');
  });

  it('403: cross-tenant classId', async () => {
    const store = mockStore({ getClassSchool: async () => SCHOOL_B });
    const err = await authorizeAndValidate(store, USER, 'generate_assignment', genPayload()).catch(
      (e) => e
    );
    expect(err.status).toBe(403);
    expect(err.code).toBe('TENANT_MISMATCH');
  });

  it('403: cross-tenant studentId (not enrolled in caller school)', async () => {
    const store = mockStore({ isStudentInSchool: async () => false });
    const err = await authorizeAndValidate(
      store,
      USER,
      'suggest_intervention',
      {
        schoolId: SCHOOL_A,
        studentId: 'student-x',
        curriculumObjective: '5Nn.01',
        approvedObservationSnippets: ['friction'],
      }
    ).catch((e) => e);
    expect(err.status).toBe(403);
    expect(err.code).toBe('TENANT_MISMATCH');
  });

  it('403: cross-tenant resourceId', async () => {
    const store = mockStore({ getResourceSchool: async () => SCHOOL_B });
    const err = await authorizeAndValidate(store, USER, 'generate_assignment', genPayload()).catch(
      (e) => e
    );
    expect(err.status).toBe(403);
    expect(err.code).toBe('TENANT_MISMATCH');
  });

  it('400: unknown objective code never invents', async () => {
    const store = mockStore({ objectiveExists: async () => false });
    const err = await authorizeAndValidate(
      store,
      USER,
      'generate_assignment',
      genPayload({ objectiveCode: '9ZZ.99' })
    ).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.code).toBe('UNKNOWN_OBJECTIVE');
  });

  it('passes: same-school IDs + known objective resolve tenant', async () => {
    const store = mockStore();
    const tenant = await authorizeAndValidate(store, USER, 'generate_assignment', genPayload());
    expect(tenant).toEqual({ schoolId: SCHOOL_A, roleId: 'teacher' });
  });

  it('collects nested lessonContext IDs and normalizes suggest objective', () => {
    const ids = extractTenantIds('generate_assignment', {
      lessonContext: { schoolId: SCHOOL_A, teacherId: 't', classId: 'c', subjectId: 's' },
      resourceId: 'res-9',
    });
    expect(ids.schoolId).toBe(SCHOOL_A);
    expect(ids.classId).toBe('c');
    expect(ids.resourceIds).toEqual(['res-9']);
    expect(
      extractObjectiveCode('suggest_intervention', { curriculumObjective: '5Nn.01' })
    ).toBe('5Nn.01');
  });
});
