/**
 * Parent Portal Service — SomaCampus Phase 8A Task 3.
 *
 * Read-only home-portal data for guardians, built exclusively through the
 * parent allowlist projections in types/domain.ts (mirroring the teacher
 * ActivityParticipantProjection firewall). The service NEVER returns full
 * domain objects: every section passes through its picker, which emits
 * exactly the allowlisted keys.
 *
 *Data sources (reused internally, then allowlist-picked):
 * - enrolments + students/people for the child summary
 * - student_attendance_records for attendance
 * - student_submissions + assignments for assignments w/ status
 * - teacher_observations filtered to parent_visible (server-side AND picker)
 * - lessons.visible_lesson_note for recent visible lesson notes
 * - financeService.getStudentFeeStatement for the read-only statement
 * - activity_enrolments + activity_clearances + school_activities
 *
 * Conventions:
 * - Mock-env guard returns honest empties ([] / null) like studentService.
 * - DB/RLS errors THROW (D1 rule) — never silent [] and never leaked rows.
 * - Membership gate: getChildOverview returns null for a studentId outside
 *   resolveMyChildIds(schoolId) WITHOUT querying further (no sibling leak).
 * - No phone numbers anywhere. No amounts outside the finance projection.
 */
import { supabase } from '../../lib/supabase';
import { resolveMyChildIds } from '../auth/parentIdentity';
import { financeService } from '../finance/financeService';
import type {
  StudentFeeStatement,
  ClearanceStatus,
  ClearanceBasis,
  ParentChildSummary,
  ParentChildOverview,
  ParentAcademicProjection,
  ParentAttendanceProjection,
  ParentFinanceProjection,
  ParentActivityProjection,
} from '../../types/domain';

// Mock-env idiom pinned from studentService: placeholder/missing URL -> [].
const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : v ? [v] : []);

function personName(person: any): string | null {
  const p = one(person);
  if (!p) return null;
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return full || null;
}

// -----------------------------------------------------------------------------
// Pure allowlist pickers (unit-pinned by parent-projection.test.ts).
// -----------------------------------------------------------------------------

export interface ParentAcademicInput {
  studentId: string;
  lessonNotes: Array<{
    date: string;
    subjectName?: string | null;
    visibleNote?: string | null;
    privateReflection?: string | null;
    teacherId?: string | null;
    lessonId?: string | null;
  }>;
  observations: Array<{
    id: string;
    date: string;
    teacherName?: string | null;
    text: string;
    subjectName?: string | null;
    visibility: string;
    teacherId?: string | null;
  }>;
  assignments: Array<{
    assignmentId: string;
    title: string;
    subjectName?: string | null;
    dueDate?: string | null;
    submissionStatus: string;
    teacherFeedback?: string | null;
    score?: number | null;
    maxScore?: number | null;
    teacherId?: string | null;
  }>;
}

export function toParentAcademicProjection(input: ParentAcademicInput): ParentAcademicProjection {
  return {
    studentId: input.studentId,
    recentLessonNotes: (input.lessonNotes ?? []).map((n) => ({
      date: String(n.date).slice(0, 10),
      subjectName: n.subjectName ?? 'General',
      visibleNote: n.visibleNote ?? '',
    })),
    // Defense in depth: server query filters visibility=parent_visible, but
    // the picker drops anything else even if the filter is bypassed.
    observations: (input.observations ?? [])
      .filter((o) => o.visibility === 'parent_visible')
      .map((o) => ({
        id: o.id,
        date: String(o.date).slice(0, 10),
        teacherName: o.teacherName ?? 'Teacher',
        text: o.text,
        subjectName: o.subjectName ?? 'General',
      })),
    assignments: (input.assignments ?? []).map((a) => ({
      assignmentId: a.assignmentId,
      title: a.title,
      subjectName: a.subjectName ?? 'General',
      dueDate: a.dueDate ? String(a.dueDate).slice(0, 10) : '',
      submissionStatus: a.submissionStatus,
      teacherFeedback: a.teacherFeedback ?? null,
    })),
  };
}

