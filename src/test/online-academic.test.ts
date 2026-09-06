/**
 * Phase 9E Task 1 — academic integration for online sessions (RED).
 *
 * Covers:
 * (a) link session to curriculum objective (validates objective exists).
 * (b) create assignment FROM a session (linked via online_session_id,
 *     participants auto-provisioned as submitters).
 * (c) student submits work on a session assignment (reused submission path).
 * (d) teacher records observation with session ref.
 * (e) briefing for an upcoming session: prior session note + outstanding
 *     work + patterns.
 * (f) evidence from online work appears in the learner record through the
 *     SAME shared pipeline as school evidence.
 * (g) mock env → honest nulls, no DB calls.
 * (h) DB error → throws (never silent).
 *
 * Schema (migration 20260914000003): assignments.online_session_id and
 * teacher_observations.online_session_id, nullable FKs to online_sessions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { onlineAcademicService } from '../modules/online/onlineAcademicService';
import { studentService } from '../modules/students/studentService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

const TEACHER_A = '11111111-1111-1111-1111-111111111111';

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

function forceMockEnv() {
  process.env.NODE_ENV = 'test';
  (import.meta.env as any).VITE_SUPABASE_URL = PLACEHOLDER_URL;
}

type QResult = { data: any; error: any };

const writeCalls: { kind: string; table: string; payload?: unknown }[] = [];

/**
 * Chainable supabase query mock. Every filter/ordering method returns the
 * chain; `await chain` resolves the table result; .single()/.maybeSingle()
 * resolve it too. update/insert tracked in writeCalls.
 */
function mockQuery(table: string, result: QResult) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn((payload: unknown) => {
    writeCalls.push({ kind: 'update', table, payload });
    return chain;
  });
  chain.insert = vi.fn((payload: unknown) => {
    writeCalls.push({ kind: 'insert', table, payload });
    return chain;
  });
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = chain.single;
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

/**
 * Per-table results; a value may be a single QResult (repeated) or an
 * array of QResults consumed in call order (for same-table read→write).
 */
function mockFrom(resultByTable: Record<string, QResult | QResult[]>) {
  const queues = new Map<string, QResult[]>();
  (supabase.from as any).mockImplementation((table: string) => {
    const entry = resultByTable[table] ?? resultByTable['*'] ?? { data: [], error: null };
    if (Array.isArray(entry)) {
      if (!queues.has(table)) queues.set(table, [...entry]);
      const q = queues.get(table)!;
      return mockQuery(table, q.length > 0 ? q.shift()! : { data: [], error: null });
    }
    return mockQuery(table, entry);
  });
}

const SESSION = {
  id: 'ses-1',
  school_id: 's1',
  offering_id: 'off-1',
  teacher_id: TEACHER_A,
  status: 'IN_PROGRESS',
  scheduled_start: '2026-09-08T09:00:00Z',
  scheduled_end: '2026-09-08T10:00:00Z',
  session_type: 'lesson',
  join_url: 'https://meet.example/ses-1',
  curriculum_objective_id: null,
  session_note: null,
  offering: { id: 'off-1', title: 'Cambridge Y5 Maths Online' },
};

const PARTICIPANTS = [
  { id: 'part-1', session_id: 'ses-1', student_id: 'stud-1' },
  { id: 'part-2', session_id: 'ses-1', student_id: 'stud-2' },
];

const ASSIGNMENT_INPUT = {
  classId: 'class-1',
  subjectId: 'subj-math',
  title: 'Fractions follow-up',
  instructions: 'Complete Q1–Q6 from the session.',
  assignedDate: '2026-09-08',
  dueDate: '2026-09-10',
  submissionType: 'homework' as const,
  evidenceTrack: 'diagnostic_evidence' as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  writeCalls.length = 0;
  forceProductionEnv();
});

afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
});

