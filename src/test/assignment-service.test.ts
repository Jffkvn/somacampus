import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { assignmentService } from '../modules/teaching/assignmentService';
import { observationService } from '../modules/teaching/observationService';

describe('Assignment & Observation Services Suite (Phase 4)', () => {
  let tableResponses: Record<string, unknown> = {};
  let insertedRows: Record<string, any[]> = {};
  let updatedRows: Record<string, any[]> = {};

  const builderFor = (table: string) => {
    const respond = () => {
      const r: any = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: any = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.maybeSingle = () => respond();
    b.single = () => respond();
    b.insert = (payload: any) => {
      if (!insertedRows[table]) insertedRows[table] = [];
      insertedRows[table].push(payload);
      return b;
    };
    b.update = (payload: any) => {
      if (!updatedRows[table]) updatedRows[table] = [];
      updatedRows[table].push(payload);
      return b;
    };
    b.then = (res: any, rej: any) => respond().then(res, rej);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    tableResponses = {};
    insertedRows = {};
    updatedRows = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('creates assignment and provisions expected student participants from active enrolments', async () => {
    tableResponses.assignments = {
      data: {
        id: 'assign-new-1',
        school_id: 'school-1',
        teacher_id: 'teacher-1',
        class_id: 'class-5',
        stream_id: 'stream-blue',
        subject_id: 'subj-math',
        lesson_id: 'lesson-101',
        title: 'Fractions Intro Homework',
        instructions: 'Complete exercises 1-5.',
        assigned_date: '2026-09-05',
        due_date: '2026-09-08',
        submission_type: 'homework',
        evidence_track: 'diagnostic_evidence',
        max_score: null,
        status: 'published',
        classes: { name: 'Stage 5' },
        streams: { name: 'Blue' },
        subjects: { name: 'Mathematics' },
        teacher: { people: { first_name: 'David', last_name: 'Musoke' } },
      },
      error: null,
    };

    // 2 enrolled students in Stage 5 Blue
    tableResponses.student_enrolments = {
      data: [
        { student_id: 'student-1' },
        { student_id: 'student-2' },
      ],
      error: null,
    };

    const created = await assignmentService.createAssignment({
      schoolId: 'school-1',
      teacherId: 'teacher-1',
      classId: 'class-5',
      streamId: 'stream-blue',
      subjectId: 'subj-math',
      lessonId: 'lesson-101',
      title: 'Fractions Intro Homework',
      instructions: 'Complete exercises 1-5.',
      assignedDate: '2026-09-05',
      dueDate: '2026-09-08',
      submissionType: 'homework',
      evidenceTrack: 'diagnostic_evidence',
    });

    expect(created.id).toBe('assign-new-1');
    expect(created.title).toBe('Fractions Intro Homework');
    expect(created.teacherName).toBe('David Musoke');

    // Verify student_submissions were provisioned
    expect(insertedRows.student_submissions).toBeDefined();
    const subs = insertedRows.student_submissions[0];
    expect(subs).toHaveLength(2);
    expect(subs[0].student_id).toBe('student-1');
    expect(subs[0].participation_status).toBe('expected');
    expect(subs[0].submission_status).toBe('pending');
  });

  it('records teacher review, feedback and score on a submission', async () => {
    tableResponses.student_submissions = {
      data: {
        id: 'sub-1',
        school_id: 'school-1',
        assignment_id: 'assign-1',
        student_id: 'student-1',
        participation_status: 'expected',
        submission_status: 'submitted',
        work_type: 'notebook',
        teacher_review_status: 'reviewed',
        teacher_feedback: 'Well reasoned solutions.',
        score: 19,
        student: { admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
        reviewer: { people: { first_name: 'David', last_name: 'Musoke' } },
      },
      error: null,
    };

    const reviewed = await assignmentService.reviewSubmission('sub-1', {
      reviewStatus: 'reviewed',
      feedback: 'Well reasoned solutions.',
      score: 19,
      teacherId: 'teacher-1',
    });

    expect(reviewed.teacherReviewStatus).toBe('reviewed');
    expect(reviewed.score).toBe(19);
    expect(reviewed.teacherFeedback).toBe('Well reasoned solutions.');
    expect(reviewed.reviewedByTeacherName).toBe('David Musoke');

    expect(updatedRows.student_submissions).toBeDefined();
    expect(updatedRows.student_submissions[0].score).toBe(19);
  });

  it('records contextual teacher observation with full provenance', async () => {
    tableResponses.teacher_observations = {
      data: {
        id: 'obs-new',
        school_id: 'school-1',
        student_id: 'student-1',
        teacher_id: 'teacher-1',
        class_id: 'class-5',
        stream_id: 'stream-blue',
        subject_id: 'subj-math',
        lesson_id: 'lesson-101',
        observation_type: 'strength',
        observation_text: 'Quick grasp of mixed fractions during group work.',
        visibility: 'academic_team',
        observed_at: '2026-09-05T10:00:00Z',
        student: { admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
        teacher: { people: { first_name: 'David', last_name: 'Musoke' } },
        subjects: { name: 'Mathematics' },
        classes: { name: 'Stage 5' },
        streams: { name: 'Blue' },
      },
      error: null,
    };

    const obs = await observationService.createObservation({
      schoolId: 'school-1',
      studentId: 'student-1',
      teacherId: 'teacher-1',
      classId: 'class-5',
      streamId: 'stream-blue',
      subjectId: 'subj-math',
      lessonId: 'lesson-101',
      observationType: 'strength',
      observationText: 'Quick grasp of mixed fractions during group work.',
    });

    expect(obs.id).toBe('obs-new');
    expect(obs.observationType).toBe('strength');
    expect(obs.studentName).toBe('John Okello');
    expect(obs.teacherName).toBe('David Musoke');
    expect(obs.subjectName).toBe('Mathematics');
    expect(obs.className).toBe('Stage 5');
  });
});