export interface ParentAttendanceInput {
  studentId: string;
  records: Array<{
    date: string;
    status: string;
    remarks?: string | null;
    sessionId?: string | null;
    recordedBy?: string | null;
    recordedByTeacherId?: string | null;
    recordedAt?: string | null;
    correctedBy?: string | null;
    correctionReason?: string | null;
  }>;
}

export function toParentAttendanceProjection(input: ParentAttendanceInput): ParentAttendanceProjection {
  const records = input.records ?? [];
  const present = records.filter((r) => r.status === 'present').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const late = records.filter((r) => r.status === 'late').length;
  const excused = records.filter((r) => r.status === 'excused').length;
  const total = records.length;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
  const recentRecords = [...records]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10)
    .map((r) => ({
      date: String(r.date).slice(0, 10),
      status: String(r.status),
      remarks: r.remarks ?? null,
    }));
  return { studentId: input.studentId, percentage, present, absent, late, excused, total, recentRecords };
}

export function toParentFinanceProjection(statement: StudentFeeStatement): ParentFinanceProjection {
  return {
    studentId: statement.studentId,
    studentName: statement.studentName,
    admissionNumber: statement.admissionNumber,
    className: statement.className,
    totalAssessed: statement.totalAssessed,
    totalPaid: statement.totalPaid,
    balance: statement.balance,
    clearanceStatus: statement.clearanceStatus,
    charges: (statement.charges ?? []).map((c) => ({
      id: c.id,
      description: c.description,
      amount: c.amount,
      currency: c.currency,
      dueDate: String(c.dueDate).slice(0, 10),
      categoryName: c.categoryName ?? null,
      paidAmount: c.paidAmount,
      balance: c.balance,
    })),
    // Payer identity (names/phones/references) is bursar-operational, not
    // parent-portal data: dropped. No phone numbers anywhere.
    payments: (statement.payments ?? []).map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      paymentDate: String(p.paymentDate).slice(0, 10),
      paymentChannel: p.paymentChannel,
      receiptNumber: p.receiptNumber ?? null,
      status: p.status,
    })),
  };
}

export interface ParentActivityInput {
  studentId: string;
  studentName?: string | null;
  className?: string | null;
  streamName?: string | null;
  activityId: string;
  activityName?: string | null;
  status: ClearanceStatus;
  basis: ClearanceBasis;
  validUntil?: string | null;
  operationalNote?: string | null;
}

function clearanceLabel(status: ClearanceStatus, basis: ClearanceBasis): string {
  if (status === 'cleared') {
    if (basis === 'paid') return '✓ Cleared • Paid';
    if (basis === 'waived') return '✓ Cleared • Fee Waived';
    if (basis === 'sponsored') return '✓ Cleared • Sponsored';
    if (basis === 'promise_to_pay') return '✓ Cleared • Promise to Pay';
    if (basis === 'included') return '✓ Cleared • Included';
    return '✓ Cleared • Admin Override';
  }
  if (status === 'not_cleared') return '✗ Not Cleared for Participation';
  return 'Pending Review';
}

export function toParentActivityProjection(input: ParentActivityInput): ParentActivityProjection {
  return {
    studentId: input.studentId,
    studentName: input.studentName || 'Student',
    className: input.className || 'General',
    streamName: input.streamName ?? null,
    activityId: input.activityId,
    activityName: input.activityName || 'Activity',
    clearanceStatus: input.status,
    clearanceLabel: clearanceLabel(input.status, input.basis),
    validUntil: input.validUntil ?? null,
    operationalNote: input.operationalNote ?? null,
  };
}

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

