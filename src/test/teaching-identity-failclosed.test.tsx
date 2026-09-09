import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Phase A3 — demo identity purge.
 * Fail-closed authenticated identity for the teaching loop:
 * no demo teacher/school/class/stream/subject UUIDs reach service payloads.
 */

const DEMO_TEACHER_ID = '99999999-9999-9999-9999-999999999992';
const DEMO_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_CLASS_ID = '55555555-5555-5555-5555-555555555551';
const DEMO_STREAM_ID = '66666666-6666-6666-6666-666666666661';
const DEMO_SUBJECT_ID = '77777777-7777-7777-7777-777777777771';

const SCHOOL_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEACHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STREAM_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUBJECT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const mocks = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockResolve: vi.fn(),
  createAssignment: vi.fn(),
  getAssignmentDetail: vi.fn(),
  updateSubmission: vi.fn(),
  reviewSubmission: vi.fn(),
  createObservation: vi.fn(),
  generateAssignmentDraft: vi.fn(),
  extractObservationDraft: vi.fn(),
  suggestIntervention: vi.fn(),
  createIntervention: vi.fn(),
  activateIntervention: vi.fn(),
  findMatchingResources: vi.fn(),
}));

const eqCalls = vi.hoisted(() => ({ calls: [] as Array<{ table: string; col: string; val: unknown }> }));
vi.mock('../lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const b: any = {};
    for (const m of ['select', 'order', 'or', 'in', 'limit']) {
      b[m] = () => b;
    }
    b.eq = (col: string, val: unknown) => {
      eqCalls.calls.push({ table, col, val });
      return b;
    };
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.insert = () => b;
    b.update = () => b;
    b.then = (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej);
    return b;
  };
  return {
    supabase: {
      from: (...args: any[]) => {
        mocks.mockFrom(...args);
        return makeBuilder(String(args[0]));
      },
      functions: { invoke: vi.fn() },
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    },
  };
});