describe('(a) link session to curriculum objective', () => {
  it('persists curriculum_objective_id on the owned session', async () => {
    mockFrom({
      online_sessions: [
        { data: SESSION, error: null },
        {
          data: { ...SESSION, curriculum_objective_id: 'obj-frac-1' },
          error: null,
        },
      ],
      learning_objectives: {
        data: { id: 'obj-frac-1', code: 'Ma5/3.1', title: 'Equivalent fractions' },
        error: null,
      },
    });
    const out = await onlineAcademicService.linkObjective('ses-1', TEACHER_A, 'obj-frac-1');
    expect(out).not.toBeNull();
    expect(out!.curriculumObjectiveId).toBe('obj-frac-1');
    const updates = writeCalls.filter((w) => w.table === 'online_sessions');
    expect(updates).toHaveLength(1);
    expect((updates[0].payload as any).curriculum_objective_id).toBe('obj-frac-1');
  });

  it('throws when the objective does not exist; nothing written', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION, error: null }],
      learning_objectives: { data: null, error: null },
    });
    await expect(
      onlineAcademicService.linkObjective('ses-1', TEACHER_A, 'obj-missing'),
    ).rejects.toThrow(/objective/i);
    expect(writeCalls).toHaveLength(0);
  });
});

describe('(b) create assignment FROM a session', () => {
  it('links via online_session_id and provisions participants as submitters', async () => {
    const ASSIGNMENT_ROW = {
      id: 'asg-1',
      school_id: 's1',
      teacher_id: TEACHER_A,
      class_id: 'class-1',
      stream_id: null,
      subject_id: 'subj-math',
      lesson_id: null,
      online_session_id: 'ses-1',
      title: 'Fractions follow-up',
      instructions: 'Complete Q1–Q6 from the session.',
      assigned_date: '2026-09-08',
      due_date: '2026-09-10',
      submission_type: 'homework',
      evidence_track: 'diagnostic_evidence',
      max_score: null,
      status: 'published',
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    };
    mockFrom({
      online_sessions: [{ data: SESSION, error: null }],
      assignments: [{ data: ASSIGNMENT_ROW, error: null }],
      online_session_participants: { data: PARTICIPANTS, error: null },
      student_submissions: { data: [], error: null },
    });
    const out = await onlineAcademicService.createSessionAssignment('ses-1', TEACHER_A, ASSIGNMENT_INPUT);
    expect(out).not.toBeNull();
    expect(out!.assignment.onlineSessionId).toBe('ses-1');
    expect(out!.assignment.title).toBe('Fractions follow-up');
    const inserts = writeCalls.filter((w) => w.kind === 'insert' && w.table === 'assignments');
    expect(inserts).toHaveLength(1);
    expect((inserts[0].payload as any).online_session_id).toBe('ses-1');
    const subInserts = writeCalls.filter(
      (w) => w.kind === 'insert' && w.table === 'student_submissions',
    );
    expect(subInserts).toHaveLength(1);
    const rows = (subInserts[0].payload as any[]) ?? [];
    expect(rows.map((r: any) => r.student_id).sort()).toEqual(['stud-1', 'stud-2']);
    expect(out!.provisionedCount).toBe(2);
  });
});

describe('(c) student submits work on a session assignment', () => {
  it('reuses the submission path and marks the session work submitted', async () => {
    mockFrom({
      assignments: {
        data: { id: 'asg-1', school_id: 's1', online_session_id: 'ses-1' },
        error: null,
      },
      student_submissions: [
        {
          data: {
            id: 'sub-1',
            school_id: 's1',
            assignment_id: 'asg-1',
            student_id: 'stud-1',
            participation_status: 'expected',
            submission_status: 'pending',
          },
          error: null,
        },
        {
          data: {
            id: 'sub-1',
            school_id: 's1',
            assignment_id: 'asg-1',
            student_id: 'stud-1',
            participation_status: 'expected',
            submission_status: 'submitted',
            submitted_at: '2026-09-08T11:00:00Z',
            work_summary: 'Q1–Q6 done, photo attached.',
            student: { admission_number: 'GCC-2024-001' },
          },
          error: null,
        },
      ],
    });
    const out = await onlineAcademicService.submitSessionWork('ses-1', 'stud-1', 'asg-1', {
      workSummary: 'Q1–Q6 done, photo attached.',
    });
    expect(out).not.toBeNull();
    expect(out!.submissionStatus).toBe('submitted');
    const updates = writeCalls.filter(
      (w) => w.kind === 'update' && w.table === 'student_submissions',
    );
    expect(updates).toHaveLength(1);
    expect((updates[0].payload as any).submission_status).toBe('submitted');
  });

  it('rejects work for an assignment from another session', async () => {
    mockFrom({
      assignments: {
        data: { id: 'asg-9', school_id: 's1', online_session_id: 'ses-other' },
        error: null,
      },
    });
    await expect(
      onlineAcademicService.submitSessionWork('ses-1', 'stud-1', 'asg-9', {
        workSummary: 'Sneaky submit.',
      }),
    ).rejects.toThrow(/session/i);
    expect(writeCalls).toHaveLength(0);
  });
});

