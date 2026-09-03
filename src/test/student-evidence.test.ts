import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { studentService } from '../modules/students/studentService';

const STUDENT_ID = 'student-uuid-1';

describe('Student Academic Evidence Aggregation (Phase 4)', () => {
  let tableResponses: Record<string, unknown> = {};

  const builderFor = (table: string) => {
    const respond = () => {
      const r: any = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: any = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.maybeSingle = () => respond();
    b.single = () => respond();
    b.then = (res: any, rej: any) => respond().then(res, rej);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    tableResponses = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('correctly isolates formal assessed work from diagnostic learning evidence', async () => {
    tableResponses.students = {
      data: {
        id: STUDENT_ID,
        admissionNumber: 'GCC-2024-001',
        person: { first_name: 'John', last_name: 'Okello' },
      },
      error: null,
    };
    tableResponses.student_enrolments = {
      data: { classes: { name: 'Stage 5' }, streams: { name: 'Blue' } },
      error: null,
    };
    tableResponses.student_attendance_records = { data: [], error: null };

    // 2 submissions: 1 formal graded test, 1 diagnostic homework
    tableResponses.student_submissions = {
      data: [
        {
          id: 'sub-1',
          assignment_id: 'assign-formal',
          participation_status: 'expected',
          submission_status: 'submitted',
          work_type: 'written',
          score: 85,
          teacher_feedback: 'Excellent work on geometry proofs.',
          created_at: '2026-09-04T10:00:00Z',
          assignment: {
            id: 'assign-formal',
            title: 'Mid-term Geometry Assessment',
            due_date: '2026-09-04',
            evidence_track: 'formal_graded',
            max_score: 100,
            submission_type: 'project',
            subjects: { name: 'Mathematics' },
          },
        },
        {
          id: 'sub-2',
          assignment_id: 'assign-diagnostic',
          participation_status: 'expected',
          submission_status: 'submitted',
          work_type: 'notebook',
          score: 18,
          teacher_feedback: 'Understood equivalent fractions.',
          created_at: '2026-09-05T08:30:00Z',
          assignment: {
            id: 'assign-diagnostic',
            title: 'Fractions Practice Worksheet',
            due_date: '2026-09-05',
            evidence_track: 'diagnostic_evidence',
            max_score: 20,
            submission_type: 'worksheet',
            subjects: { name: 'Mathematics' },
          },
        },
      ],
      error: null,
    };

    tableResponses.teacher_observations = {
      data: [
        {
          id: 'obs-1',
          observation_type: 'misconception',
          observation_text: 'Initial confusion with numerator reduction resolved through manipulatives.',
          observed_at: '2026-09-05T09:00:00Z',
          teacher: { people: { first_name: 'David', last_name: 'Musoke' } },
          subjects: { name: 'Mathematics' },
        },
      ],
      error: null,
    };

    const profile = await studentService.getStudentProfile(STUDENT_ID);
    expect(profile).not.toBeNull();
    expect(profile?.academicEvidence).toBeDefined();

    // 1. Formal assessments track contains ONLY formal_graded assignment
    const formal = profile!.academicEvidence!.formalAssessments;
    expect(formal).toHaveLength(1);
    expect(formal[0].title).toBe('Mid-term Geometry Assessment');
    expect(formal[0].score).toBe(85);
    expect(formal[0].maxScore).toBe(100);

    // 2. Diagnostic track contains diagnostic worksheet
    const diagnostic = profile!.academicEvidence!.diagnosticEvidence;
    expect(diagnostic).toHaveLength(1);
    expect(diagnostic[0].title).toBe('Fractions Practice Worksheet');
    expect(diagnostic[0].submissionType).toBe('worksheet');
    expect(diagnostic[0].teacherFeedback).toBe('Understood equivalent fractions.');
    // Diagnostic score exists on diagnostic item but NEVER in formalAssessments
    expect(diagnostic[0].score).toBe(18);

    // 3. Observations retain full provenance
    const obs = profile!.academicEvidence!.observations;
    expect(obs).toHaveLength(1);
    expect(obs[0].teacherName).toBe('David Musoke');
    expect(obs[0].type).toBe('misconception');
    expect(obs[0].text).toContain('Initial confusion with numerator reduction');
  });

  it('gracefully handles students with zero academic evidence or observations', async () => {
    tableResponses.students = {
      data: {
        id: 'new-student',
        admissionNumber: 'GCC-2024-999',
        person: { first_name: 'New', last_name: 'Student' },
      },
      error: null,
    };
    tableResponses.student_enrolments = {
      data: { classes: { name: 'Stage 5' }, streams: null },
      error: null,
    };
    tableResponses.student_attendance_records = { data: [], error: null };
    tableResponses.student_submissions = { data: [], error: null };
    tableResponses.teacher_observations = { data: [], error: null };

    const profile = await studentService.getStudentProfile('new-student');
    expect(profile).not.toBeNull();
    expect(profile?.academicEvidence?.formalAssessments).toHaveLength(0);
    expect(profile?.academicEvidence?.diagnosticEvidence).toHaveLength(0);
    expect(profile?.academicEvidence?.observations).toHaveLength(0);
  });
});
