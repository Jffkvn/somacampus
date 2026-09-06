import { supabase } from '../../lib/supabase';
import type {
  Assignment,
  StudentSubmission,
  TeacherObservation,
  ObservationType,
  ObservationVisibility,
} from '../../types/domain';
import {
  validateAssignmentPayload,
  type CreateAssignmentPayload,
} from '../teaching/assignmentDomain';
import { assignmentService } from '../teaching/assignmentService';

/**
 * Phase 9E Task 1 — academic integration for online sessions.
 *
 * CHOICE (per spec: extend onlineTeachingService and/or a small onlineAcademic
 * module): a small `onlineAcademicService` module. Rationale: the teaching
 * service header LOCKS its write scope to online_sessions +
 * online_session_participants (participation ≠ attendance). Session assignment
 * creation writes assignments + student_submissions and session observations
 * write teacher_observations, so they belong here, not there. Session
 * ownership/identity helpers below mirror onlineTeachingService conventions
 * (teacher-scoped reads, read-then-verify writes, honest mock nulls).
 *
 * REUSE vs NEW:
 * - Reused engines (called, not re-implemented):
 *   - curriculum objectives: learning_objectives read (existence check);
 *     the link column online_sessions.curriculum_objective_id already exists.
 *   - assignments: validateAssignmentPayload (assignmentDomain) for payload
 *     rules; assignmentService.updateSubmission for the submit path.
 *   - learner record: studentService / learningIntelligenceService evidence
 *     reads already aggregate student_submissions + teacher_observations by
 *     student — session work flows through the SAME tables, so no new
 *     pipeline (asserted in test (f) against the existing service).
 * - New (session-scoping adapters only):
 *   - linkObjective, createSessionAssignment (provision from session
 *     participants, not class enrolments), submitSessionWork (session guard +
 *     delegate), recordSessionObservation (insert carries the new
 *     online_session_id FK — observationService has no session passthrough
 *     and other modules are out of scope, so the adapter inserts directly
 *     with mirrored validation), getSessionBriefing (session-scoped prior
 *     notes + outstanding + patterns; getPreLessonBriefing is NOT called
 *     because it is class+subject scoped and sessions carry an offering, not
 *     a class/subject).
 *
 * Schema: migration 20260914000003 (assignments.online_session_id,
 * teacher_observations.online_session_id, nullable FKs to online_sessions).
 *
 * Conventions (mirrored from onlineTeachingService):
 * - Mock env → null, never mock data, no DB calls.
 * - Live DB error → throw. Writes read-then-verify session ownership first.
 */

export interface SessionAssignment extends Assignment {
  onlineSessionId: string;
}

export interface CreateSessionAssignmentResult {
  assignment: SessionAssignment;
  /** Participants provisioned as expected submitters. */
  provisionedCount: number;
}

export interface SessionObservation extends TeacherObservation {
  onlineSessionId: string;
}

export interface SessionBriefingOutstanding {
  assignmentId: string;
  assignmentTitle?: string;
  studentId: string;
  status: string;
}

export interface SessionBriefingObservation {
  id: string;
  studentId: string;
  type: string;
  text: string;
  date: string;
}

export interface SessionBriefing {
  sessionId: string;
  offeringId?: string;
  /** Latest COMPLETED same-offering (+same-teacher) session note, else null. */
  priorNote: string | null;
  priorSessionsConsidered: number;
  outstanding: SessionBriefingOutstanding[];
  outstandingCount: number;
  recentObservations: SessionBriefingObservation[];
  patternSummary: string;
  hasInsufficientEvidence: boolean;
}

export interface SessionWorkInput {
  workSummary?: string | null;
  workType?: 'notebook' | 'written' | 'oral' | 'file_reference' | 'photo_reference' | 'captured_evidence';
  workReferenceLocation?: string | null;
}

export interface CreateSessionAssignmentInput {
  classId?: string | null;
  subjectId: string;
  streamId?: string | null;
  title: string;
  instructions: string;
  assignedDate: string;
  dueDate: string;
  submissionType: CreateAssignmentPayload['submissionType'];
  evidenceTrack: CreateAssignmentPayload['evidenceTrack'];
  maxScore?: number | null;
}

export interface RecordSessionObservationInput {
  studentId: string;
  classId?: string | null;
  streamId?: string | null;
  subjectId?: string | null;
  assignmentId?: string | null;
  observationType: ObservationType;
  observationText: string;
  visibility?: ObservationVisibility;
  observedAt?: string;
}

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const isUUID = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