describe('(d) teacher records observation with session ref', () => {
  it('persists the observation carrying online_session_id', async () => {
    const OBS_ROW = {
      id: 'obs-1',
      school_id: 's1',
      student_id: 'stud-1',
      teacher_id: TEACHER_A,
      class_id: 'class-1',
      stream_id: null,
      subject_id: 'subj-math',
      lesson_id: null,
      assignment_id: null,
      online_session_id: 'ses-1',
      observation_type: 'misconception',
      observation_text: 'Confused 3/4 with 6/8 during the live session.',
      visibility: 'academic_team',
      observed_at: '2026-09-08T09:30:00Z',
      created_at: '2026-09-08T09:31:00Z',
      updated_at: '2026-09-08T09:31:00Z',
    };
    mockFrom({
      online_sessions: [{ data: SESSION, error: null }],
      teacher_observations: [{ data: OBS_ROW, error: null }],
    });
    const out = await onlineAcademicService.recordSessionObservation('ses-1', TEACHER_A, {
      studentId: 'stud-1',
      classId: 'class-1',
      subjectId: 'subj-math',
      observationType: 'misconception',
      observationText: 'Confused 3/4 with 6/8 during the live session.',
    });
    expect(out).not.toBeNull();
    expect(out!.onlineSessionId).toBe('ses-1');
    expect(out!.observationType).toBe('misconception');
    const inserts = writeCalls.filter((w) => w.table === 'teacher_observations');
    expect(inserts).toHaveLength(1);
    expect((inserts[0].payload as any).online_session_id).toBe('ses-1');
  });

  it('blank observation text throws with nothing written', async () => {
    mockFrom({
      online_sessions: [{ data: SESSION, error: null }],
    });
    await expect(
      onlineAcademicService.recordSessionObservation('ses-1', TEACHER_A, {
        studentId: 'stud-1',
        classId: 'class-1',
        observationType: 'misconception',
        observationText: '   ',
      }),
    ).rejects.toThrow(/text/i);
    expect(writeCalls).toHaveLength(0);
  });
});

describe('(e) briefing for an upcoming session', () => {
  it('includes prior session note + outstanding work + patterns', async () => {
    const UPCOMING = { ...SESSION, id: 'ses-2', status: 'SCHEDULED', session_note: null };
    mockFrom({
      online_sessions: [
        { data: UPCOMING, error: null },
        {
          data: [
            { id: 'ses-1', session_note: 'Fractions recap went well — revisit Q4.', scheduled_start: '2026-09-01T09:00:00Z' },
          ],
          error: null,
        },
      ],
      assignments: {
        data: [{ id: 'asg-1', online_session_id: 'ses-1', title: 'Fractions follow-up' }],
        error: null,
      },
      student_submissions: {
        data: [
          { assignment_id: 'asg-1', student_id: 'stud-1', participation_status: 'expected', submission_status: 'pending' },
          { assignment_id: 'asg-1', student_id: 'stud-2', participation_status: 'expected', submission_status: 'submitted' },
        ],
        error: null,
      },
      teacher_observations: {
        data: [
          {
            id: 'obs-1',
            student_id: 'stud-1',
            observation_type: 'misconception',
            observation_text: 'Confused 3/4 with 6/8',
            observed_at: '2026-09-01T09:30:00Z',
          },
        ],
        error: null,
      },
    });
    const out = await onlineAcademicService.getSessionBriefing('ses-2', TEACHER_A);
    expect(out).not.toBeNull();
    expect(out!.priorNote).toBe('Fractions recap went well — revisit Q4.');
    expect(out!.outstandingCount).toBe(1);
    expect(out!.outstanding[0]).toMatchObject({ assignmentId: 'asg-1', studentId: 'stud-1' });
    expect(out!.recentObservations).toHaveLength(1);
    expect(out!.patternSummary).toMatch(/misconception/i);
  });
});

