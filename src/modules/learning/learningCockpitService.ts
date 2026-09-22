/**
 * Digital Learning Spine M6 — learning cockpit service.
 *
 * Assembles Student Today and Teacher marking/at-risk payloads from the
 * spine tables (learning_activities, learning_submissions, learning_results,
 * assignments). Fail closed on DB errors. Honest empties on mock/empty.
 *
 * AI never writes score/grade/marks (charter LOCKED #10).
 */
import { supabase } from '../../lib/supabase';
import {
  buildStudentCockpit,
  buildTeacherCockpit,
  type MarkingSeed,
  type RiskSeed,
  type StudentLearningCockpit,
  type TeacherLearningCockpit,
  type WorkSeed,
} from './learningCockpitDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const isUUID = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function todayOnly(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function resolveStudentId(studentIdOrEmail: string): Promise<string> {
  if (isUUID(studentIdOrEmail)) return studentIdOrEmail;
  const { data: peopleRows, error: personError } = await supabase
    .from('people')
    .select('id')
    .eq('email', studentIdOrEmail);
  if (personError) throw new Error(`learningCockpit.resolveStudentId: ${personError.message}`);
  const personIds = [...new Set(((peopleRows ?? []) as any[]).map((p) => String(p.id)))];
  if (personIds.length === 0) {
    throw new Error(`learningCockpit: student ${studentIdOrEmail} not found`);
  }
  const { data: studentRows, error: studentError } = await supabase
    .from('students')
    .select('id')
    .in('person_id', personIds);
  if (studentError) throw new Error(`learningCockpit.resolveStudentId(students): ${studentError.message}`);
  const students = (studentRows ?? []) as any[];
  if (students.length === 0) {
    throw new Error(`learningCockpit: no student record for ${studentIdOrEmail}`);
  }
  if (students.length > 1) {
    throw new Error(
      `learningCockpit: ${students.length} student records resolve to ${studentIdOrEmail}`,
    );
  }
  return String(students[0].id);
}

function emptyStudentCockpit(): StudentLearningCockpit {
  return buildStudentCockpit([], todayOnly());
}

function emptyTeacherCockpit(): TeacherLearningCockpit {
  return buildTeacherCockpit([], [], Date.now());
}

