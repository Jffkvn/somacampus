import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

const authState = vi.hoisted(() => ({
  schoolId: '22222222-2222-2222-2222-222222222222' as string | null,
  fullName: 'Test Teacher',
}));
vi.mock('../lib/authContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: null,
    role: 'teacher',
    fullName: authState.fullName,
    schoolId: authState.schoolId,
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchDevRole: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

import { resourceLibraryService } from '../modules/teaching/resourceLibraryService';
import { ResourceLibraryPage } from '../modules/teaching/ResourceLibraryPage';

describe('Resource Library Multi-Tenant Grounding', () => {
  const schoolA = '22222222-2222-2222-2222-222222222222';
  const schoolB = '99999999-0000-0000-0000-000000000002';
  const DEMO_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

  let chainResult: { data: any; error: any } = { data: [], error: null };
  let calls: { method: string; args: any[] }[] = [];

  const makeBuilder = () => {
    const b: any = {};
    for (const m of ['select', 'eq', 'order', 'or', 'in', 'limit']) {
      b[m] = (...args: any[]) => {
        calls.push({ method: m, args });
        return b;
      };
    }
    b.maybeSingle = (...args: any[]) => {
      calls.push({ method: 'maybeSingle', args });
      return Promise.resolve(chainResult);
    };
    b.single = (...args: any[]) => {
      calls.push({ method: 'single', args });
      return Promise.resolve(chainResult);
    };
    b.insert = (...args: any[]) => {
      calls.push({ method: 'insert', args });
      return b;
    };
    b.then = (res: any, rej: any) => Promise.resolve(chainResult).then(res, rej);
    return b;
  };

  const dbRow = (overrides: Record<string, any> = {}) => ({
    id: 'res-01',
    title: 'Fractions & Decimals: Guided Conversion Practice',
    type: 'worksheet',
    subject: 'Mathematics',
    stage_level: 'Stage 5',
    topic: 'Fractions & Proportions',
    curriculum_objective_code: '5Nn.01',
    curriculum_objective_text: 'Understand equivalent fractions.',
    approval_state: 'school_approved',
    author_name: 'Sarah Namukasa',
    created_at: '2026-08-28T00:00:00Z',
    usage_count: 42,
    rating: 4.9,
    preview_text: 'Scaffolded worksheet.',
    tags: ['fractions'],
    ...overrides,
  });

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    calls = [];
    chainResult = { data: [], error: null };
    mockFrom.mockImplementation(() => makeBuilder());
    authState.schoolId = schoolA;
    authState.fullName = 'Test Teacher';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('queries school resources filtered by objective code and approval state', async () => {
    chainResult = { data: [dbRow()], error: null };
    const matches = await resourceLibraryService.findMatchingResources(schoolA, '5Nn.01');
    expect(Array.isArray(matches)).toBe(true);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('res-01');
    expect(mockFrom).toHaveBeenCalledWith('school_resources');
    expect(calls).toContainEqual({ method: 'eq', args: ['school_id', schoolA] });
    expect(calls).toContainEqual({ method: 'eq', args: ['curriculum_objective_code', '5Nn.01'] });
    expect(calls).toContainEqual({
      method: 'in',
      args: ['approval_state', ['school_approved', 'teacher_approved']],
    });
  });

  it('fails closed when database returns an error on getResources', async () => {
    chainResult = { data: null, error: { message: 'RLS denial: cross-tenant access prohibited' } };

    await expect(resourceLibraryService.getResources(schoolB)).rejects.toThrow(
      /Failed to load school resources: RLS denial/
    );
  });

  it('excludes drafts by default unless the approval filter explicitly requests them', async () => {
    chainResult = { data: [dbRow()], error: null };
    await resourceLibraryService.getResources(schoolA);
    expect(calls).toContainEqual({
      method: 'in',
      args: ['approval_state', ['school_approved', 'teacher_approved']],
    });

    calls = [];
    chainResult = { data: [dbRow({ approval_state: 'draft' })], error: null };
    await resourceLibraryService.getResources(schoolA, { approvalState: 'draft' });
    expect(calls).toContainEqual({ method: 'eq', args: ['approval_state', 'draft'] });
    expect(calls.filter((c) => c.method === 'in')).toHaveLength(0);
  });

  it('findMatchingResources throws on DB error instead of returning []', async () => {
    chainResult = { data: null, error: { message: 'RLS denial: cross-tenant access prohibited' } };

    await expect(resourceLibraryService.findMatchingResources(schoolB, '5Nn.01')).rejects.toThrow(
      /Failed to load school resources/
    );
  });

  it('getResourceById returns null for cross-school reads (no-row), scoped by school_id + id', async () => {
    chainResult = { data: null, error: null };
    const result = await resourceLibraryService.getResourceById(schoolB, 'res-01');
    expect(result).toBeNull();
    expect(calls).toContainEqual({ method: 'eq', args: ['school_id', schoolB] });
    expect(calls).toContainEqual({ method: 'eq', args: ['id', 'res-01'] });
  });

  it('getResourceById throws on DB error', async () => {
    chainResult = { data: null, error: { message: 'RLS denial: cross-tenant access prohibited' } };

    await expect(resourceLibraryService.getResourceById(schoolB, 'res-01')).rejects.toThrow(
      /Failed to load school resource/
    );
  });

  it('createResource denied by RLS throws (no phantom row)', async () => {
    chainResult = { data: null, error: { message: 'RLS denial: cross-tenant write prohibited' } };

    await expect(
      resourceLibraryService.createResource({
        schoolId: schoolB,
        title: 'Cross-school write attempt',
        type: 'worksheet',
        subject: 'Mathematics',
        stageLevel: 'Stage 5',
        topic: 'Fractions',
        curriculumObjectiveCode: '5Nn.01',
        curriculumObjectiveText: 'Understand equivalent fractions.',
        authorName: 'Attacker',
        previewText: 'Should never persist.',
      })
    ).rejects.toThrow(/Failed to create school resource: RLS denial/);
  });

  it('unauthenticated schoolId null renders a sign-in gate and never queries the demo school', async () => {
    authState.schoolId = null;
    render(<ResourceLibraryPage />);

    expect(await screen.findByText(/sign in to view your school/i)).toBeInTheDocument();
    await waitFor(() => expect(mockFrom).not.toHaveBeenCalled());
    const queriedIds = calls
      .filter((c) => c.method === 'eq' && c.args[0] === 'school_id')
      .map((c) => c.args[1]);
    expect(queriedIds).not.toContain(DEMO_SCHOOL_ID);
  });
});