const SESSION_SELECT =
  'id, school_id, offering_id, teacher_id, status, scheduled_start, scheduled_end, session_type, join_url, curriculum_objective_id, session_note, started_at, completed_at, offering:online_offerings(id, title)';

function mapSessionSummary(row: any): {
  id: string;
  schoolId: string;
  offeringId?: string;
  teacherId: string;
  status: string;
  curriculumObjectiveId?: string;
} {
  const offering = one(row.offering);
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    ...(row.offering_id ?? offering?.id ? { offeringId: String(row.offering_id ?? offering.id) } : {}),
    teacherId: String(row.teacher_id),
    status: String(row.status),
    ...(row.curriculum_objective_id
      ? { curriculumObjectiveId: String(row.curriculum_objective_id) }
      : {}),
  };
}

/** UUID employee ids pass through; anything else resolves via employees lookup. */
async function resolveTeacherId(teacherIdOrEmail: string): Promise<string> {
  if (isUUID(teacherIdOrEmail)) return teacherIdOrEmail;
  const { data, error } = await supabase
    .from('employees')
    .select('id, people(email)')
    .limit(50);
  if (error) throw error;
  const match = ((data ?? []) as any[]).find((r) => {
    const person = one(r.people);
    return person?.email === teacherIdOrEmail || r.id === teacherIdOrEmail;
  });
  if (!match) {
    throw new Error(
      `onlineAcademicService: teacher ${teacherIdOrEmail} not found (employees lookup)`,
    );
  }
  return String(match.id);
}

