/**
 * Phase D — Gradebook separation suite (MOCKED, fail-closed).
 *
 * Honesty label: MOCKED-UNIT. Proves the two halves of gradebook separation:
 *  1. Service write guard: a score on a diagnostic_evidence assignment is
 *     rejected BEFORE any write (formal_graded only).
 *  2. Aggregate separation: longitudinal formal averages and per-subject
 *     formal averages exclude diagnostic submissions entirely — a low
 *     diagnostic score cannot drag the formal average down, and diagnostic
 *     work is counted only as participation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn().mockResolvedValue({ data: { user: { id: 'teacher-user-1' } }, error: null }),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: mockGetUser }, from: mockFrom },
}));

import { assignmentService } from '../modules/teaching/assignmentService';
import { learningIntelligenceService } from '../modules/intelligence/learningIntelligenceService';

function stubLiveEnv() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
}

beforeEach(() => {
  stubLiveEnv();
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'teacher-user-1' } }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Chainable fake with per-table responders, recording every update.
// ---------------------------------------------------------------------------
interface UpdateCall {
  table: string;
  payload: any;
}

function createFakeDb() {
  const updates: UpdateCall[] = [];
  const responders: Record<string, (terminal: string, ops: string[]) => any> = {};
  mockFrom.mockImplementation((table: string) => {
    const ops: string[] = [];
    const b: any = {};
    const rec = (op: string, args: any[]) => {
      ops.push(op);
      void args;
      return b;
    };
    b.select = (...a: any[]) => rec('select', a);
    b.eq = (...a: any[]) => rec('eq', a);
    b.in = (...a: any[]) => rec('in', a);
    b.order = (...a: any[]) => rec('order', a);
    b.limit = (...a: any[]) => rec('limit', a);
    b.gte = (...a: any[]) => rec('gte', a);
    b.insert = (payload: any) => {
      ops.push('insert');
      void payload;
      return b;
    };
    b.update = (payload: any) => {
      ops.push('update');
      updates.push({ table, payload });
      return b;
    };
    const terminal = (kind: string) => {
      const fn = responders[table];
      if (fn) return Promise.resolve(fn(kind, [...ops]));
      if (ops.includes('update')) return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: [], error: null });
    };
    b.maybeSingle = () => terminal('maybeSingle');
    b.single = () => terminal('single');
    b.then = (res: any, rej: any) => terminal('then').then(res, rej);
    return b;
  });
  return { updates, responders };
}

describe('Phase D gradebook separation (mocked)', () => {
  it('rejects a score on a diagnostic_evidence assignment before any write', async () => {
    const db = createFakeDb();
    db.responders.student_submissions = (terminal) => {
      if (terminal === 'maybeSingle') return { data: { assignment_id: 'assign-1' }, error: null };
      return { data: null, error: null };
    };
    db.responders.assignments = () => ({
      data: { id: 'assign-1', evidence_track: 'diagnostic_evidence' },
      error: null,
    });

    await expect(
      assignmentService.reviewSubmission('sub-1', {
        reviewStatus: 'reviewed',
        feedback: 'Good qualitative effort',
        score: 19,
        teacherId: 'teacher-1',
      }),
    ).rejects.toThrow(/formal/i);
    expect(db.updates.length).toBe(0);
  });

  it('accepts a score on a formal_graded assignment', async () => {
    const db = createFakeDb();
    const reviewedRow = {
      id: 'sub-1',
      school_id: 'school-1',
      assignment_id: 'assign-1',
      student_id: 'student-1',
      participation_status: 'expected',
      submission_status: 'submitted',
      work_type: 'written',
      teacher_review_status: 'reviewed',
      teacher_feedback: 'Strong proofs',
      score: 85,
      student: { admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
      reviewer: { people: { first_name: 'David', last_name: 'Musoke' } },
    };
    db.responders.student_submissions = (terminal, ops) => {
      if (terminal === 'maybeSingle') return { data: { assignment_id: 'assign-1' }, error: null };
      if (ops.includes('update')) return { data: reviewedRow, error: null };
      return { data: [], error: null };
    };
    db.responders.assignments = () => ({
      data: { id: 'assign-1', evidence_track: 'formal_graded' },
      error: null,
    });

    const reviewed = await assignmentService.reviewSubmission('sub-1', {
      reviewStatus: 'reviewed',
      feedback: 'Strong proofs',
      score: 85,
      teacherId: 'teacher-1',
    });
    expect(reviewed.score).toBe(85);
  });

  it('formal aggregates exclude diagnostic submissions (low diagnostic score cannot drag the average)', async () => {
    const db = createFakeDb();
    db.responders.students = () => ({
      data: {
        id: 'student-1',
        admission_number: 'GCC-001',
        people: { first_name: 'John', last_name: 'Okello' },
      },
      error: null,
    });
    db.responders.student_enrolments = () => ({ data: null, error: null });
    db.responders.student_attendance_records = () => ({ data: [], error: null });
    db.responders.student_submissions = () => ({
      data: [
        {
          id: 'sub-formal',
          assignment_id: 'assign-formal',
          participation_status: 'expected',
          submission_status: 'submitted',
          score: 85,
          teacher_feedback: 'Excellent geometry proofs.',
          work_type: 'written',
          created_at: '2026-09-04T10:00:00Z',
          assignment: {
            id: 'assign-formal',
            title: 'Mid-term Geometry Assessment',
            due_date: '2026-09-04',
            evidence_track: 'formal_graded',
            max_score: 100,
            submission_type: 'project',
            subject_id: 'subject-math',
            subjects: { id: 'subject-math', name: 'Mathematics' },
          },
        },
        {
          id: 'sub-diagnostic',
          assignment_id: 'assign-diagnostic',
          participation_status: 'expected',
          submission_status: 'submitted',
          score: 4,
          teacher_feedback: 'Friction with unlike denominators.',
          work_type: 'notebook',
          created_at: '2026-09-05T08:30:00Z',
          assignment: {
            id: 'assign-diagnostic',
            title: 'Fractions Practice Worksheet',
            due_date: '2026-09-05',
            evidence_track: 'diagnostic_evidence',
            max_score: 20,
            submission_type: 'worksheet',
            subject_id: 'subject-math',
            subjects: { id: 'subject-math', name: 'Mathematics' },
          },
        },
      ],
      error: null,
    });
    db.responders.teacher_observations = () => ({ data: [], error: null });
    db.responders.interventions = () => ({ data: [], error: null });

    const profile = await learningIntelligenceService.getLongitudinalProfile('student-1');
    expect(profile).not.toBeNull();
    // 85/100 formal only: the diagnostic 4/20 must NOT pull this to ~74.
    expect(profile!.academicOverview.formalAveragePct).toBe(85);
    // Diagnostic work counts as participation (2 expected, 2 submitted/late → 100), never as marks.
    expect(profile!.academicOverview.diagnosticParticipationPct).toBe(100);
    const maths = profile!.subjectTrajectories.find((t) => t.subjectId === 'subject-math');
    expect(maths).toBeDefined();
    expect(maths!.formalAveragePct).toBe(85);
  });
});
