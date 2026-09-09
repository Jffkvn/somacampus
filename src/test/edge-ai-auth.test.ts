import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authorizeAndValidate,
  extractBearerToken,
  extractObjectiveCode,
  extractTenantIds,
  HttpError,
  type GroundingStore,
} from '../../supabase/functions/ai-teaching-assistant/guard';

const { mockInvoke, mockFrom } = vi.hoisted(() => ({ mockInvoke: vi.fn(), mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: mockInvoke }, from: mockFrom },
}));

import { teachingAiService } from '../modules/teaching/teachingAiService';
import { SEED_ACADEMIC_RESOURCES } from '../modules/teaching/academicResources';

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
    getEmployeeIdForAuthUser: async () => 'teacher-1',
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

  it('403 TEACHER_ID_MISMATCH: same-school peer teacherId is rejected (caller is not that employee)', async () => {
    // Teacher A (caller employee teacher-1) supplies Teacher B (also in SCHOOL_A).
    const store = mockStore({
      getEmployeeIdForAuthUser: async () => 'teacher-1',
      getEmployeeSchool: async () => SCHOOL_A, // peer is still same school — must fail on binding
    });
    const err = await authorizeAndValidate(
      store,
      USER,
      'generate_assignment',
      genPayload({ teacherId: 'teacher-2' }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('TEACHER_ID_MISMATCH');
  });

  it('403 TEACHER_ID_MISMATCH: caller has no employee row in school when teacherId is supplied', async () => {
    const store = mockStore({ getEmployeeIdForAuthUser: async () => null });
    const err = await authorizeAndValidate(store, USER, 'generate_assignment', genPayload()).catch(
      (e) => e,
    );
    expect(err.status).toBe(403);
    expect(err.code).toBe('TEACHER_ID_MISMATCH');
  });

  it('accepts teacherId equal to the authenticated caller employee and returns it', async () => {
    const store = mockStore({ getEmployeeIdForAuthUser: async () => 'teacher-1' });
    const ok = await authorizeAndValidate(store, USER, 'generate_assignment', genPayload());
    expect(ok).toEqual({ schoolId: SCHOOL_A, roleId: 'teacher', teacherId: 'teacher-1' });
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
    expect(tenant).toEqual({ schoolId: SCHOOL_A, roleId: 'teacher', teacherId: 'teacher-1' });
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

  it('guard: accepts full-ID extract + suggest payloads (no 403)', async () => {
    const store = mockStore();
    const extractTenant = await authorizeAndValidate(store, USER, 'extract_work_observation', {
      schoolId: SCHOOL_A,
      teacherId: 'teacher-1',
      classId: 'class-1',
      streamId: 'stream-1',
      subjectId: 'subject-1',
      studentId: 'student-1',
      resourceIds: ['res-1'],
      objectiveCode: '5Nn.01',
    });
    expect(extractTenant).toEqual({ schoolId: SCHOOL_A, roleId: 'teacher', teacherId: 'teacher-1' });

    const suggestTenant = await authorizeAndValidate(store, USER, 'suggest_intervention', {
      schoolId: SCHOOL_A,
      teacherId: 'teacher-1',
      classId: 'class-1',
      streamId: 'stream-1',
      subjectId: 'subject-1',
      studentId: 'student-1',
      resourceIds: ['res-1'],
      curriculumObjective: '5Nn.01',
    });
    expect(suggestTenant).toEqual({ schoolId: SCHOOL_A, roleId: 'teacher', teacherId: 'teacher-1' });
  });
});

describe('Phase A2 client: all 3 invoke payloads carry tenant IDs', () => {
  const bodies: Array<{ action: string; payload: Record<string, any> }> = [];

  const queryBuilder = () => {
    const b: any = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.or = () => b;
    b.limit = () => b;
    b.then = (res: any) => Promise.resolve({ data: [], error: null }).then(res);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    bodies.length = 0;
    mockFrom.mockImplementation(() => queryBuilder());
    mockInvoke.mockImplementation(async (_fn: string, opts: any) => {
      bodies.push({ action: opts.body.action, payload: opts.body.payload });
      if (opts.body.action === 'generate_assignment') {
        return {
          data: {
            title: 'T',
            instructions: 'I',
            rubric: [{ criteria: 'Conceptual Accuracy', maxPoints: 20, guidance: 'Shows understanding.' }],
            maxScore: 50,
          },
          error: null,
        };
      }
      if (opts.body.action === 'extract_work_observation') {
        return {
          data: {
            observationType: 'misconception',
            observationText: 'obs text',
            suggestedFollowupFocus: 'focus',
          },
          error: null,
        };
      }
      return {
        data: {
          strategyAction: 'act',
          reason: 'r',
          targetOutcome: 'o',
          learningArea: 'Mathematics',
          topicName: 'T',
          suggestedDurationDays: 14,
          status: 'draft',
        },
        error: null,
      };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  const IDS = {
    schoolId: SCHOOL_A,
    teacherId: 'teacher-1',
    classId: 'class-1',
    streamId: 'stream-1',
    subjectId: 'subject-1',
  };

  it('generate + extract + suggest payloads all carry school/teacher/class/stream/subject/resource IDs', async () => {
    await teachingAiService.generateAssignmentDraft({
      objectiveCode: '5Nn.01',
      lessonContext: {
        ...IDS,
        className: 'Stage 5 Blue',
        subjectName: 'Mathematics',
        teacherName: 'Mr. David Musoke',
      },
      // generate carries the resource via adaptedResource -> resourceIds
      adaptedResource: { ...SEED_ACADEMIC_RESOURCES[0], id: 'res-1' },
    });

    await teachingAiService.extractObservationDraftFromWork({
      assignmentTitle: 'Fractions Practice',
      objectiveCode: '5Nn.01',
      objectiveDescription: 'desc',
      workType: 'notebook',
      workSummary: 'student struggled with unlike denominators',
      ...IDS,
      studentId: 'student-1',
      resourceIds: ['res-1'],
    });

    await teachingAiService.suggestInterventionFromEvidence({
      studentId: 'student-1',
      curriculumObjective: '5Nn.01',
      approvedObservationSnippets: ['friction with unlike denominators'],
      ...IDS,
      resourceIds: ['res-1'],
    });

    expect(bodies).toHaveLength(3);
    for (const { payload } of bodies) {
      expect(payload.schoolId).toBe(SCHOOL_A);
      expect(payload.teacherId).toBe('teacher-1');
      expect(payload.classId).toBe('class-1');
      expect(payload.streamId).toBe('stream-1');
      expect(payload.subjectId).toBe('subject-1');
      expect(payload.resourceIds).toEqual(['res-1']);
    }
    const actions = bodies.map((b) => b.action).sort();
    expect(actions).toEqual(['extract_work_observation', 'generate_assignment', 'suggest_intervention']);
  });
});