const authState = vi.hoisted(() => ({
  schoolId: null as string | null,
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

vi.mock('../modules/auth/identity', () => ({
  resolveMyEmployeeId: (...args: any[]) => mocks.mockResolve(...args),
}));
vi.mock('../modules/teaching/assignmentService', () => ({
  assignmentService: {
    createAssignment: (...args: any[]) => mocks.createAssignment(...args),
    getAssignmentDetail: (...args: any[]) => mocks.getAssignmentDetail(...args),
    updateSubmission: (...args: any[]) => mocks.updateSubmission(...args),
    reviewSubmission: (...args: any[]) => mocks.reviewSubmission(...args),
  },
}));
vi.mock('../modules/teaching/observationService', () => ({
  observationService: {
    createObservation: (...args: any[]) => mocks.createObservation(...args),
  },
}));
vi.mock('../modules/teaching/teachingAiService', () => ({
  teachingAiService: {
    getAvailableCambridgeObjectives: () => [{ code: '5Nn.01', title: 'Equivalent fractions' }],
    generateAssignmentDraft: (...args: any[]) => mocks.generateAssignmentDraft(...args),
    extractObservationDraftFromWork: (...args: any[]) => mocks.extractObservationDraft(...args),
    suggestInterventionFromEvidence: (...args: any[]) => mocks.suggestIntervention(...args),
  },
}));
vi.mock('../modules/teaching/resourceLibraryService', () => ({
  resourceLibraryService: {
    findMatchingResources: (...args: any[]) => mocks.findMatchingResources(...args),
    getResources: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../modules/intelligence/learningIntelligenceService', () => ({
  learningIntelligenceService: {
    createIntervention: (...args: any[]) => mocks.createIntervention(...args),
    activateIntervention: (...args: any[]) => mocks.activateIntervention(...args),
  },
}));

import { AssignmentCreatePage } from '../modules/teaching/AssignmentCreatePage';
import { AssignmentReviewPage } from '../modules/teaching/AssignmentReviewPage';
import { getLessonContext } from '../modules/teaching/lessonService';

const srcFile = (rel: string) =>
  fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

beforeEach(() => {
  eqCalls.calls = [];
});

describe('A3 static CI guard: no demo identity literals in teaching scope', () => {
  it('AssignmentCreatePage has no demo teacher/class/stream/subject identity', () => {
    const src = srcFile('src/modules/teaching/AssignmentCreatePage.tsx');
    expect(src).not.toContain('DEFAULT_TEACHER_ID');
    expect(src).not.toContain(DEMO_TEACHER_ID);
    expect(src).not.toContain(DEMO_CLASS_ID);
    expect(src).not.toContain(DEMO_STREAM_ID);
    expect(src).not.toContain(DEMO_SUBJECT_ID);
  });

  it('AssignmentReviewPage has no demo teacher identity', () => {
    const src = srcFile('src/modules/teaching/AssignmentReviewPage.tsx');
    expect(src).not.toContain('DEFAULT_TEACHER_ID');
    expect(src).not.toContain(DEMO_TEACHER_ID);
  });

  it('AssignmentsListPage + ResourceLibraryPage carry no demo school fallback', () => {
    for (const f of [
      'src/modules/teaching/AssignmentsListPage.tsx',
      'src/modules/teaching/ResourceLibraryPage.tsx',
    ]) {
      const src = srcFile(f);
      expect(src).not.toContain('DEFAULT_SCHOOL_ID');
      expect(src).not.toContain(DEMO_SCHOOL_ID);
    }
  });

  it('lessonService carries no demo UUID fallbacks', () => {
    const src = srcFile('src/modules/teaching/lessonService.ts');
    for (const id of [DEMO_TEACHER_ID, DEMO_SCHOOL_ID, DEMO_CLASS_ID, DEMO_STREAM_ID, DEMO_SUBJECT_ID]) {
      expect(src).not.toContain(id);
    }
  });

  it('authContext signOut resets school scope', () => {
    const src = srcFile('src/lib/authContext.tsx');
    const signOutBody = src.slice(src.indexOf('const signOut'));
    expect(signOutBody).toContain('setSchoolId(null)');
  });
});

describe('A3 AssignmentCreatePage identity resolution', () => {
  const entry = `/teaching/assignments/new?classId=${CLASS_ID}&streamId=${STREAM_ID}&subjectId=${SUBJECT_ID}&topic=Fractions`;

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    authState.schoolId = SCHOOL_ID;
    mocks.mockResolve.mockResolvedValue(TEACHER_ID);
    mocks.createAssignment.mockResolvedValue({ id: 'new-1' });
    mocks.generateAssignmentDraft.mockResolvedValue({
      title: 'Draft',
      instructions: 'Do work',
      submissionType: 'homework',
      evidenceTrack: 'diagnostic_evidence',
      maxScore: 50,
      grounding: {
        curriculumObjective: { code: '5Nn.01', title: 'Equivalent fractions' },
        lessonContext: {},
        classEvidenceSummary: '',
        matchedResources: [],
      },
      isAiDrafted: true,
      requiresHumanApproval: true,
      status: 'draft',
      approvalState: 'unreviewed',
    });
    mocks.findMatchingResources.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  const fillAndPublish = async () => {
    fireEvent.change(screen.getByPlaceholderText(/Fractions Intro Practice/i), {
      target: { value: 'Fractions Practice' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Detail the pages/i), {
      target: { value: 'Complete all questions.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Publish Assignment/i }));
  };

  it('uses the resolved employee id in the create payload (never the demo UUID)', async () => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <AssignmentCreatePage />
      </MemoryRouter>
    );
    await waitFor(() => expect(mocks.mockResolve).toHaveBeenCalledWith(SCHOOL_ID));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Publish Assignment/i })).toBeEnabled()
    );
    await fillAndPublish();
    await waitFor(() => expect(mocks.createAssignment).toHaveBeenCalled());
    const payload = mocks.createAssignment.mock.calls[0][0];
    expect(payload.teacherId).toBe(TEACHER_ID);
    expect(payload.teacherId).not.toBe(DEMO_TEACHER_ID);
    expect(JSON.stringify(payload)).not.toContain(DEMO_TEACHER_ID);
    expect(JSON.stringify(payload)).not.toContain(DEMO_SCHOOL_ID);
  });

  it('aiDraftApprovedBy uses the resolved id when an AI draft is approved', async () => {
    mocks.generateAssignmentDraft.mockResolvedValue({
      title: 'AI Draft',
      instructions: 'AI work',
      submissionType: 'homework',
      evidenceTrack: 'diagnostic_evidence',
      maxScore: 50,
      grounding: {
        curriculumObjective: { code: '5Nn.01', title: 'Equivalent fractions' },
        lessonContext: {},
        classEvidenceSummary: '',
        matchedResources: [],
      },
      isAiDrafted: true,
      requiresHumanApproval: true,
      status: 'draft',
      approvalState: 'unreviewed',
    });
    render(
      <MemoryRouter initialEntries={[entry]}>
        <AssignmentCreatePage />
      </MemoryRouter>
    );
    await waitFor(() => expect(mocks.mockResolve).toHaveBeenCalledWith(SCHOOL_ID));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /AI Cambridge Assist/i })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: /AI Cambridge Assist/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Generate Grounded Draft/i })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: /Generate Grounded Draft/i }));
    await waitFor(() => expect(mocks.generateAssignmentDraft).toHaveBeenCalled());
    const ctx = mocks.generateAssignmentDraft.mock.calls[0][0].lessonContext;
    expect(ctx.teacherId).toBe(TEACHER_ID);
    fireEvent.click(screen.getByLabelText(/I have reviewed, adapted, and approved/i));
    await fillAndPublish();
    await waitFor(() => expect(mocks.createAssignment).toHaveBeenCalled());
    const payload = mocks.createAssignment.mock.calls[0][0];
    expect(payload.aiDraftApprovedBy).toBe(TEACHER_ID);
  });

  it('blocks writes + shows sign-in/resolve notice when identity is unresolvable', async () => {
    mocks.mockResolve.mockResolvedValue(null);
    render(
      <MemoryRouter initialEntries={[entry]}>
        <AssignmentCreatePage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText(/sign in \/ resolve identity|resolve.*identity|sign in to resolve/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /Publish Assignment/i })).toBeDisabled();
    await fillAndPublish().catch(() => undefined);
    expect(mocks.createAssignment).not.toHaveBeenCalled();
  });

  it('scopes class/subject display lookups to the signed-in school', async () => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <AssignmentCreatePage />
      </MemoryRouter>
    );
    await waitFor(() => expect(mocks.mockResolve).toHaveBeenCalledWith(SCHOOL_ID));
    await waitFor(() => expect(eqCalls.calls.length).toBeGreaterThan(0));
    expect(eqCalls.calls).toContainEqual({ table: 'classes', col: 'school_id', val: SCHOOL_ID });
    expect(eqCalls.calls).toContainEqual({ table: 'classes', col: 'id', val: CLASS_ID });
    expect(eqCalls.calls).toContainEqual({ table: 'subjects', col: 'school_id', val: SCHOOL_ID });
    expect(eqCalls.calls).toContainEqual({ table: 'subjects', col: 'id', val: SUBJECT_ID });
  });

  it('requires explicit class/subject context — no silent demo prefill', async () => {
    render(
      <MemoryRouter initialEntries={['/teaching/assignments/new']}>
        <AssignmentCreatePage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(
        screen.getAllByText(/select.*class.*subject|class.*subject.*required|missing.*context/i).length
      ).toBeGreaterThan(0)
    );
    expect(screen.getByRole('button', { name: /Publish Assignment/i })).toBeDisabled();
    expect(mocks.createAssignment).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(DEMO_CLASS_ID);
  });
});

