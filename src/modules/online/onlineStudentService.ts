import { supabase } from '../../lib/supabase';

/**
 * Phase 9D Task 1 — student online home.
 *
 * Read-only home payload for an online learner: upcoming sessions (own
 * participant rows → session details), assignments due (own
 * student_submissions rows joined to assignments), and recent feedback
 * (teacher notes on COMPLETED sessions + teacher feedback on
 * submissions).
 *
 * Conventions (per feesService D1 hardening + 9C onlineTeachingService):
 * - Mock env → honest empties (null student, [] lists), never mock data.
 * - Live DB error → throw. Empty tables → honest empties (success).
 * - Every read is scoped to the student's own participant/submission rows
 *   within one school; session rows are filtered app-side to those ids as
 *   defence in depth. RLS is the backstop. Another student's sessions are
 *   never returned.
 * - Caller identity: UUIDs pass through as student ids; a non-UUID (login
 *   email, mirroring onlineTeachingService.resolveTeacherId) resolves via
 *   people → students and throws when unknown.
 *
 * LOCKED (online-only safe): this module NEVER reads student_enrolments,
 * classes, streams, timetable_entries, or student_attendance_* — an
 * online-only learner sees no class/timetable/attendance artifacts. Join =
 * link display: join_url is surfaced for a join button. No video build.
 */

export interface OnlineHomeSession {
  id: string;
  status: string;
  start: string;
  end: string;
  joinUrl?: string;
  teacherName?: string;
  /** Subject name via the offering (falls back to the offering title). */
  subject?: string;
  offeringTitle?: string;
  sessionType?: string;
}

export interface OnlineHomeAssignment {
  submissionId: string;
  assignmentId: string;
  title: string;
  dueDate?: string;
  subject?: string;
  status: string;
}

export interface OnlineHomeFeedback {
  kind: 'session' | 'submission';
  text: string;
  sourceTitle?: string;
  date?: string;
  sessionId?: string;
  assignmentId?: string;
  score?: number | null;
}

export interface OnlineHomeStudent {
  id: string;
  name?: string;
  admissionNumber?: string;
}

export interface OnlineHome {
  student: OnlineHomeStudent | null;
  upcomingSessions: OnlineHomeSession[];
  assignmentsDue: OnlineHomeAssignment[];
  recentFeedback: OnlineHomeFeedback[];
}

const UPCOMING_STATUSES: ReadonlySet<string> = new Set(['SCHEDULED', 'CONFIRMED']);
const DUE_STATUSES: ReadonlySet<string> = new Set(['pending', 'missing']);

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const isUUID = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

function personName(person: unknown): string | undefined {
  const p = one(person);
  if (!p) return undefined;
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return full || undefined;
}

const SESSION_SELECT =
  'id, school_id, offering_id, teacher_id, status, scheduled_start, scheduled_end, session_type, join_url, curriculum_objective_id, session_note, offering:online_offerings(id, title, subjects(name))';

const SUBMISSION_SELECT =
  'id, assignment_id, submission_status, teacher_review_status, teacher_feedback, score, created_at, assignment:assignments!student_submissions_assignment_id_fkey(id, title, due_date, subjects(name))';

/**
 * UUID student ids pass through; anything else (login email) resolves via
 * people → students. Unknown → throw (never another student's id).
 */
async function resolveStudentId(studentIdOrEmail: string): Promise<string> {
  if (isUUID(studentIdOrEmail)) return studentIdOrEmail;
  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id, email')
    .eq('email', studentIdOrEmail)
    .maybeSingle();
  if (personError) throw personError;
  const personRow = one(person);
  if (!personRow) {
    throw new Error(
      `onlineStudentService: student ${studentIdOrEmail} not found (people lookup)`,
    );
  }
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('person_id', personRow.id)
    .maybeSingle();
  if (studentError) throw studentError;
  const studentRow = one(student);
  if (!studentRow) {
    throw new Error(
      `onlineStudentService: no student record for ${studentIdOrEmail}`,
    );
  }
  return String(studentRow.id);
}

