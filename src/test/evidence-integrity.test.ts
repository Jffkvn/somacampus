/**
 * Phase C — Evidence Integrity (RED-first).
 *
 * Covers: intervention lifecycle (draft default, activate op, legal
 * transitions), observation provenance linkage, gradebook evidence-track
 * guard, briefing date predicate + timetable-entry scoping + no-mutation,
 * heuristic verify-only regression, privacy/archive regression, and the
 * grade-text stage-label drive-by ('Grade 10' passes, 'grade 85' rejected).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn().mockResolvedValue({ data: { user: { id: 'teacher-user-1' } }, error: null }),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: mockGetUser }, from: mockFrom },
}));

import { learningIntelligenceService } from '../modules/intelligence/learningIntelligenceService';
import { assignmentService } from '../modules/teaching/assignmentService';
import { ObservationDraftAiSchema } from '../modules/teaching/teachingAiSchema';

// ---------------------------------------------------------------------------
// Chainable supabase fake: records every op for no-mutation / predicate
// assertions. Per-table responders resolve terminal calls.
// ---------------------------------------------------------------------------
interface QueryLogEntry {
  table: string;
  op: string;
  args: any[];
}

interface FakeDb {
  log: QueryLogEntry[];
  inserts: Array<{ table: string; payload: any }>;
  updates: Array<{ table: string; payload: any }>;
  deletes: string[];
  fromTables: string[];
  responders: Record<string, (terminal: string, ops: string[]) => { data: any; error: any } | Promise<{ data: any; error: any }>>;
}

function createFakeDb(): FakeDb {
  const db: FakeDb = { log: [], inserts: [], updates: [], deletes: [], fromTables: [], responders: {} };
  mockFrom.mockImplementation((table: string) => {
    db.fromTables.push(table);
    const ops: string[] = [];
    const b: any = {};
    const rec = (op: string, args: any[]) => {
      db.log.push({ table, op, args });
      ops.push(op);
    };
    b.select = (...a: any[]) => { rec('select', a); return b; };
    b.eq = (...a: any[]) => { rec('eq', a); return b; };
    b.in = (...a: any[]) => { rec('in', a); return b; };
    b.order = (...a: any[]) => { rec('order', a); return b; };
    b.limit = (...a: any[]) => { rec('limit', a); return b; };
    b.gte = (...a: any[]) => { rec('gte', a); return b; };
    b.insert = (payload: any) => { rec('insert', [payload]); db.inserts.push({ table, payload }); return b; };
    b.update = (payload: any) => { rec('update', [payload]); db.updates.push({ table, payload }); return b; };
    b.delete = () => { rec('delete', []); db.deletes.push(table); return b; };
    const terminal = async (kind: string) => {
      const fn = db.responders[table];
      if (fn) return fn(kind, [...ops]);
      // Sensible defaults: inserts return an id, updates succeed, lists are empty.
      if (ops.includes('insert')) return { data: { id: `${table}-new-1` }, error: null };
      if (kind === 'then') {
        if (ops.includes('update')) return { data: [], error: null };
        return { data: [], error: null };
      }
      return { data: null, error: null };
    };
    b.maybeSingle = () => terminal('maybeSingle');
    b.single = () => terminal('single');
    b.then = (res: any, rej: any) => terminal('then').then(res, rej);
    return b;
  });
  return db;
}

const BASE_INTERVENTION_INPUT = {
  schoolId: 'school-1',
  studentId: 'student-1',
  teacherId: 'teacher-1',
  classId: 'class-1',
  subjectId: 'subject-1',
  learningArea: 'Fractions',
  reason: 'Repeated conversion errors',
  strategyAction: 'Small-group retrieval practice',
  targetOutcome: 'Independent conversion with 80%+ accuracy',
  targetDate: '2026-10-01',
};

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
// 1. Intervention lifecycle: draft default + active guard
// ---------------------------------------------------------------------------
describe('Phase C: intervention lifecycle — draft default', () => {
  it('createIntervention defaults to draft when status is omitted', async () => {
    const db = createFakeDb();
    await learningIntelligenceService.createIntervention({ ...BASE_INTERVENTION_INPUT });
    const iv = db.inserts.find((i) => i.table === 'interventions');
    expect(iv?.payload.status).toBe('draft');
  });

  it('createIntervention with explicit active but no observation evidence rejects', async () => {
    createFakeDb();
    await expect(
      learningIntelligenceService.createIntervention(
        { ...BASE_INTERVENTION_INPUT, status: 'active' },
        [{ type: 'submission', id: 'sub-1' }],
      ),
    ).rejects.toThrow(/observation/i);
  });

  it('createIntervention with explicit active + observation evidence + owning caller succeeds', async () => {
    const db = createFakeDb();
    db.responders.people = () => ({ data: { id: 'person-1' }, error: null });
    db.responders.employees = () => ({ data: { id: 'teacher-1' }, error: null });
    const res = await learningIntelligenceService.createIntervention(
      { ...BASE_INTERVENTION_INPUT, status: 'active' },
      [
        { type: 'observation', id: 'obs-1' },
        { type: 'submission', id: 'sub-1' },
      ],
    );
    expect(res.interventionId).toBeTruthy();
  });

  it('createIntervention with explicit active rejects when caller is not the intervention teacher', async () => {
    const db = createFakeDb();
    db.responders.people = () => ({ data: { id: 'person-1' }, error: null });
    db.responders.employees = () => ({ data: { id: 'teacher-other' }, error: null });
    await expect(
      learningIntelligenceService.createIntervention(
        { ...BASE_INTERVENTION_INPUT, status: 'active' },
        [{ type: 'observation', id: 'obs-1' }],
      ),
    ).rejects.toThrow(/activate|draft|owner|teacher/i);
    expect(db.inserts.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. activateIntervention op
// ---------------------------------------------------------------------------
describe('Phase C: activateIntervention', () => {
  it('draft → active succeeds with observation linkage + owning teacher', async () => {
    const db = createFakeDb();
    db.responders.interventions = (terminal) => {
      if (terminal === 'maybeSingle') {
        return { data: { id: 'iv-1', status: 'draft', teacher_id: 'teacher-1', school_id: 'school-1' }, error: null };
      }
      return { data: null, error: null };
    };
    db.responders.intervention_evidence = () => ({
      data: [{ evidence_type: 'observation', evidence_id: 'obs-1' }],
      error: null,
    });
    await learningIntelligenceService.activateIntervention('iv-1', 'teacher-1');
    expect(db.updates.some((u) => u.table === 'interventions' && u.payload.status === 'active')).toBe(true);
  });

  it('rejects activation by a non-owning teacher', async () => {
    const db = createFakeDb();
    db.responders.interventions = () => ({
      data: { id: 'iv-1', status: 'draft', teacher_id: 'teacher-1', school_id: 'school-1' },
      error: null,
    });
    db.responders.intervention_evidence = () => ({
      data: [{ evidence_type: 'observation', evidence_id: 'obs-1' }],
      error: null,
    });
    await expect(learningIntelligenceService.activateIntervention('iv-1', 'teacher-intruder')).rejects.toThrow();
    expect(db.updates.length).toBe(0);
  });

  it('rejects activation when status is not draft', async () => {
    const db = createFakeDb();
    db.responders.interventions = () => ({
      data: { id: 'iv-1', status: 'completed', teacher_id: 'teacher-1', school_id: 'school-1' },
      error: null,
    });
    await expect(learningIntelligenceService.activateIntervention('iv-1', 'teacher-1')).rejects.toThrow(/draft/i);
  });

  it('rejects activation without linked observation evidence', async () => {
    const db = createFakeDb();
    db.responders.interventions = () => ({
      data: { id: 'iv-1', status: 'draft', teacher_id: 'teacher-1', school_id: 'school-1' },
      error: null,
    });
    db.responders.intervention_evidence = () => ({ data: [{ evidence_type: 'submission', evidence_id: 'sub-1' }], error: null });
    await expect(learningIntelligenceService.activateIntervention('iv-1', 'teacher-1')).rejects.toThrow(/observation/i);
    expect(db.updates.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. updateInterventionStatus legal transitions
// ---------------------------------------------------------------------------
describe('Phase C: intervention status transitions', () => {
  const mockCurrent = (db: FakeDb, status: string) => {
    db.responders.interventions = (terminal) => {
      if (terminal === 'maybeSingle') {
        return { data: { id: 'iv-1', status, teacher_id: 'teacher-1' }, error: null };
      }
      return { data: null, error: null };
    };
  };

  it('rejects draft → active here (single activation path is activateIntervention)', async () => {
    const db = createFakeDb();
    mockCurrent(db, 'draft');
    await expect(learningIntelligenceService.updateInterventionStatus('iv-1', 'active')).rejects.toThrow(
      /activateIntervention/i,
    );
    expect(db.updates.length).toBe(0);
  });

  it('allows draft → abandoned', async () => {
    const db = createFakeDb();
    mockCurrent(db, 'draft');
    await learningIntelligenceService.updateInterventionStatus('iv-1', 'abandoned');
    expect(db.updates.some((u) => u.payload.status === 'abandoned')).toBe(true);
  });

  it('allows active → completed and active → abandoned', async () => {
    for (const next of ['completed', 'abandoned'] as const) {
      const db = createFakeDb();
      mockCurrent(db, 'active');
      await learningIntelligenceService.updateInterventionStatus('iv-1', next);
      expect(db.updates.some((u) => u.payload.status === next)).toBe(true);
    }
  });

  it('rejects active → draft', async () => {
    const db = createFakeDb();
    mockCurrent(db, 'active');
    await expect(learningIntelligenceService.updateInterventionStatus('iv-1', 'draft')).rejects.toThrow(/transition|illegal|invalid/i);
    expect(db.updates.length).toBe(0);
  });

  it('rejects completed → active', async () => {
    const db = createFakeDb();
    mockCurrent(db, 'completed');
    await expect(learningIntelligenceService.updateInterventionStatus('iv-1', 'active')).rejects.toThrow(/transition|illegal|invalid/i);
    expect(db.updates.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Gradebook guard: score only on formal_graded track
// ---------------------------------------------------------------------------
describe('Phase C: gradebook evidence-track guard', () => {
  const fullSubmissionRow = {
    id: 'sub-1',
    school_id: 'school-1',
    assignment_id: 'assign-1',
    student_id: 'student-1',
    participation_status: 'expected',
    submission_status: 'submitted',
    work_type: 'notebook',
    teacher_review_status: 'reviewed',
    teacher_feedback: 'Good effort',
    score: 19,
    student: { admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
    reviewer: { people: { first_name: 'David', last_name: 'Musoke' } },
  };

  it('rejects a score when the assignment track is diagnostic', async () => {
    const db = createFakeDb();
    db.responders.student_submissions = (_terminal, ops) => {
      if (ops.includes('update')) return { data: fullSubmissionRow, error: null };
      return { data: { assignment_id: 'assign-1' }, error: null };
    };
    db.responders.assignments = () => ({ data: { id: 'assign-1', evidence_track: 'diagnostic_evidence' }, error: null });
    await expect(
      assignmentService.reviewSubmission('sub-1', {
        reviewStatus: 'reviewed',
        feedback: 'Good effort',
        score: 19,
        teacherId: 'teacher-1',
      }),
    ).rejects.toThrow(/formal/i);
    expect(db.updates.length).toBe(0);
  });

  it('allows a score when the assignment track is formal_graded', async () => {
    const db = createFakeDb();
    db.responders.student_submissions = (_terminal, ops) => {
      if (ops.includes('update')) return { data: fullSubmissionRow, error: null };
      return { data: { assignment_id: 'assign-1' }, error: null };
    };
    db.responders.assignments = () => ({ data: { id: 'assign-1', evidence_track: 'formal_graded' }, error: null });
    const reviewed = await assignmentService.reviewSubmission('sub-1', {
      reviewStatus: 'reviewed',
      feedback: 'Good effort',
      score: 19,
      teacherId: 'teacher-1',
    });
    expect(reviewed.score).toBe(19);
  });

  it('allows feedback-only review on a diagnostic track (no score)', async () => {
    const db = createFakeDb();
    db.responders.student_submissions = (_terminal, ops) => {
      if (ops.includes('update')) return { data: { ...fullSubmissionRow, score: null }, error: null };
      return { data: { assignment_id: 'assign-1' }, error: null };
    };
    const reviewed = await assignmentService.reviewSubmission('sub-1', {
      reviewStatus: 'reviewed',
      feedback: 'Good effort',
      score: null,
      teacherId: 'teacher-1',
    });
    expect(reviewed.teacherFeedback).toBe('Good effort');
  });
});

// ---------------------------------------------------------------------------
// 5. Briefing: date predicate + entry scoping + no auto-mutation
// ---------------------------------------------------------------------------
function mockBriefingDb(db: FakeDb, opts?: { entry?: any }) {
  db.responders.classes = () => ({ data: { name: 'Stage 5 Blue' }, error: null });
  db.responders.subjects = () => ({ data: { name: 'Mathematics' }, error: null });
  db.responders.lessons = () => ({ data: null, error: null });
  db.responders.interventions = () => ({ data: [], error: null });
  db.responders.teacher_observations = () => ({ data: [], error: null });
  db.responders.assignments = () => ({ data: [], error: null });
  db.responders.timetable_entries = () => ({ data: opts?.entry ?? null, error: null });
}

describe('Phase C: pre-lesson briefing integrity', () => {
  it('applies an observation date predicate (last-30-days window)', async () => {
    const db = createFakeDb();
    mockBriefingDb(db);
    await learningIntelligenceService.getPreLessonBriefing('class-1', 'subject-1');
    const gteCalls = db.log.filter((e) => e.table === 'teacher_observations' && e.op === 'gte');
    expect(gteCalls.length).toBeGreaterThan(0);
    expect(gteCalls[0].args[0]).toBe('observed_at');
    const cutoff = new Date(gteCalls[0].args[1] as string).getTime();
    const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
    const twentyNineDaysMs = 29 * 24 * 60 * 60 * 1000;
    expect(Date.now() - cutoff).toBeGreaterThan(twentyNineDaysMs);
    expect(Date.now() - cutoff).toBeLessThan(thirtyOneDaysMs);
  });

  it('rejects a timetable entry scoped to another class/school', async () => {
    const db = createFakeDb();
    mockBriefingDb(db, {
      entry: { id: 'entry-1', class_id: 'class-OTHER', timetables: { school_id: 'school-1' } },
    });
    await expect(
      learningIntelligenceService.getPreLessonBriefing('class-1', 'subject-1', undefined, undefined, {
        timetableEntryId: 'entry-1',
        schoolId: 'school-1',
      }),
    ).rejects.toThrow(/timetable|scope|school|class/i);
    void db;
  });

  it('accepts a timetable entry belonging to the class/school', async () => {
    const db = createFakeDb();
    mockBriefingDb(db, {
      entry: { id: 'entry-1', class_id: 'class-1', timetables: { school_id: 'school-1' } },
    });
    const briefing = await learningIntelligenceService.getPreLessonBriefing('class-1', 'subject-1', undefined, undefined, {
      timetableEntryId: 'entry-1',
      schoolId: 'school-1',
    });
    expect(briefing.classId).toBe('class-1');
  });

  it('never auto-mutates (no insert/update/delete on the briefing path)', async () => {
    const db = createFakeDb();
    mockBriefingDb(db);
    await learningIntelligenceService.getPreLessonBriefing('class-1', 'subject-1');
    expect(db.inserts.length).toBe(0);
    expect(db.updates.length).toBe(0);
    expect(db.deletes.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Heuristics: verify-only regression + named thresholds
// ---------------------------------------------------------------------------
describe('Phase C: heuristic verify-only regression', () => {
  it('longitudinal profile path never mutates (read-only aggregation)', async () => {
    const db = createFakeDb();
    db.responders.students = () => ({
      data: { id: 'student-1', admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
      error: null,
    });
    db.responders.student_enrolments = () => ({ data: null, error: null });
    db.responders.student_attendance_records = () => ({ data: [], error: null });
    db.responders.student_submissions = () => ({ data: [], error: null });
    db.responders.teacher_observations = () => ({ data: [], error: null });
    db.responders.interventions = () => ({ data: [], error: null });
    const profile = await learningIntelligenceService.getLongitudinalProfile('student-1');
    expect(profile).not.toBeNull();
    expect(db.inserts.length).toBe(0);
    expect(db.updates.length).toBe(0);
    expect(db.deletes.length).toBe(0);
    const mutationOps = db.log.filter((e) => e.op === 'insert' || e.op === 'update' || e.op === 'delete');
    expect(mutationOps).toEqual([]);
  });

  it('names the heuristic policy thresholds as constants (>=2 evidence, <50 support)', async () => {
    const svc = (await import('../modules/intelligence/learningIntelligenceService')) as any;
    expect(svc.HEURISTIC_MIN_EVIDENCE_FOR_PATTERN).toBe(2);
    expect(svc.HEURISTIC_FORMAL_SUPPORT_THRESHOLD_PCT).toBe(50);
    expect(svc.HEURISTIC_MIN_CONCERN_OBSERVATIONS).toBe(2);
    expect(svc.HEURISTIC_MIN_STRENGTH_OBSERVATIONS).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Privacy / archive regression
// ---------------------------------------------------------------------------
describe('Phase C: privacy + archive regression', () => {
  it('AI evidence flows never touch guardian-contact surfaces', async () => {
    const db = createFakeDb();
    db.responders.students = () => ({
      data: { id: 'student-1', admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
      error: null,
    });
    db.responders.student_enrolments = () => ({ data: null, error: null });
    db.responders.student_attendance_records = () => ({ data: [], error: null });
    db.responders.student_submissions = () => ({ data: [], error: null });
    db.responders.teacher_observations = () => ({ data: [], error: null });
    db.responders.interventions = () => ({ data: [], error: null });
    db.responders.classes = () => ({ data: { name: 'Stage 5' }, error: null });
    db.responders.subjects = () => ({ data: { name: 'Maths' }, error: null });
    db.responders.lessons = () => ({ data: null, error: null });
    db.responders.assignments = () => ({ data: [], error: null });

    await learningIntelligenceService.getLongitudinalProfile('student-1');
    await learningIntelligenceService.getPreLessonBriefing('class-1', 'subject-1');

    const forbiddenTables = ['student_guardians', 'guardian_contact_for_viewer', 'admission_application_guardians'];
    for (const t of forbiddenTables) {
      expect(db.fromTables).not.toContain(t);
    }
    const selectArgs = db.log.filter((e) => e.op === 'select').map((e) => String(e.args[0] ?? ''));
    for (const sel of selectArgs) {
      expect(sel).not.toMatch(/guardian/i);
      expect(sel).not.toMatch(/phone|email|address/i);
    }
  });

  it('intervention flows use status transitions, never destructive deletes', async () => {
    const db = createFakeDb();
    db.responders.interventions = (terminal) => {
      if (terminal === 'single') return { data: { id: 'iv-1' }, error: null };
      return { data: { id: 'iv-1', status: 'draft', teacher_id: 'teacher-1', school_id: 'school-1' }, error: null };
    };
    db.responders.intervention_evidence = () => ({
      data: [{ evidence_type: 'observation', evidence_id: 'obs-1' }],
      error: null,
    });
    await learningIntelligenceService.createIntervention({ ...BASE_INTERVENTION_INPUT });
    await learningIntelligenceService.activateIntervention('iv-1', 'teacher-1');
    await learningIntelligenceService.updateInterventionStatus('iv-1', 'abandoned');
    expect(db.deletes).toEqual([]);
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/intelligence/learningIntelligenceService.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\.delete\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// 8. Drive-by: grade-text stage labels
// ---------------------------------------------------------------------------
describe('Phase C drive-by: grade-text stage labels', () => {
  it("accepts stage label 'Grade 10' and rejects score-like 'grade 85'", () => {
    const base = { observationType: 'misconception' as const };
    expect(
      ObservationDraftAiSchema.safeParse({
        ...base,
        observationText: 'Stage 5 pupil working at Grade 10 expectations for fractions.',
      }).success,
    ).toBe(true);
    expect(
      ObservationDraftAiSchema.safeParse({ ...base, observationText: 'earned grade 85 on the test' }).success,
    ).toBe(false);
  });

  it('edge mirror carries the same lowercase-only grade-number guard', () => {
    const edge = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/functions/ai-teaching-assistant/aiSchemas.ts'),
      'utf8',
    );
    expect(edge).toContain('NO_GRADE_NUMBER_CS');
  });
});