describe('(f) online evidence flows through the shared learner-record pipeline', () => {
  it('same evidence query returns school work and session work together', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      const respond = (payload: any) => {
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => Promise.resolve(payload);
        chain.single = () => Promise.resolve(payload);
        chain.then = (res: any, rej: any) => Promise.resolve(payload).then(res, rej);
        return chain;
      };
      if (table === 'students') {
        return respond({
          data: {
            id: 'stud-1',
            admission_number: 'GCC-2024-001',
            person: { first_name: 'John', last_name: 'Okello' },
          },
          error: null,
        });
      }
      if (table === 'student_submissions') {
        return respond({
          data: [
            {
              id: 'sub-phys',
              assignment_id: 'assign-physical',
              participation_status: 'expected',
              submission_status: 'submitted',
              work_type: 'written',
              score: 85,
              teacher_feedback: 'Strong geometry proofs.',
              created_at: '2026-09-04T10:00:00Z',
              assignment: {
                id: 'assign-physical',
                title: 'Mid-term Geometry Assessment',
                due_date: '2026-09-04',
                evidence_track: 'formal_graded',
                max_score: 100,
                submission_type: 'project',
                subjects: { name: 'Mathematics' },
              },
            },
            {
              id: 'sub-online',
              assignment_id: 'asg-1',
              participation_status: 'expected',
              submission_status: 'submitted',
              work_type: 'notebook',
              score: null,
              teacher_feedback: 'Good live-session follow-up.',
              created_at: '2026-09-08T11:00:00Z',
              assignment: {
                id: 'asg-1',
                online_session_id: 'ses-1',
                title: 'Fractions follow-up',
                due_date: '2026-09-10',
                evidence_track: 'diagnostic_evidence',
                max_score: null,
                submission_type: 'homework',
                subjects: { name: 'Mathematics' },
              },
            },
          ],
          error: null,
        });
      }
      return respond({ data: [], error: null });
    });
    const profile = await studentService.getStudentProfile('stud-1');
    expect(profile).not.toBeNull();
    const titles = [
      ...(profile!.academicEvidence?.formalAssessments ?? []).map((a) => a.title),
      ...(profile!.academicEvidence?.diagnosticEvidence ?? []).map((a) => a.title),
    ];
    expect(titles).toContain('Mid-term Geometry Assessment');
    expect(titles).toContain('Fractions follow-up');
  });
});

describe('(g) mock-env honest nulls', () => {
  it('no DB calls; every entry resolves null', async () => {
    forceMockEnv();
    await expect(onlineAcademicService.linkObjective('ses-1', TEACHER_A, 'obj-1')).resolves.toBeNull();
    await expect(
      onlineAcademicService.createSessionAssignment('ses-1', TEACHER_A, ASSIGNMENT_INPUT),
    ).resolves.toBeNull();
    await expect(
      onlineAcademicService.submitSessionWork('ses-1', 'stud-1', 'asg-1', {
        workSummary: 'x',
      }),
    ).resolves.toBeNull();
    await expect(
      onlineAcademicService.recordSessionObservation('ses-1', TEACHER_A, {
        studentId: 'stud-1',
        classId: 'class-1',
        observationType: 'strength',
        observationText: 'Great participation.',
      }),
    ).resolves.toBeNull();
    await expect(onlineAcademicService.getSessionBriefing('ses-2', TEACHER_A)).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('(h) DB error → throws', () => {
  it('session-read failure throws for link, create, observe, and briefing', async () => {
    mockFrom({ online_sessions: { data: null, error: new Error('DB down') } });
    await expect(
      onlineAcademicService.linkObjective('ses-1', TEACHER_A, 'obj-1'),
    ).rejects.toThrow();
    await expect(
      onlineAcademicService.createSessionAssignment('ses-1', TEACHER_A, ASSIGNMENT_INPUT),
    ).rejects.toThrow();
    await expect(
      onlineAcademicService.recordSessionObservation('ses-1', TEACHER_A, {
        studentId: 'stud-1',
        classId: 'class-1',
        observationType: 'strength',
        observationText: 'Great participation.',
      }),
    ).rejects.toThrow();
    await expect(
      onlineAcademicService.getSessionBriefing('ses-1', TEACHER_A),
    ).rejects.toThrow();
  });
});