export const parentService = {
  /**
   * Linked children for the signed-in guardian within one school.
   * Mock env -> honest [] (page shows "no linked children").
   * DB errors throw (D1 rule); no link -> [] (fail-closed).
   */
  async getParentChildren(schoolId: string): Promise<ParentChildSummary[]> {
    if (isMockEnv()) return [];
    const childIds = await resolveMyChildIds(schoolId);
    if (childIds.length === 0) return [];

    const { data: students, error: studentError } = await supabase
      .from('students')
      .select('id, admission_number, person:people!students_person_id_fkey(first_name, last_name)')
      .in('id', childIds);
    if (studentError) throw new Error('Failed to load linked children.', { cause: studentError });

    const { data: enrolments, error: enrolError } = await supabase
      .from('student_enrolments')
      .select('student_id, classes(id, name), streams(id, name)')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .in('student_id', childIds);
    if (enrolError) throw new Error('Failed to load linked children.', { cause: enrolError });

    const classByStudent = new Map<string, string>();
    for (const e of asArray(enrolments)) {
      const cls = one((e as any)?.classes);
      const stm = one((e as any)?.streams);
      if (cls?.name) classByStudent.set((e as any).student_id, stm?.name ? `${cls.name} ${stm.name}` : cls.name);
    }

    return asArray(students).map((s: any) => ({
      studentId: s.id,
      name: personName(s.person) ?? 'Unknown student',
      admission: s.admission_number ?? '—',
      class: classByStudent.get(s.id) ?? '—',
    }));
  },

  /**
   * Full per-child overview for ONE linked student.
   * Mock env -> null. Non-linked studentId -> null WITHOUT querying
   * (membership gate: sibling data can never leak across children).
   * DB errors throw (D1 rule); genuine no-data degrades to honest empties
   * inside the projections (0%, [], read-only statement with zero rows).
   */
  async getChildOverview(schoolId: string, studentId: string): Promise<ParentChildOverview | null> {
    if (isMockEnv()) return null;

    const memberIds = await resolveMyChildIds(schoolId);
    if (!memberIds.includes(studentId)) return null;

    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, admission_number, person:people!students_person_id_fkey(first_name, last_name)')
      .eq('id', studentId)
      .maybeSingle();
    if (studentError) throw new Error('Failed to load child overview.', { cause: studentError });
    const studentRow = one(student);
    if (!studentRow) return null;

    const { data: enrol, error: enrolError } = await supabase
      .from('student_enrolments')
      .select('student_id, class_id, classes(id, name), streams(id, name)')
      .eq('student_id', studentId)
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .maybeSingle();
    if (enrolError) throw new Error('Failed to load child overview.', { cause: enrolError });
    const enrolRow = one(enrol);
    const cls = one(enrolRow?.classes);
    const stm = one(enrolRow?.streams);
    const classId: string | undefined = enrolRow?.class_id ?? cls?.id;
    const classLabel = cls?.name ? (stm?.name ? `${cls.name} ${stm.name}` : cls.name) : '—';

    const child: ParentChildSummary = {
      studentId,
      name: personName(studentRow?.person) ?? 'Unknown student',
      admission: studentRow?.admission_number ?? '—',
      class: classLabel,
    };

    const { data: attendanceRows, error: attendanceError } = await supabase
      .from('student_attendance_records')
      .select('id, date, status, remarks')
      .eq('student_id', studentId)
      .order('date', { ascending: false })
      .limit(60);
    if (attendanceError) throw new Error('Failed to load child overview.', { cause: attendanceError });

    const { data: submissionRows, error: submissionError } = await supabase
      .from('student_submissions')
      .select(
        `id, assignment_id, submission_status, teacher_feedback, created_at,
         assignment:assignments!student_submissions_assignment_id_fkey(id, title, due_date, subjects(name))`,
      )
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (submissionError) throw new Error('Failed to load child overview.', { cause: submissionError });

    const { data: observationRows, error: observationError } = await supabase
      .from('teacher_observations')
      .select(
        `id, observation_text, observed_at, visibility,
         teacher:employees(people(first_name, last_name)), subjects(name)`,
      )
      .eq('student_id', studentId)
      .eq('visibility', 'parent_visible')
      .order('observed_at', { ascending: false });
    if (observationError) throw new Error('Failed to load child overview.', { cause: observationError });

    let lessonRows: any[] = [];
    if (classId) {
      const { data: lessons, error: lessonError } = await supabase
        .from('lessons')
        .select('visible_lesson_note, submitted_at, curriculum_topic, subjects(name)')
        .eq('school_id', schoolId)
        .eq('class_id', classId)
        .order('submitted_at', { ascending: false })
        .limit(8);
      if (lessonError) throw new Error('Failed to load child overview.', { cause: lessonError });
      lessonRows = asArray(lessons);
    }

    const statement = await financeService.getStudentFeeStatement(studentId);

    const { data: activityEnrolments, error: activityEnrolError } = await supabase
      .from('activity_enrolments')
      .select('student_id, student_name, class_name, stream_name, activity_id')
      .eq('school_id', schoolId)
      .eq('student_id', studentId);
    if (activityEnrolError) throw new Error('Failed to load child overview.', { cause: activityEnrolError });

    const enrolList = asArray(activityEnrolments);
    let clearanceRows: any[] = [];
    let activityRows: any[] = [];
    if (enrolList.length > 0) {
      const activityIds = [...new Set(enrolList.map((e: any) => e.activity_id).filter(Boolean))];
      const { data: clearances, error: clearanceError } = await supabase
        .from('activity_clearances')
        .select('activity_id, student_id, status, basis, valid_until, operational_note')
        .eq('student_id', studentId)
        .in('activity_id', activityIds);
      if (clearanceError) throw new Error('Failed to load child overview.', { cause: clearanceError });
      clearanceRows = asArray(clearances);

      const { data: activities, error: activityError } = await supabase
        .from('school_activities')
        .select('id, name')
        .eq('school_id', schoolId)
        .in('id', activityIds);
      if (activityError) throw new Error('Failed to load child overview.', { cause: activityError });
      activityRows = asArray(activities);
    }
    const activityNameById = new Map<string, string>(
      activityRows.map((a: any) => [a.id, a.name]),
    );

    const academic = toParentAcademicProjection({
      studentId,
      lessonNotes: lessonRows.map((l: any) => ({
        date: String(l.submitted_at ?? '').slice(0, 10),
        subjectName: one(l.subjects)?.name ?? l.curriculum_topic ?? 'General',
        visibleNote: l.visible_lesson_note ?? '',
      })),
      observations: asArray(observationRows).map((o: any) => ({
        id: o.id,
        date: String(o.observed_at ?? '').slice(0, 10),
        teacherName: personName(one(one(o.teacher)?.people)) ?? personName(one(o.teacher)) ?? 'Teacher',
        text: o.observation_text,
        subjectName: one(o.subjects)?.name ?? 'General',
        visibility: o.visibility ?? 'parent_visible',
      })),
      assignments: asArray(submissionRows).map((s: any) => {
        const a = one(s.assignment);
        return {
          assignmentId: a?.id ?? s.assignment_id,
          title: a?.title ?? 'Assignment',
          subjectName: one(a?.subjects)?.name ?? 'General',
          dueDate: a?.due_date ? String(a.due_date).slice(0, 10) : '',
          submissionStatus: s.submission_status ?? 'pending',
          teacherFeedback: s.teacher_feedback ?? null,
        };
      }),
    });

    const attendance = toParentAttendanceProjection({
      studentId,
      records: asArray(attendanceRows).map((r: any) => ({
        date: r.date,
        status: r.status,
        remarks: r.remarks ?? null,
      })),
    });

    const activities: ParentActivityProjection[] = enrolList.map((e: any) => {
      const clearance = clearanceRows.find((c: any) => c.activity_id === e.activity_id);
      return toParentActivityProjection({
        studentId,
        studentName: e.student_name ?? child.name,
        className: e.class_name ?? child.class,
        streamName: e.stream_name ?? null,
        activityId: e.activity_id,
        activityName: activityNameById.get(e.activity_id) ?? 'Activity',
        status: (clearance?.status ?? 'pending_review') as ClearanceStatus,
        basis: (clearance?.basis ?? 'promise_to_pay') as ClearanceBasis,
        validUntil: clearance?.valid_until ?? null,
        operationalNote: clearance?.operational_note ?? null,
      });
    });

    return {
      child,
      academic,
      attendance,
      finance: statement ? toParentFinanceProjection(statement) : null,
      activities,
    };
  },
};