export const onlineStudentService = {
  /**
   * Home payload for one online learner within one school. All lists are
   * scoped to the student's own participant/submission rows; sessions
   * outside those rows (another student's sessions) are dropped app-side.
   * Mock → honest empties with no DB calls.
   */
  async getOnlineHome(studentIdOrEmail: string, schoolId: string): Promise<OnlineHome> {
    if (isMockEnv()) {
      return { student: null, upcomingSessions: [], assignmentsDue: [], recentFeedback: [] };
    }
    const studentId = await resolveStudentId(studentIdOrEmail);

    const { data: participantRows, error: participantError } = await supabase
      .from('online_session_participants')
      .select('session_id')
      .eq('student_id', studentId);
    if (participantError) throw participantError;
    const sessionIds = [...new Set(((participantRows ?? []) as any[]).map((p) => String(p.session_id)).filter(Boolean))];

    let sessionRows: any[] = [];
    if (sessionIds.length > 0) {
      const { data: sessions, error: sessionError } = await supabase
        .from('online_sessions')
        .select(SESSION_SELECT)
        .eq('school_id', schoolId)
        .in('id', sessionIds)
        .order('scheduled_start', { ascending: true });
      if (sessionError) throw sessionError;
      // Defence in depth: keep only this student's sessions in this school.
      sessionRows = ((sessions ?? []) as any[]).filter(
        (s) => sessionIds.includes(String(s.id)) && String(s.school_id) === String(schoolId),
      );
    }

    const teacherIds = [...new Set(sessionRows.map((s) => String(s.teacher_id)).filter(Boolean))];
    const teacherNames = new Map<string, string>();
    if (teacherIds.length > 0) {
      const { data: teachers, error: teacherError } = await supabase
        .from('employees')
        .select('id, people(first_name, last_name)')
        .in('id', teacherIds);
      if (teacherError) throw teacherError;
      for (const t of ((teachers ?? []) as any[])) {
        const name = personName(t.people);
        if (name) teacherNames.set(String(t.id), name);
      }
    }

    const now = Date.now();
    const upcomingSessions: OnlineHomeSession[] = sessionRows
      .filter(
        (s) =>
          UPCOMING_STATUSES.has(String(s.status)) &&
          !Number.isNaN(new Date(String(s.scheduled_start)).getTime()) &&
          new Date(String(s.scheduled_start)).getTime() >= now,
      )
      .sort((a, b) =>
        String(a.scheduled_start) < String(b.scheduled_start)
          ? -1
          : String(a.scheduled_start) > String(b.scheduled_start)
            ? 1
            : 0,
      )
      .map((s) => {
        const offering = one(s.offering);
        // Subject prefers the offering's linked subject; the offering title
        // is the fallback so a session never renders without context.
        const subjectName = one(offering?.subjects)?.name ?? offering?.title;
        const teacherName = teacherNames.get(String(s.teacher_id));
        return {
          id: String(s.id),
          status: String(s.status),
          start: String(s.scheduled_start),
          end: String(s.scheduled_end),
          ...(s.join_url ? { joinUrl: String(s.join_url) } : {}),
          ...(teacherName ? { teacherName } : {}),
          ...(subjectName ? { subject: String(subjectName) } : {}),
          ...(offering?.title ? { offeringTitle: String(offering.title) } : {}),
          ...(s.session_type ? { sessionType: String(s.session_type) } : {}),
        };
      });

    // Session feedback: COMPLETED own sessions carrying a teacher note.
    const sessionFeedback: OnlineHomeFeedback[] = sessionRows
      .filter((s) => String(s.status) === 'COMPLETED' && s.session_note && String(s.session_note).trim())
      .sort((a, b) =>
        String(a.scheduled_start) > String(b.scheduled_start) ? -1 : String(a.scheduled_start) < String(b.scheduled_start) ? 1 : 0,
      )
      .map((s) => {
        const offering = one(s.offering);
        return {
          kind: 'session' as const,
          text: String(s.session_note).trim(),
          ...(offering?.title ? { sourceTitle: String(offering.title) } : {}),
          ...(s.scheduled_start ? { date: String(s.scheduled_start).slice(0, 10) } : {}),
          sessionId: String(s.id),
        };
      });

    const { data: studentRow, error: studentError } = await supabase
      .from('students')
      .select('id, admission_number, person:people!students_person_id_fkey(first_name, last_name)')
      .eq('id', studentId)
      .maybeSingle();
    if (studentError) throw studentError;
    const studentData = one(studentRow);
    const student: OnlineHomeStudent | null = studentData
      ? {
          id: String(studentData.id),
          ...(personName(studentData.person) ? { name: personName(studentData.person)! } : {}),
          ...(studentData.admission_number ? { admissionNumber: String(studentData.admission_number) } : {}),
        }
      : null;

    // Work loop: own submission rows (provisioned at assignment creation,
    // mirroring assignmentService) joined to assignments.
    const { data: submissionRows, error: submissionError } = await supabase
      .from('student_submissions')
      .select(SUBMISSION_SELECT)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (submissionError) throw submissionError;
    const submissions = ((submissionRows ?? []) as any[]).filter(
      (r) => String(r.student_id ?? studentId) === studentId || !r.student_id,
    );

    const assignmentsDue: OnlineHomeAssignment[] = submissions
      .filter((r) => DUE_STATUSES.has(String(r.submission_status)))
      .map((r) => {
        const assignment = one(r.assignment);
        const subjectName = one(assignment?.subjects)?.name;
        return {
          submissionId: String(r.id),
          assignmentId: String(r.assignment_id),
          title: assignment?.title ? String(assignment.title) : 'Assignment',
          ...(assignment?.due_date ? { dueDate: String(assignment.due_date).slice(0, 10) } : {}),
          ...(subjectName ? { subject: String(subjectName) } : {}),
          status: String(r.submission_status),
        };
      })
      .sort((a, b) => (a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : (a.dueDate ?? '') > (b.dueDate ?? '') ? 1 : 0);

    const submissionFeedback: OnlineHomeFeedback[] = submissions
      .filter((r) => r.teacher_feedback && String(r.teacher_feedback).trim())
      .map((r) => {
        const assignment = one(r.assignment);
        return {
          kind: 'submission' as const,
          text: String(r.teacher_feedback).trim(),
          ...(assignment?.title ? { sourceTitle: String(assignment.title) } : {}),
          ...(assignment?.due_date ? { date: String(assignment.due_date).slice(0, 10) } : {}),
          assignmentId: String(r.assignment_id),
          ...(r.score ?? null) !== null && r.score !== undefined ? { score: Number(r.score) } : {},
        };
      });

    const recentFeedback = [...sessionFeedback, ...submissionFeedback].slice(0, 10);

    return { student, upcomingSessions, assignmentsDue, recentFeedback };
  },
};