describe('A3 AssignmentReviewPage identity resolution', () => {
  const assignment = {
    id: 'a1',
    schoolId: SCHOOL_ID,
    teacherId: TEACHER_ID,
    classId: CLASS_ID,
    className: 'Test Class',
    streamId: STREAM_ID,
    streamName: 'Test Stream',
    subjectId: SUBJECT_ID,
    subjectName: 'Mathematics',
    title: 'Fractions Practice',
    instructions: 'Do work',
    assignedDate: '2026-09-01',
    dueDate: '2026-09-10',
    submissionType: 'homework',
    evidenceTrack: 'diagnostic_evidence',
    status: 'published',
    curriculumObjectiveCode: '5Nn.01',
    curriculumObjectiveTitle: 'Equivalent fractions',
  };
  const submission = {
    id: 's1',
    schoolId: SCHOOL_ID,
    assignmentId: 'a1',
    studentId: 'stu-1',
    studentName: 'Amina Kato',
    admissionNumber: 'A-001',
    participationStatus: 'expected',
    submissionStatus: 'submitted',
    workType: 'notebook',
    workSummary: 'Workbook p42',
    teacherReviewStatus: 'unreviewed',
    teacherFeedback: 'Good effort',
    score: null,
  };

  const renderReview = () =>
    render(
      <MemoryRouter initialEntries={['/teaching/assignments/a1']}>
        <Routes>
          <Route path="/teaching/assignments/:assignmentId" element={<AssignmentReviewPage />} />
        </Routes>
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    authState.schoolId = SCHOOL_ID;
    mocks.mockResolve.mockResolvedValue(TEACHER_ID);
    mocks.getAssignmentDetail.mockResolvedValue({ assignment, submissions: [submission] });
    mocks.reviewSubmission.mockImplementation(async (_id: string, review: any) => ({ ...submission, ...review }));
    mocks.createObservation.mockResolvedValue({ id: 'obs-1' });
    mocks.extractObservationDraft.mockResolvedValue({
      observationType: 'misconception',
      observationText: 'Struggles with equivalence.',
      suggestedFollowupFocus: 'Tape diagrams.',
      isAiDrafted: true,
      requiresHumanApproval: true,
      isGradingForbidden: true,
    });
    mocks.suggestIntervention.mockResolvedValue({
      studentId: 'stu-1',
      learningArea: 'Number',
      topicName: 'Fractions',
      reason: 'Misconception observed',
      strategyAction: 'Small-group reteach',
      targetOutcome: 'Converts confidently',
    });
    mocks.createIntervention.mockResolvedValue({ interventionId: 'int-1' });
    mocks.activateIntervention.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('reviewSubmission carries the resolved employee id', async () => {
    renderReview();
    await waitFor(() => expect(mocks.mockResolve).toHaveBeenCalledWith(SCHOOL_ID));
    await screen.findByText('Amina Kato');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.reviewSubmission).toHaveBeenCalled());
    const [, review] = mocks.reviewSubmission.mock.calls[0];
    expect(review.teacherId).toBe(TEACHER_ID);
    expect(JSON.stringify(review)).not.toContain(DEMO_TEACHER_ID);
  });

  it('approved AI observation + intervention writes carry the resolved id', async () => {
    renderReview();
    await screen.findByText('Amina Kato');
    await waitFor(() => expect(mocks.mockResolve).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Evidence/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /AI Evidence/i }));
    await waitFor(() => expect(mocks.extractObservationDraft).toHaveBeenCalled());
    expect(mocks.extractObservationDraft.mock.calls[0][0].teacherId).toBe(TEACHER_ID);
    fireEvent.click(await screen.findByRole('button', { name: /Approve & Record Evidence/i }));
    await waitFor(() => expect(mocks.createObservation).toHaveBeenCalled());
    expect(mocks.createObservation.mock.calls[0][0].teacherId).toBe(TEACHER_ID);
    fireEvent.click(await screen.findByRole('button', { name: /Suggest Next Step/i }));
    await waitFor(() => expect(mocks.suggestIntervention).toHaveBeenCalled());
    expect(mocks.suggestIntervention.mock.calls[0][0].teacherId).toBe(TEACHER_ID);
    fireEvent.click(await screen.findByRole('button', { name: /Accept Intervention/i }));
    await waitFor(() => expect(mocks.createIntervention).toHaveBeenCalled());
    expect(mocks.createIntervention.mock.calls[0][0].teacherId).toBe(TEACHER_ID);
    for (const m of [mocks.createObservation, mocks.createIntervention]) {
      expect(JSON.stringify(m.mock.calls)).not.toContain(DEMO_TEACHER_ID);
    }
  });

  it('blocks review/observation/intervention writes when identity is unresolvable', async () => {
    mocks.mockResolve.mockResolvedValue(null);
    renderReview();
    await screen.findByText('Amina Kato');
    await waitFor(() =>
      expect(screen.getByText(/sign in \/ resolve identity|resolve.*identity|sign in to resolve/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /AI Evidence/i })).toBeDisabled();
    expect(mocks.reviewSubmission).not.toHaveBeenCalled();
    expect(mocks.createObservation).not.toHaveBeenCalled();
    expect(mocks.createIntervention).not.toHaveBeenCalled();
  });

  it('blocks participation/submission status writes when identity is unresolvable', async () => {
    mocks.mockResolve.mockResolvedValue(null);
    renderReview();
    await screen.findByText('Amina Kato');
    await waitFor(() =>
      expect(screen.getAllByText(/sign in \/ resolve identity|resolve.*identity|sign in to resolve/i).length).toBeGreaterThan(0)
    );
    const [partSelect, statusSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(partSelect.value).toBe('expected');
    expect(statusSelect.value).toBe('submitted');
    expect(partSelect).toBeDisabled();
    expect(statusSelect).toBeDisabled();
    // Even if a change event is forced through, the handler guard blocks the write.
    fireEvent.change(partSelect, { target: { value: 'excused' } });
    fireEvent.change(statusSelect, { target: { value: 'missing' } });
    await waitFor(() => expect(mocks.mockResolve).toHaveBeenCalled());
    expect(mocks.updateSubmission).not.toHaveBeenCalled();
  });
});

describe('A3 lessonService fail-closed (no demo fallback rows)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('throws for an unknown tt-entry id instead of returning a demo row', async () => {
    await expect(getLessonContext('tt-entry-unknown-xyz', '2026-09-09')).rejects.toThrow(
      /Could not load lesson context/
    );
  });
});