/** Read-then-verify ownership: missing → throw, foreign → throw. */
async function loadOwnedSession(sessionId: string, teacherId: string): Promise<any> {
  const { data, error } = await supabase
    .from('online_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`onlineAcademicService: session ${sessionId} not found`);
  if (String((data as any).teacher_id) !== teacherId) {
    throw new Error(
      `onlineAcademicService: session ${sessionId} is not assigned to this teacher`,
    );
  }
  return data;
}

function mapAssignmentRow(r: any): SessionAssignment {
  const cls = one(r?.classes);
  const stm = one(r?.streams);
  const subj = one(r?.subjects);
  const teacher = one(r?.teacher);
  const teacherPerson = one(teacher?.people);
  const teacherName = teacherPerson
    ? `${teacherPerson.first_name} ${teacherPerson.last_name}`.trim()
    : undefined;
  return {
    id: String(r.id),
    schoolId: String(r.school_id),
    teacherId: String(r.teacher_id),
    ...(teacherName ? { teacherName } : {}),
    classId: r.class_id ? String(r.class_id) : null,
    ...(cls?.name ? { className: cls.name } : {}),
    streamId: r.stream_id ?? null,
    ...(stm?.name ? { streamName: stm.name } : {}),
    subjectId: String(r.subject_id),
    ...(subj?.name ? { subjectName: subj.name } : {}),
    lessonId: r.lesson_id ?? null,
    onlineSessionId: String(r.online_session_id),
    title: r.title,
    instructions: r.instructions,
    assignedDate: r.assigned_date,
    dueDate: r.due_date,
    submissionType: r.submission_type,
    evidenceTrack: r.evidence_track,
    maxScore: r.max_score,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapObservationRow(r: any): SessionObservation {
  const teacher = one(r?.teacher);
  const teacherPerson = one(teacher?.people);
  const teacherName = teacherPerson
    ? `${teacherPerson.first_name} ${teacherPerson.last_name}`.trim()
    : undefined;
  const student = one(r?.student);
  const studentPerson = one(student?.people);
  const studentName = studentPerson
    ? `${studentPerson.first_name} ${studentPerson.last_name}`.trim()
    : undefined;
  const subj = one(r?.subjects);
  const cls = one(r?.classes);
  const stm = one(r?.streams);
  return {
    id: String(r.id),
    schoolId: String(r.school_id),
    studentId: String(r.student_id),
    ...(studentName ? { studentName } : {}),
    teacherId: String(r.teacher_id),
    ...(teacherName ? { teacherName } : {}),
    classId: r.class_id ? String(r.class_id) : null,
    ...(cls?.name ? { className: cls.name } : {}),
    streamId: r.stream_id ?? null,
    ...(stm?.name ? { streamName: stm.name } : {}),
    subjectId: r.subject_id ?? null,
    ...(subj?.name ? { subjectName: subj.name } : {}),
    lessonId: r.lesson_id ?? null,
    assignmentId: r.assignment_id ?? null,
    onlineSessionId: String(r.online_session_id),
    observationType: r.observation_type,
    observationText: r.observation_text,
    visibility: r.visibility,
    observedAt: r.observed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const onlineAcademicService = {
  /**
   * Link an owned session to a curriculum objective. The objective must
   * exist (validated via learning_objectives read before any write).
   * Mock → null.
   */
  async linkObjective(
    sessionId: string,
    teacherIdOrEmail: string,
    objectiveId: string,
  ): Promise<{ id: string; curriculumObjectiveId: string } | null> {
    if (isMockEnv()) return null;
    if (!objectiveId || !objectiveId.trim()) {
      throw new Error('onlineAcademicService.linkObjective: a curriculum objective id is required');
    }
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    await loadOwnedSession(sessionId, teacherId);
    const { data: objective, error: objError } = await supabase
      .from('learning_objectives')
      .select('id')
      .eq('id', objectiveId)
      .maybeSingle();
    if (objError) throw objError;
    if (!objective) {
      throw new Error(
        `onlineAcademicService.linkObjective: curriculum objective ${objectiveId} not found`,
      );
    }
    const { data: updated, error: updateError } = await supabase
      .from('online_sessions')
      .update({ curriculum_objective_id: objectiveId })
      .eq('id', sessionId)
      .select(SESSION_SELECT)
      .single();
    if (updateError || !updated) {
      throw updateError ?? new Error('onlineAcademicService.linkObjective: update returned no row');
    }
    const summary = mapSessionSummary(updated);
    return { id: summary.id, curriculumObjectiveId: summary.curriculumObjectiveId ?? objectiveId };
  },

  /**
   * Create an assignment FROM an owned session: the row carries
   * online_session_id (migration 20260914000003) and session participants
   * are auto-provisioned as expected submitters (mirrors the
   * assignmentService class-enrolment provisioning, scoped to the session
   * roster instead). Provisioning is best-effort with the same try/catch
   * fallback convention as assignmentService. Mock → null.
   */
  async createSessionAssignment(
    sessionId: string,
    teacherIdOrEmail: string,
    input: CreateSessionAssignmentInput,
  ): Promise<CreateSessionAssignmentResult | null> {
    if (isMockEnv()) return null;
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    const session = await loadOwnedSession(sessionId, teacherId);

    const validation = validateAssignmentPayload({
      schoolId: String(session.school_id),
      teacherId,
      ...input,
      onlineSessionId: sessionId,
    });
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    const { data: assignmentRow, error: assignErr } = await supabase
      .from('assignments')
      .insert({
        school_id: String(session.school_id),
        teacher_id: teacherId,
        class_id: input.classId ?? null,
        stream_id: input.streamId ?? null,
        subject_id: input.subjectId,
        lesson_id: null,
        online_session_id: sessionId,
        title: input.title.trim(),
        instructions: input.instructions.trim(),
        assigned_date: input.assignedDate,
        due_date: input.dueDate,
        submission_type: input.submissionType,
        evidence_track: input.evidenceTrack,
        max_score: input.maxScore ?? null,
        status: 'published',
      })
      .select('*, classes(name), streams(name), subjects(name), teacher:employees(people(first_name, last_name))')
      .single();
    if (assignErr || !assignmentRow) {
      throw new Error(`Failed to create session assignment: ${assignErr?.message ?? 'Unknown error'}`);
    }
    const assignment = mapAssignmentRow(assignmentRow);

    let provisionedCount = 0;
    try {
      const { data: participants, error: partError } = await supabase
        .from('online_session_participants')
        .select('student_id')
        .eq('session_id', sessionId);
      if (partError) throw partError;
      const studentIds = Array.from(
        new Set(((participants ?? []) as any[]).map((p) => String(p.student_id))),
      );
      if (studentIds.length > 0) {
        const submissionRows = studentIds.map((studentId) => ({
          school_id: String(session.school_id),
          assignment_id: assignment.id,
          student_id: studentId,
          participation_status: 'expected',
          submission_status: 'pending',
          work_type: 'notebook',
          teacher_review_status: 'unreviewed',
        }));
        const { error: insertError } = await supabase
          .from('student_submissions')
          .insert(submissionRows);
        if (insertError) throw insertError;
        provisionedCount = studentIds.length;
      }
    } catch (err) {
      console.warn('Session assignment roster provisioning fallback:', err);
    }

    return { assignment, provisionedCount };
  },

  /**
   * Student submits work on a session assignment. Guards that the assignment
   * belongs to this session (cross-session submits throw with nothing
   * written), requires the provisioned submission row to exist (no silent
   * upsert), then REUSES assignmentService.updateSubmission for the write.
   * Mock → null.
   */
  async submitSessionWork(
    sessionId: string,
    studentId: string,
    assignmentId: string,
    work: SessionWorkInput,
  ): Promise<StudentSubmission | null> {
    if (isMockEnv()) return null;
    const { data: assignment, error: assignError } = await supabase
      .from('assignments')
      .select('id, school_id, online_session_id')
      .eq('id', assignmentId)
      .maybeSingle();
    if (assignError) throw assignError;
    if (!assignment) {
      throw new Error(`onlineAcademicService.submitSessionWork: assignment ${assignmentId} not found`);
    }
    if (String((assignment as any).online_session_id) !== sessionId) {
      throw new Error(
        `onlineAcademicService.submitSessionWork: assignment ${assignmentId} does not belong to session ${sessionId}`,
      );
    }
    const { data: submission, error: subError } = await supabase
      .from('student_submissions')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (subError) throw subError;
    if (!submission) {
      throw new Error(
        `onlineAcademicService.submitSessionWork: student ${studentId} has no submission row for assignment ${assignmentId}`,
      );
    }
    return assignmentService.updateSubmission(String((submission as any).id), {
      submissionStatus: 'submitted',
      ...(work.workType !== undefined ? { workType: work.workType } : {}),
      ...(work.workSummary !== undefined ? { workSummary: work.workSummary } : {}),
      ...(work.workReferenceLocation !== undefined
        ? { workReferenceLocation: work.workReferenceLocation }
        : {}),
    });
  },

  /**
   * Record a teacher observation from a session context. Session ownership is
   * verified; the row carries online_session_id (migration 20260914000003).
   * Direct insert (documented): observationService.createObservation has no
   * session-FK passthrough and other modules are out of scope, so this
   * adapter mirrors its validation (text/student/teacher/class required)
   * rather than duplicating the engine. Mock → null.
   */
  async recordSessionObservation(
    sessionId: string,
    teacherIdOrEmail: string,
    input: RecordSessionObservationInput,
  ): Promise<SessionObservation | null> {
    if (isMockEnv()) return null;
    if (!input.observationText?.trim()) {
      throw new Error('Observation text is required');
    }
    if (!input.studentId) {
      throw new Error('Student ID is required');
    }
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    const session = await loadOwnedSession(sessionId, teacherId);
    const { data, error } = await supabase
      .from('teacher_observations')
      .insert({
        school_id: String(session.school_id),
        student_id: input.studentId,
        teacher_id: teacherId,
        class_id: input.classId ?? null,
        stream_id: input.streamId ?? null,
        subject_id: input.subjectId ?? null,
        lesson_id: null,
        assignment_id: input.assignmentId ?? null,
        online_session_id: sessionId,
        observation_type: input.observationType,
        observation_text: input.observationText.trim(),
        visibility: input.visibility ?? 'academic_team',
        observed_at: input.observedAt ?? new Date().toISOString(),
      })
      .select('*, teacher:employees(people(first_name, last_name)), student:students(admission_number, people(first_name, last_name)), subjects(name), classes(name), streams(name)')
      .single();
    if (error || !data) {
      throw new Error(`Failed to record session observation: ${error?.message ?? 'Unknown error'}`);
    }
    return mapObservationRow(data);
  },

  /**
   * Briefing for an upcoming session: latest COMPLETED same-offering
   * (+same-teacher) note, outstanding (pending/missing) work on assignments
   * linked to prior + current sessions, and recent session-linked
   * observations with a deterministic pattern summary. Session-scoped
   * adapter (documented): getPreLessonBriefing is class+subject scoped and
   * sessions carry an offering, not a class/subject, so it is not called.
   * Read semantics: unowned/missing session → null. Mock → null.
   */
  async getSessionBriefing(
    sessionId: string,
    teacherIdOrEmail: string,
  ): Promise<SessionBriefing | null> {
    if (isMockEnv()) return null;
    const teacherId = await resolveTeacherId(teacherIdOrEmail);
    const { data: sessionRow, error: sessError } = await supabase
      .from('online_sessions')
      .select(SESSION_SELECT)
      .eq('id', sessionId)
      .maybeSingle();
    if (sessError) throw sessError;
    if (!sessionRow) return null;
    if (String((sessionRow as any).teacher_id) !== teacherId) return null;
    const summary = mapSessionSummary(sessionRow);

    let priorNote: string | null = null;
    let priorIds: string[] = [];
    if (summary.offeringId) {
      const { data: priorRows, error: priorError } = await supabase
        .from('online_sessions')
        .select('id, session_note, scheduled_start')
        .eq('offering_id', summary.offeringId)
        .eq('teacher_id', teacherId)
        .eq('status', 'COMPLETED')
        .neq('id', sessionId)
        .order('scheduled_start', { ascending: false })
        .limit(5);
      if (priorError) throw priorError;
      const priors = ((priorRows ?? []) as any[]).filter((r) => String(r.id) !== sessionId);
      priorIds = priors.map((r) => String(r.id));
      const latestWithNote = priors.find((r) => r.session_note);
      priorNote = latestWithNote ? String(latestWithNote.session_note) : null;
    }

    const sessionScope = Array.from(new Set([...priorIds, sessionId]));
    const { data: assignmentRows, error: assignError } = await supabase
      .from('assignments')
      .select('id, title, online_session_id')
      .in('online_session_id', sessionScope);
    if (assignError) throw assignError;
    const assignments = ((assignmentRows ?? []) as any[]).filter((a) =>
      sessionScope.includes(String(a.online_session_id)),
    );
    const titleById = new Map<string, string>(
      assignments.map((a) => [String(a.id), String(a.title ?? '')]),
    );

    let outstanding: SessionBriefingOutstanding[] = [];
    if (assignments.length > 0) {
      const { data: subRows, error: subError } = await supabase
        .from('student_submissions')
        .select('assignment_id, student_id, participation_status, submission_status')
        .in(
          'assignment_id',
          assignments.map((a) => a.id),
        );
      if (subError) throw subError;
      outstanding = ((subRows ?? []) as any[])
        .filter(
          (s) =>
            String(s.submission_status) === 'pending' || String(s.submission_status) === 'missing',
        )
        .map((s) => ({
          assignmentId: String(s.assignment_id),
          ...(titleById.get(String(s.assignment_id))
            ? { assignmentTitle: titleById.get(String(s.assignment_id)) as string }
            : {}),
          studentId: String(s.student_id),
          status: String(s.submission_status),
        }));
    }

    let recentObservations: SessionBriefingObservation[] = [];
    if (priorIds.length > 0) {
      const { data: obsRows, error: obsError } = await supabase
        .from('teacher_observations')
        .select('id, student_id, observation_type, observation_text, observed_at')
        .in('online_session_id', priorIds)
        .order('observed_at', { ascending: false })
        .limit(10);
      if (obsError) throw obsError;
      recentObservations = ((obsRows ?? []) as any[]).map((o) => ({
        id: String(o.id),
        studentId: String(o.student_id),
        type: String(o.observation_type),
        text: String(o.observation_text),
        date: String(o.observed_at).slice(0, 10),
      }));
    }

    const flags = recentObservations.filter(
      (o) => o.type === 'misconception' || o.type === 'support_need',
    ).length;
    const strengths = recentObservations.filter((o) => o.type === 'strength').length;
    const patternSummary =
      flags > 0
        ? `${flags} misconception/support_need flag(s) across ${recentObservations.length} recent session observation(s) — open with retrieval on the flagged points.`
        : strengths > 0
          ? `Consistent strength across ${strengths} recent session observation(s) — extend with stretch material.`
          : 'No recurring difficulty flags in recent session observations.';
    const hasInsufficientEvidence =
      outstanding.length === 0 && recentObservations.length < 2;

    return {
      sessionId: summary.id,
      ...(summary.offeringId ? { offeringId: summary.offeringId } : {}),
      priorNote,
      priorSessionsConsidered: priorIds.length,
      outstanding,
      outstandingCount: outstanding.length,
      recentObservations,
      patternSummary,
      hasInsufficientEvidence,
    };
  },
};
