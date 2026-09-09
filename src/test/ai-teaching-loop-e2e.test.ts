/**
 * Phase D — AI teaching loop transactional E2E.
 *
 * Honesty labels:
 *  - LIVE-GATED (describe.skipIf): full loop against a real Supabase project
 *    with per-mutation DB assertions, steps 1–21. Runs ONLY when
 *    TEST_LIVE_DB=true with live anon + service-role creds. In this
 *    environment (no creds) it SKIPS cleanly with an explicit reason.
 *  - MOCKED-LOOP (always runs): all 21 steps against a mocked supabase
 *    client, asserting persisted payloads, provenance fields, gate
 *    rejections, and end-to-end op sequencing. AI drafts come from the
 *    deterministic test-mode seam and MUST be labelled
 *    provider:'synthetic-test' (asserted) — never presented as live AI.
 *
 * Step numbering below is the Phase-D test-authored sequence (no §14 plan
 * document exists in this repo); each step maps to one loop transition.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { hasLiveAdminCreds, hasLiveAnonCreds } from './helpers/supabaseEnv';

// ---------------------------------------------------------------------------
// LIVE-GATED section.
// ---------------------------------------------------------------------------
const LIVE_URL = process.env.VITE_SUPABASE_URL || '';
const LIVE_ANON = process.env.VITE_SUPABASE_ANON_KEY || '';
const LIVE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const LIVE_SCHOOL = process.env.TEST_E2E_SCHOOL_ID || '22222222-2222-2222-2222-222222222222';
const liveReady = hasLiveAnonCreds(LIVE_URL, LIVE_ANON) && hasLiveAdminCreds(LIVE_URL, LIVE_SERVICE);
const LIVE_SKIP_REASON =
  'LIVE-GATED loop E2E skipped: TEST_LIVE_DB !== "true" or live Supabase creds absent (no network/creds in this env). Full state-transition proof lives in the MOCKED-LOOP test below.';

describe.skipIf(!liveReady)(`LIVE-GATED loop E2E — ${LIVE_SKIP_REASON}`, () => {
  const runTag = `TEST_E2E_${Date.now()}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = liveReady ? createClient(LIVE_URL, LIVE_SERVICE, { auth: { persistSession: false } }) : null;

  async function cleanupLiveRows(): Promise<void> {
    if (!admin) return;
    try {
      const { data: ivs } = await admin
        .from('interventions')
        .select('id')
        .eq('school_id', LIVE_SCHOOL)
        .like('learning_area', `${runTag}%`);
      if (ivs && ivs.length > 0) {
        const ivIds = ivs.map((i: any) => i.id);
        await admin.from('intervention_evidence').delete().in('intervention_id', ivIds);
      }
      await admin.from('interventions').delete().eq('school_id', LIVE_SCHOOL).like('learning_area', `${runTag}%`);
      await admin.from('teacher_observations').delete().eq('school_id', LIVE_SCHOOL).like('observation_text', `${runTag}%`);
      await admin.from('student_submissions').delete().eq('school_id', LIVE_SCHOOL).like('work_summary', `${runTag}%`);
      await admin.from('assignments').delete().eq('school_id', LIVE_SCHOOL).like('title', `${runTag}%`);
    } catch {
      // Best-effort teardown of test run rows
    }
  }

  afterEach(async () => {
    await cleanupLiveRows();
  });

  it('transactional full loop, steps 1-21, with per-mutation DB assertions', async () => {
    // Resolve one seeded teacher / class / subject / student row.
    const { data: teacher } = await admin.from('employees').select('id').eq('school_id', LIVE_SCHOOL).limit(1).maybeSingle();
    const { data: cls } = await admin.from('classes').select('id').eq('school_id', LIVE_SCHOOL).limit(1).maybeSingle();
    const { data: subj } = await admin.from('subjects').select('id').limit(1).maybeSingle();
    const { data: enrolment } = await admin
      .from('student_enrolments')
      .select('student_id')
      .eq('school_id', LIVE_SCHOOL)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    const student = enrolment ? { id: enrolment.student_id } : null;
    if (!teacher || !cls || !subj || !student) {
      throw new Error('LIVE E2E infra: seeded school/teacher/class/subject/student rows not found.');
    }

    // 1-3. Draft persists with provenance fields.
    const { data: draft, error: draftErr } = await admin
      .from('assignments')
      .insert({
        school_id: LIVE_SCHOOL,
        teacher_id: teacher.id,
        class_id: cls.id,
        subject_id: subj.id,
        title: `${runTag} Fractions Practice`,
        instructions: 'Complete equivalent-fraction conversions with tape diagrams.',
        assigned_date: '2026-09-19',
        due_date: '2026-09-26',
        submission_type: 'homework',
        evidence_track: 'diagnostic_evidence',
        status: 'draft',
        is_ai_drafted: true,
        requires_human_approval: true,
        approval_state: 'unreviewed',
        curriculum_objective_code: '5Nn.01',
      })
      .select('*')
      .single();
    expect(draftErr).toBeNull();
    expect(draft.is_ai_drafted).toBe(true);
    expect(draft.approval_state).toBe('unreviewed');
    expect(draft.curriculum_objective_code).toBe('5Nn.01');

    // 4-5. Premature publish REJECTED by the DB publication gate (negative).
    const { error: prematureErr } = await admin
      .from('assignments')
      .update({ status: 'published' })
      .eq('id', draft.id);
    expect(prematureErr).not.toBeNull();

    // 6-7. Explicit teacher approval publishes; assert published row.
    const now = new Date().toISOString();
    const { data: published, error: pubErr } = await admin
      .from('assignments')
      .update({
        approval_state: 'approved',
        ai_draft_approved_by: teacher.id,
        ai_draft_approved_at: now,
        status: 'published',
      })
      .eq('id', draft.id)
      .select('*')
      .single();
    expect(pubErr).toBeNull();
    expect(published.status).toBe('published');
    expect(published.ai_draft_approved_by).toBe(teacher.id);

    // 8-9. Submission captured with teacher-entered work summary.
    const { data: sub, error: subErr } = await admin
      .from('student_submissions')
      .insert({
        school_id: LIVE_SCHOOL,
        assignment_id: draft.id,
        student_id: student.id,
        participation_status: 'expected',
        submission_status: 'submitted',
        work_type: 'notebook',
        work_summary: `${runTag} learner showed friction converting unlike denominators in Q5-7.`,
        teacher_review_status: 'unreviewed',
      })
      .select('*')
      .single();
    expect(subErr).toBeNull();
    expect(sub.submission_status).toBe('submitted');

    // 10-12. Extracted observation persists with NO grade fields.
    const { data: obs, error: obsErr } = await admin
      .from('teacher_observations')
      .insert({
        school_id: LIVE_SCHOOL,
        student_id: student.id,
        teacher_id: teacher.id,
        class_id: cls.id,
        subject_id: subj.id,
        assignment_id: draft.id,
        observation_type: 'misconception',
        observation_text: `${runTag} friction converting unlike denominators; uses tape diagrams inconsistently.`,
      })
      .select('*')
      .single();
    expect(obsErr).toBeNull();
    const obsKeys = Object.keys(obs as Record<string, unknown>);
    expect(obsKeys).not.toContain('score');
    expect(obsKeys).not.toContain('grade');
    expect(String((obs as Record<string, unknown>).observation_text)).not.toMatch(/\b\d+%\b/);

    // 13-15. Suggestion draft created (status draft), never auto-active.
    const { data: ivDraft, error: ivErr } = await admin
      .from('interventions')
      .insert({
        school_id: LIVE_SCHOOL,
        student_id: student.id,
        teacher_id: teacher.id,
        class_id: cls.id,
        subject_id: subj.id,
        learning_area: `${runTag}_Fractions`,
        reason: `${runTag} approved observations cite friction with 5Nn.01.`,
        strategy_action: 'Structured 15-minute small-group retrieval practice twice weekly.',
        target_outcome: 'Independent conversion with 80%+ accuracy.',
        target_date: '2026-10-03',
        status: 'draft',
      })
      .select('*')
      .single();
    expect(ivErr).toBeNull();
    expect(ivDraft.status).toBe('draft');

    // 16-18. Explicit activation → active row with evidence linkage.
    await admin.from('intervention_evidence').insert([
      { school_id: LIVE_SCHOOL, intervention_id: ivDraft.id, evidence_type: 'observation', evidence_id: obs.id },
      { school_id: LIVE_SCHOOL, intervention_id: ivDraft.id, evidence_type: 'submission', evidence_id: sub.id },
    ]);
    const { data: ivActive, error: actErr } = await admin
      .from('interventions')
      .update({ status: 'active' })
      .eq('id', ivDraft.id)
      .select('*')
      .single();
    expect(actErr).toBeNull();
    expect(ivActive.status).toBe('active');

    // 19-21. Briefing surfaces the evidence + intervention.
    const { data: briefingIvs } = await admin
      .from('interventions')
      .select('id, reason, learning_area')
      .eq('class_id', cls.id)
      .eq('subject_id', subj.id)
      .in('status', ['active', 'draft']);
    expect((briefingIvs as unknown[]).length).toBeGreaterThan(0);
    const { data: briefingObs } = await admin
      .from('teacher_observations')
      .select('id, observation_text')
      .eq('class_id', cls.id)
      .eq('subject_id', subj.id)
      .limit(10);
    expect((briefingObs as unknown[]).length).toBeGreaterThan(0);
    expect(JSON.stringify(briefingIvs)).toContain(runTag);
  });
});

// ---------------------------------------------------------------------------
// MOCKED-LOOP section (always runs): all 21 steps, payloads + sequencing.
// ---------------------------------------------------------------------------
const { mockFrom, mockGetUser, mockInvoke } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn().mockResolvedValue({ data: { user: { id: 'teacher-user-1' } }, error: null }),
  mockInvoke: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: mockGetUser }, from: mockFrom, functions: { invoke: mockInvoke } },
}));

import { teachingAiService } from '../modules/teaching/teachingAiService';
import { assignmentService } from '../modules/teaching/assignmentService';
import { observationService } from '../modules/teaching/observationService';
import { learningIntelligenceService } from '../modules/intelligence/learningIntelligenceService';
import { validateAssignmentPayload } from '../modules/teaching/assignmentDomain';

const S = {
  school: 'school-1',
  teacher: 'teacher-1',
  class: 'class-1',
  stream: 'stream-1',
  subject: 'subject-math',
  student: 'student-1',
  resource: 'res-1',
  assignment: 'assign-1',
  submission: 'sub-1',
  observation: 'obs-1',
  intervention: 'iv-1',
};

interface OpLog {
  seq: number;
  table: string;
  op: string;
}

function createLoopDb() {
  const log: OpLog[] = [];
  const inserts: Array<{ table: string; payload: any }> = [];
  const updates: Array<{ table: string; payload: any }> = [];
  let seq = 0;
  let interventionStatus: 'draft' | 'active' = 'draft';

  const draftRow = () => ({
    id: S.assignment,
    school_id: S.school,
    teacher_id: S.teacher,
    class_id: S.class,
    stream_id: S.stream,
    subject_id: S.subject,
    title: 'Stage 5 Mathematics: Equivalent Fractions Practice',
    instructions: 'Complete conversions with tape diagrams.',
    assigned_date: '2026-09-19',
    due_date: '2026-09-26',
    submission_type: 'homework',
    evidence_track: 'diagnostic_evidence',
    max_score: null,
    status: 'draft',
    is_ai_drafted: true,
    requires_human_approval: true,
    approval_state: 'unreviewed',
    ai_draft_approved_by: null,
    ai_draft_approved_at: null,
    curriculum_objective_code: '5Nn.01',
    curriculum_objective_title: 'Equivalent fractions',
    resource_id_used: S.resource,
    created_at: '2026-09-19T10:00:00Z',
    updated_at: '2026-09-19T10:00:00Z',
  });

  const submittedRow = () => ({
    id: S.submission,
    school_id: S.school,
    assignment_id: S.assignment,
    student_id: S.student,
    participation_status: 'expected',
    submission_status: 'submitted',
    submitted_at: '2026-09-20T09:00:00Z',
    work_type: 'notebook',
    work_summary: 'Learner showed friction converting unlike denominators in Q5-7.',
    work_reference_location: null,
    work_metadata: null,
    teacher_review_status: 'unreviewed',
    teacher_feedback: null,
    score: null,
    reviewed_by_teacher_id: null,
    reviewed_at: null,
    created_at: '2026-09-20T09:00:00Z',
    updated_at: '2026-09-20T09:00:00Z',
    student: { admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
    reviewer: null,
  });

  const obsRow = () => ({
    id: S.observation,
    school_id: S.school,
    student_id: S.student,
    studentName: undefined,
    teacher_id: S.teacher,
    class_id: S.class,
    online_session_id: null,
    stream_id: S.stream,
    subject_id: S.subject,
    lesson_id: null,
    assignment_id: S.assignment,
    observation_type: 'misconception',
    observation_text: 'Learner demonstrates friction converting unlike denominators in Q5-7.',
    visibility: 'academic_team',
    observed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    teacher: { people: { first_name: 'David', last_name: 'Musoke' } },
    student: { admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
    subjects: { id: S.subject, name: 'Mathematics' },
    students: { people: { first_name: 'John', last_name: 'Okello' } },
    classes: { name: 'Stage 5 Blue' },
    streams: { name: 'Blue' },
  });

  const interventionRow = (status: 'draft' | 'active') => ({
    id: S.intervention,
    school_id: S.school,
    student_id: S.student,
    teacher_id: S.teacher,
    class_id: S.class,
    stream_id: S.stream,
    subject_id: S.subject,
    learning_area: 'Mathematics',
    topic_name: 'Equivalent Fractions',
    curriculum_objective_ref: null,
    reason: 'Approved observations cite friction with 5Nn.01.',
    strategy_action: 'Structured 15-minute small-group retrieval practice twice weekly.',
    target_outcome: 'Independent conversion with 80%+ accuracy.',
    start_date: '2026-09-19',
    target_date: '2026-10-03',
    status,
    outcome: null,
    outcome_notes: null,
    follow_up_notes: null,
    created_at: '2026-09-19T12:00:00Z',
    updated_at: '2026-09-19T12:00:00Z',
    teacher: { people: { first_name: 'David', last_name: 'Musoke' } },
    subjects: { name: 'Mathematics' },
    classes: { name: 'Stage 5 Blue' },
    students: { id: S.student, admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
    evidence: [{ evidence_type: 'observation', evidence_id: S.observation }],
  });

  const formalSubmission = {
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
      subject_id: S.subject,
      subjects: { id: S.subject, name: 'Mathematics' },
    },
  };

  mockFrom.mockImplementation((table: string) => {
    const ops: string[] = [];
    const b: any = {};
    const rec = (op: string) => {
      ops.push(op);
      log.push({ seq: seq++, table, op });
      return b;
    };
    b.select = () => rec('select');
    b.eq = () => rec('eq');
    b.in = () => rec('in');
    b.order = () => rec('order');
    b.limit = () => rec('limit');
    b.gte = () => rec('gte');
    b.insert = (payload: any) => {
      rec('insert');
      inserts.push({ table, payload });
      return b;
    };
    b.update = (payload: any) => {
      rec('update');
      updates.push({ table, payload });
      return b;
    };
    const terminal = (kind: string): Promise<{ data: any; error: any }> => {
      if (table === 'assignments') {
        if (ops.includes('insert')) return Promise.resolve({ data: draftRow(), error: null });
        if (ops.includes('update'))
          return Promise.resolve({
            data: { ...draftRow(), status: 'published', approval_state: 'approved', ai_draft_approved_by: S.teacher },
            error: null,
          });
        if (kind === 'maybeSingle')
          return Promise.resolve({ data: { id: S.assignment, evidence_track: 'diagnostic_evidence' }, error: null });
        return Promise.resolve({ data: [], error: null });
      }
      if (table === 'student_enrolments') {
        if (kind === 'maybeSingle') return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: [], error: null });
      }
      if (table === 'student_submissions') {
        if (kind === 'maybeSingle') return Promise.resolve({ data: { assignment_id: S.assignment }, error: null });
        if (kind === 'single') {
          const last = [...updates].reverse().find((u) => u.table === 'student_submissions');
          const row = submittedRow();
          if (last?.payload) {
            if (typeof last.payload.teacher_feedback !== 'undefined') row.teacher_feedback = last.payload.teacher_feedback;
            if (typeof last.payload.teacher_review_status !== 'undefined') row.teacher_review_status = last.payload.teacher_review_status;
            if (typeof last.payload.score !== 'undefined') row.score = last.payload.score;
          }
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve({ data: [formalSubmission, { ...submittedRow(), assignment: { id: S.assignment, title: 'Fractions Practice', due_date: '2026-09-26', evidence_track: 'diagnostic_evidence', max_score: 20, submission_type: 'homework', subject_id: S.subject, subjects: { id: S.subject, name: 'Mathematics' } } }], error: null });
      }
      if (table === 'teacher_observations') {
        if (kind === 'single') return Promise.resolve({ data: obsRow(), error: null });
        return Promise.resolve({ data: [obsRow()], error: null });
      }
      if (table === 'interventions') {
        if (kind === 'single') return Promise.resolve({ data: { id: S.intervention }, error: null });
        if (kind === 'maybeSingle')
          return Promise.resolve({
            data: { id: S.intervention, status: interventionStatus, teacher_id: S.teacher, school_id: S.school },
            error: null,
          });
        return Promise.resolve({ data: [interventionRow(interventionStatus)], error: null });
      }
      if (table === 'intervention_evidence') {
        if (kind === 'single' || ops.includes('insert')) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: [{ evidence_type: 'observation', evidence_id: S.observation }], error: null });
      }
      if (table === 'classes') return Promise.resolve({ data: { name: 'Stage 5 Blue' }, error: null });
      if (table === 'subjects') return Promise.resolve({ data: { name: 'Mathematics' }, error: null });
      if (table === 'lessons') return Promise.resolve({ data: null, error: null });
      if (table === 'students')
        return Promise.resolve({
          data: { id: S.student, admission_number: 'GCC-001', people: { first_name: 'John', last_name: 'Okello' } },
          error: null,
        });
      if (table === 'student_attendance_records') return Promise.resolve({ data: [], error: null });
      if (table === 'school_resources') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: [], error: null });
    };
    b.maybeSingle = () => terminal('maybeSingle');
    b.single = () => terminal('single');
    b.then = (res: any, rej: any) => terminal('then').then(res, rej);
    return b;
  });

  return {
    log,
    inserts,
    updates,
    activate: () => {
      interventionStatus = 'active';
    },
  };
}

describe('MOCKED-LOOP teaching loop E2E (mocked supabase, synthetic-test seam)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'teacher-user-1' } }, error: null });
    mockInvoke.mockRejectedValue(new Error('edge unavailable (mocked loop: synthetic-test seam)'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('all 21 steps: draft → gate → publish → submission → evidence → intervention → briefing', async () => {
    const db = createLoopDb();

    // STEP 1 — AI generates a grounded draft (synthetic-test seam, honestly labelled).
    const aiDraft = await teachingAiService.generateAssignmentDraft({
      objectiveCode: '5Nn.01',
      lessonContext: {
        schoolId: S.school,
        teacherId: S.teacher,
        classId: S.class,
        className: 'Stage 5 Blue',
        streamId: S.stream,
        streamName: 'Blue',
        subjectId: S.subject,
        subjectName: 'Mathematics',
        teacherName: 'Mr. David Musoke',
      },
    });
    expect(aiDraft.provider).toBe('synthetic-test');
    expect(aiDraft.isAiDrafted).toBe(true);
    expect(aiDraft.requiresHumanApproval).toBe(true);
    expect(aiDraft.status).toBe('draft');
    expect(aiDraft.approvalState).toBe('unreviewed');
    expect(aiDraft.grounding.curriculumObjective.code).toBe('5Nn.01');

    // STEP 2 — Draft persists with provenance fields.
    const persisted = await assignmentService.createAssignment({
      schoolId: S.school,
      teacherId: S.teacher,
      classId: S.class,
      streamId: S.stream,
      subjectId: S.subject,
      title: aiDraft.title,
      instructions: aiDraft.instructions,
      assignedDate: '2026-09-19',
      dueDate: '2026-09-26',
      submissionType: 'homework',
      evidenceTrack: 'diagnostic_evidence',
      status: 'draft',
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvalState: 'unreviewed',
      curriculumObjectiveCode: '5Nn.01',
      curriculumObjectiveTitle: 'Equivalent fractions',
      resourceIdUsed: S.resource,
    });
    expect(persisted.id).toBe(S.assignment);
    const draftInsert = db.inserts.find((i) => i.table === 'assignments');
    expect(draftInsert?.payload.is_ai_drafted).toBe(true);
    expect(draftInsert?.payload.requires_human_approval).toBe(true);
    expect(draftInsert?.payload.approval_state).toBe('unreviewed');
    expect(draftInsert?.payload.curriculum_objective_code).toBe('5Nn.01');
    expect(draftInsert?.payload.resource_id_used).toBe(S.resource);

    // STEP 3 — Persisted draft row carries approval provenance, unpublished.
    expect(persisted.approvalState).toBe('unreviewed');
    expect(persisted.status).toBe('draft');
    expect(persisted.aiDraftApprovedBy).toBeNull();

    // STEP 4 — Premature publish REJECTED by the domain gate (negative).
    const premature = validateAssignmentPayload({
      schoolId: S.school,
      teacherId: S.teacher,
      classId: S.class,
      subjectId: S.subject,
      title: 'x',
      instructions: 'y',
      assignedDate: '2026-09-19',
      dueDate: '2026-09-26',
      submissionType: 'homework',
      evidenceTrack: 'diagnostic_evidence',
      status: 'published',
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvalState: 'unreviewed',
    });
    expect(premature.isValid).toBe(false);

    // STEP 5 — "Approved" without a teacher identity is also rejected (negative).
    const noTeacher = validateAssignmentPayload({
      schoolId: S.school,
      teacherId: S.teacher,
      classId: S.class,
      subjectId: S.subject,
      title: 'x',
      instructions: 'y',
      assignedDate: '2026-09-19',
      dueDate: '2026-09-26',
      submissionType: 'homework',
      evidenceTrack: 'diagnostic_evidence',
      status: 'published',
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvalState: 'approved',
      aiDraftApprovedBy: null,
    });
    expect(noTeacher.isValid).toBe(false);

    // STEP 6 — Explicit teacher approval publishes (single gated path).
    await expect(assignmentService.approveAndPublishAssignment(S.assignment, '')).rejects.toThrow();
    const published = await assignmentService.approveAndPublishAssignment(S.assignment, S.teacher);
    const publishUpdate = db.updates.find((u) => u.table === 'assignments');
    expect(publishUpdate?.payload.approval_state).toBe('approved');
    expect(publishUpdate?.payload.ai_draft_approved_by).toBe(S.teacher);
    expect(publishUpdate?.payload.status).toBe('published');

    // STEP 7 — Published row asserted.
    expect(published.status).toBe('published');
    expect(published.aiDraftApprovedBy).toBe(S.teacher);

    // STEP 8 — Student work captured (text-only summary, filing label notebook).
    const submission = await assignmentService.updateSubmission(S.submission, {
      submissionStatus: 'submitted',
      workType: 'notebook',
      workSummary: 'Learner showed friction converting unlike denominators in Q5-7.',
    });
    expect(submission.submissionStatus).toBe('submitted');
    const subUpdate = db.updates.find((u) => u.table === 'student_submissions');
    expect(subUpdate?.payload.work_summary).toContain('friction');

    // STEP 9 — AI extracts a qualitative draft: no grading, ever.
    const extract = await teachingAiService.extractObservationDraftFromWork({
      assignmentTitle: published.title,
      objectiveCode: '5Nn.01',
      objectiveDescription: 'Equivalent fractions',
      workType: 'notebook',
      workSummary: 'Learner showed friction converting unlike denominators in Q5-7.',
      schoolId: S.school,
      teacherId: S.teacher,
      classId: S.class,
      streamId: S.stream,
      subjectId: S.subject,
      studentId: S.student,
      resourceIds: [S.resource],
    });
    expect(extract.isGradingForbidden).toBe(true);
    expect(extract.observationText).not.toMatch(/\b\d+%\b/);
    expect(extract.observationText).not.toMatch(/\bgrade [A-F]\b/i);
    const extractKeys = Object.keys(extract as unknown as Record<string, unknown>).join(',');
    expect(extractKeys).not.toMatch(/score|grade|mark|percentage|diagnos/i);

    // STEP 10 — Extraction payload was text-only (no image/photo/vision bytes).
    const extractCall = mockInvoke.mock.calls.find(
      (c) => (c[1] as any)?.body?.action === 'extract_work_observation',
    );
    expect(extractCall).toBeDefined();
    const extractPayload = (extractCall![1] as any).body.payload as Record<string, unknown>;
    expect(typeof extractPayload.workSummary).toBe('string');
    expect('photoBytes' in extractPayload).toBe(false);
    expect('imageData' in extractPayload).toBe(false);
    expect('visionInput' in extractPayload).toBe(false);

    // STEP 11 — Teacher approves the observation; provenance linkage persisted.
    const approved = await observationService.createObservation({
      schoolId: S.school,
      studentId: S.student,
      teacherId: S.teacher,
      classId: S.class,
      streamId: S.stream,
      subjectId: S.subject,
      assignmentId: S.assignment,
      observationType: extract.observationType,
      observationText: extract.observationText,
    });
    expect(approved.id).toBe(S.observation);
    const obsInsert = db.inserts.find((i) => i.table === 'teacher_observations');
    expect(obsInsert?.payload.student_id).toBe(S.student);
    expect(obsInsert?.payload.teacher_id).toBe(S.teacher);
    expect(obsInsert?.payload.assignment_id).toBe(S.assignment);
    expect(obsInsert?.payload.subject_id).toBe(S.subject);

    // STEP 12 — Persisted observation row carries NO grade fields.
    const obsKeys = Object.keys(obsInsert?.payload as Record<string, unknown>);
    expect(obsKeys).not.toContain('score');
    expect(obsKeys).not.toContain('grade');
    expect(obsKeys).not.toContain('marks');
    expect(obsKeys).not.toContain('percentage');

    // STEP 13 — Gradebook guard: score on this diagnostic track rejected, no write.
    const updatesBeforeScore = db.updates.length;
    await expect(
      assignmentService.reviewSubmission(S.submission, {
        reviewStatus: 'reviewed',
        feedback: 'Good effort',
        score: 19,
        teacherId: S.teacher,
      }),
    ).rejects.toThrow(/formal/i);
    expect(db.updates.length).toBe(updatesBeforeScore);

    // STEP 14 — Feedback-only review on the diagnostic track is allowed.
    const reviewed = await assignmentService.reviewSubmission(S.submission, {
      reviewStatus: 'reviewed',
      feedback: 'Good effort — keep practising tape diagrams.',
      score: null,
      teacherId: S.teacher,
    });
    expect(reviewed.teacherFeedback).toContain('Good effort');

    // STEP 15 — AI suggests a next step: draft only, teacher gate intact.
    const suggestion = await teachingAiService.suggestInterventionFromEvidence({
      studentId: S.student,
      curriculumObjective: '5Nn.01',
      approvedObservationSnippets: [approved.observationText],
      schoolId: S.school,
      teacherId: S.teacher,
      classId: S.class,
      streamId: S.stream,
      subjectId: S.subject,
      resourceIds: [S.resource],
    });
    expect(suggestion.status).toBe('draft');
    expect(suggestion.isAiSuggested).toBe(true);

    // STEP 16 — Intervention created as draft with observation + submission links.
    const { interventionId } = await learningIntelligenceService.createIntervention(
      {
        schoolId: S.school,
        studentId: S.student,
        teacherId: S.teacher,
        classId: S.class,
        streamId: S.stream,
        subjectId: S.subject,
        learningArea: suggestion.learningArea,
        topicName: suggestion.topicName,
        reason: suggestion.reason,
        strategyAction: suggestion.strategyAction,
        targetOutcome: suggestion.targetOutcome,
        targetDate: '2026-10-03',
        status: 'draft',
      },
      [
        { type: 'observation', id: S.observation },
        { type: 'submission', id: S.submission },
      ],
    );
    expect(interventionId).toBe(S.intervention);
    const ivInsert = db.inserts.find((i) => i.table === 'interventions');
    expect(ivInsert?.payload.status).toBe('draft');
    const evInsert = db.inserts.find((i) => i.table === 'intervention_evidence');
    expect(evInsert?.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidence_type: 'observation', evidence_id: S.observation }),
        expect.objectContaining({ evidence_type: 'submission', evidence_id: S.submission }),
      ]),
    );

    // STEP 17 — Direct draft → active via status update is rejected (single path).
    await expect(learningIntelligenceService.updateInterventionStatus(S.intervention, 'active')).rejects.toThrow(
      /activateIntervention/i,
    );

    // STEP 18 — Explicit teacher activation succeeds (owner + observation link).
    await learningIntelligenceService.activateIntervention(S.intervention, S.teacher);
    db.activate();
    const ivUpdate = db.updates.find((u) => u.table === 'interventions' && u.payload.status === 'active');
    expect(ivUpdate).toBeDefined();

    // STEP 19 — Longitudinal profile keeps formal/diagostic aggregates separate.
    const insertsBeforeReads = db.inserts.length;
    const updatesBeforeReads = db.updates.length;
    const profile = await learningIntelligenceService.getLongitudinalProfile(S.student);
    expect(profile).not.toBeNull();
    expect(profile!.academicOverview.formalAveragePct).toBe(85);

    // STEP 20 — Pre-lesson briefing surfaces the evidence + the intervention.
    const briefing = await learningIntelligenceService.getPreLessonBriefing(S.class, S.subject);
    expect(briefing.recentClassObservations.length).toBeGreaterThan(0);
    expect(briefing.studentsNeedingAttention.length).toBeGreaterThan(0);
    expect(JSON.stringify(briefing.studentsNeedingAttention)).toContain(S.intervention);
    expect(briefing.suggestedRetrievalFocus.length).toBeGreaterThan(0);

    // STEP 21 — Profile + briefing are read-only; full op sequence is ordered.
    expect(db.inserts.length).toBe(insertsBeforeReads);
    expect(db.updates.length).toBe(updatesBeforeReads);
    const firstIdx = (table: string, op: string) => db.log.findIndex((e) => e.table === table && e.op === op);
    const iAssign = firstIdx('assignments', 'insert');
    const iSub = firstIdx('student_submissions', 'update');
    const iObs = firstIdx('teacher_observations', 'insert');
    const iIv = firstIdx('interventions', 'insert');
    const iActivate = db.log.findIndex(
      (e) => e.table === 'interventions' && e.op === 'update',
    );
    expect(iAssign).toBeGreaterThanOrEqual(0);
    expect(iSub).toBeGreaterThan(iAssign);
    expect(iObs).toBeGreaterThan(iSub);
    expect(iIv).toBeGreaterThan(iObs);
    expect(iActivate).toBeGreaterThan(iIv);
  });
});