export const learningCockpitService = {
  /**
   * Student Today learning cockpit. Combines published activities from the
   * learner's offerings with assignment work and their latest submissions
   * / results. Online-only learners never require class rows.
   */
  async getStudentCockpit(studentIdOrEmail: string, schoolId: string, asOf?: Date): Promise<StudentLearningCockpit> {
    if (isMockEnv()) return emptyStudentCockpit();
    const studentId = await resolveStudentId(studentIdOrEmail);
    const day = todayOnly(asOf ?? new Date());

    // Offerings this learner is actively enrolled in (online spine).
    const { data: enrolments, error: enrolErr } = await supabase
      .from('online_enrolments')
      .select('offering_id')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('status', 'active');
    if (enrolErr) throw new Error(`learningCockpit.getStudentCockpit: ${enrolErr.message}`);
    const offeringIds = [...new Set(((enrolments ?? []) as any[]).map((e) => String(e.offering_id)))];

    // Published activities for those offerings.
    let activityRows: any[] = [];
    if (offeringIds.length > 0) {
      const { data: acts, error: actErr } = await supabase
        .from('learning_activities')
        .select('id, title, activity_type, assigned_date, due_date, is_published, online_offering_id, teaching_sequence_id')
        .in('online_offering_id', offeringIds)
        .eq('is_published', true)
        .order('sort_order', { ascending: true });
      if (actErr) throw new Error(`learningCockpit.activities: ${actErr.message}`);
      activityRows = (acts ?? []) as any[];
    }

    // Assignments already on the learner's roster (class + offering origins).
    const { data: roster, error: rosterErr } = await supabase
      .from('student_submissions')
      .select(
        'id, assignment_id, submission_status, teacher_review_status, teacher_feedback, score, assignment:assignments!student_submissions_assignment_id_fkey(id, title, due_date, subjects(name))',
      )
      .eq('student_id', studentId);
    if (rosterErr) throw new Error(`learningCockpit.roster: ${rosterErr.message}`);
    const rosterRows = ((roster ?? []) as any[]).filter((r) => String(r.student_id) === studentId || !r.student_id);

    // Spine photo submissions + results for feedback/progress.
    const { data: photoSubs, error: photoErr } = await supabase
      .from('learning_submissions')
      .select('id, assignment_id, state, attempt, submitted_at, late')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .order('attempt', { ascending: false });
    if (photoErr) throw new Error(`learningCockpit.submissions: ${photoErr.message}`);

    const { data: results, error: resultErr } = await supabase
      .from('learning_results')
      .select('id, student_id, learning_activity_id, assignment_id, score, max_score, feedback, marked_at, result_source')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .order('marked_at', { ascending: false });
    if (resultErr) throw new Error(`learningCockpit.results: ${resultErr.message}`);

    const latestPhotoByAssignment = new Map<string, any>();
    for (const s of ((photoSubs ?? []) as any[]) ?? []) {
      const key = String(s.assignment_id);
      const prev = latestPhotoByAssignment.get(key);
      if (!prev || Number(s.attempt) > Number(prev.attempt)) latestPhotoByAssignment.set(key, s);
    }

    const resultByActivity = new Map<string, any>();
    const resultByAssignment = new Map<string, any>();
    for (const r of ((results ?? []) as any[]) ?? []) {
      if (r.learning_activity_id) {
        const k = String(r.learning_activity_id);
        if (!resultByActivity.has(k)) resultByActivity.set(k, r);
      }
      if (r.assignment_id) {
        const k = String(r.assignment_id);
        if (!resultByAssignment.has(k)) resultByAssignment.set(k, r);
      }
    }

    const seeds: WorkSeed[] = [];

    for (const a of activityRows) {
      const id = String(a.id);
      const result = resultByActivity.get(id);
      seeds.push({
        id: `activity:${id}`,
        source: 'activity',
        title: String(a.title ?? 'Learning activity'),
        dueDate: a.due_date ? String(a.due_date) : null,
        assignedDate: a.assigned_date ? String(a.assigned_date) : null,
        activityType: a.activity_type ? String(a.activity_type) : null,
        isPublished: Boolean(a.is_published),
        submissionState: result ? 'reviewed' : null,
        hasResult: Boolean(result),
        score: result?.score != null ? Number(result.score) : null,
        maxScore: result?.max_score != null ? Number(result.max_score) : null,
        feedback: result?.feedback ? String(result.feedback) : null,
        markedAt: result?.marked_at ? String(result.marked_at) : null,
      });
    }

    for (const r of rosterRows) {
      const assignmentId = String(r.assignment_id);
      const assignment = Array.isArray(r.assignment) ? r.assignment[0] : r.assignment;
      const photo = latestPhotoByAssignment.get(assignmentId);
      const result = resultByAssignment.get(assignmentId);
      const submissionState =
        photo?.state ??
        (r.submission_status === 'submitted' || r.submission_status === 'graded'
          ? 'submitted'
          : r.submission_status === 'missing'
            ? 'missing'
            : null);
      seeds.push({
        id: `assignment:${assignmentId}`,
        source: 'assignment',
        title: assignment?.title ? String(assignment.title) : 'Assignment',
        subject: assignment?.subjects?.name ? String(assignment.subjects.name) : null,
        dueDate: assignment?.due_date ? String(assignment.due_date) : null,
        submissionState,
        hasResult: Boolean(result) || r.submission_status === 'graded',
        score: result?.score != null ? Number(result.score) : r.score != null ? Number(r.score) : null,
        maxScore: result?.max_score != null ? Number(result.max_score) : null,
        feedback: result?.feedback
          ? String(result.feedback)
          : r.teacher_feedback
            ? String(r.teacher_feedback)
            : null,
        markedAt: result?.marked_at ? String(result.marked_at) : null,
      });
    }

    return buildStudentCockpit(seeds, day);
  },

  /**
   * Teacher marking queue + deterministic at-risk foundation for the
   * assignments this teacher owns. OnlineDay / SessionCockpit stay as-is.
   */
  async getTeacherCockpit(teacherIdOrEmail: string, schoolId: string, asOf?: Date): Promise<TeacherLearningCockpit> {
    if (isMockEnv()) return emptyTeacherCockpit();
    const day = todayOnly(asOf ?? new Date());
    const nowMs = asOf?.getTime() ?? Date.now();

    // Resolve teacher employee id (UUID passthrough; email via people → employees).
    let teacherId = teacherIdOrEmail;
    if (!isUUID(teacherIdOrEmail)) {
      const { data: peopleRows, error: personError } = await supabase
        .from('people')
        .select('id')
        .eq('email', teacherIdOrEmail);
      if (personError) throw new Error(`learningCockpit.getTeacherCockpit: ${personError.message}`);
      const personIds = [...new Set(((peopleRows ?? []) as any[]).map((p) => String(p.id)))];
      if (personIds.length === 0) {
        throw new Error(`learningCockpit: teacher ${teacherIdOrEmail} not found`);
      }
      const { data: empRows, error: empError } = await supabase
        .from('employees')
        .select('id')
        .in('person_id', personIds);
      if (empError) throw new Error(`learningCockpit.getTeacherCockpit(employees): ${empError.message}`);
      const emps = (empRows ?? []) as any[];
      if (emps.length === 0) {
        throw new Error(`learningCockpit: no employee record for ${teacherIdOrEmail}`);
      }
      teacherId = String(emps[0].id);
    }

    // Assignments owned by this teacher.
    const { data: assignments, error: assignErr } = await supabase
      .from('assignments')
      .select('id, title, due_date, class_id, online_offering_id, subjects(name)')
      .eq('school_id', schoolId)
      .eq('teacher_id', teacherId);
    if (assignErr) throw new Error(`learningCockpit.assignments: ${assignErr.message}`);
    const assignmentRows = ((assignments ?? []) as any[]) ?? [];
    const assignmentIds = assignmentRows.map((a) => String(a.id));
    const assignmentById = new Map(assignmentRows.map((a) => [String(a.id), a]));

    if (assignmentIds.length === 0) {
      return emptyTeacherCockpit();
    }

    // Roster rows (expected work) for missing/overdue signals.
    const { data: roster, error: rosterErr } = await supabase
      .from('student_submissions')
      .select('id, student_id, assignment_id, submission_status, teacher_review_status')
      .in('assignment_id', assignmentIds);
    if (rosterErr) throw new Error(`learningCockpit.teacher.roster: ${rosterErr.message}`);
    const rosterRows = ((roster ?? []) as any[]) ?? [];

    // Photo submissions needing a human mark.
    const { data: photoSubs, error: photoErr } = await supabase
      .from('learning_submissions')
      .select('id, student_id, assignment_id, state, attempt, submitted_at, late, attachments:learning_submission_attachments(id)')
      .in('assignment_id', assignmentIds)
      .in('state', ['submitted', 'late', 'resubmitted', 'revision_requested']);
    if (photoErr) throw new Error(`learningCockpit.teacher.submissions: ${photoErr.message}`);
    const photoRows = ((photoSubs ?? []) as any[]) ?? [];

    // Student display names for the queue / risk list.
    const studentIds = [
      ...new Set([...rosterRows.map((r) => String(r.student_id)), ...photoRows.map((s) => String(s.student_id))]),
    ];
    const studentNames = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: studentRows, error: studentErr } = await supabase
        .from('students')
        .select('id, person:people!students_person_id_fkey(first_name, last_name)')
        .in('id', studentIds);
      if (studentErr) throw new Error(`learningCockpit.teacher.students: ${studentErr.message}`);
      for (const s of ((studentRows ?? []) as any[]) ?? []) {
        const person = Array.isArray(s.person) ? s.person[0] : s.person;
        const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim();
        if (name) studentNames.set(String(s.id), name);
      }
    }

    const marking: MarkingSeed[] = photoRows.map((s) => {
      const assignment = assignmentById.get(String(s.assignment_id));
      const attachments = Array.isArray(s.attachments) ? s.attachments : [];
      return {
        submissionId: String(s.id),
        studentId: String(s.student_id),
        studentName: studentNames.get(String(s.student_id)) ?? null,
        assignmentId: s.assignment_id ? String(s.assignment_id) : null,
        learningActivityId: null,
        title: assignment?.title ? String(assignment.title) : 'Assignment',
        state: String(s.state),
        attempt: Number(s.attempt ?? 1),
        submittedAt: s.submitted_at ? String(s.submitted_at) : null,
        late: Boolean(s.late),
        photoCount: attachments.length,
      };
    });

    // Per-student risk counters (deterministic counts only).
    const riskAcc = new Map<string, RiskSeed>();
    const bump = (studentId: string, field: keyof Omit<RiskSeed, 'studentId' | 'studentName'>) => {
      const cur =
        riskAcc.get(studentId) ??
        ({
          studentId,
          studentName: studentNames.get(studentId) ?? null,
          overdueCount: 0,
          lateCount: 0,
          missingCount: 0,
          unmarkedCount: 0,
        } as RiskSeed);
      cur[field] = Number(cur[field] || 0) + 1;
      cur.studentName = studentNames.get(studentId) ?? cur.studentName;
      riskAcc.set(studentId, cur);
    };

    for (const r of rosterRows) {
      const studentId = String(r.student_id);
      const assignment = assignmentById.get(String(r.assignment_id));
      const due = assignment?.due_date ? String(assignment.due_date).slice(0, 10) : null;
      const pastDue = Boolean(due && due < day);
      const status = String(r.submission_status ?? '');
      if (status === 'missing') bump(studentId, 'missingCount');
      else if (pastDue && (status === 'pending' || status === 'missing')) bump(studentId, 'overdueCount');
      if (status === 'submitted' && r.teacher_review_status === 'unreviewed') bump(studentId, 'unmarkedCount');
    }
    for (const s of photoRows) {
      if (s.late) bump(String(s.student_id), 'lateCount');
    }

    return buildTeacherCockpit(marking, [...riskAcc.values()], nowMs);
  },
};
