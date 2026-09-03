import { supabase } from '../../lib/supabase';
import type {
  Assignment,
  StudentSubmission,
  TeacherReviewStatus,
  ParticipationStatus,
  SubmissionStatus,
  WorkType,
} from '../../types/domain';
import {
  validateAssignmentPayload,
  computeSubmissionMetrics,
  type CreateAssignmentPayload,
} from './assignmentDomain';

function one<T>(val: T | T[] | null | undefined): T | null {
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}

export const assignmentService = {
  async createAssignment(payload: CreateAssignmentPayload): Promise<Assignment> {
    const validation = validateAssignmentPayload(payload);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    // 1. Insert Assignment
    const { data: assignmentRow, error: assignErr } = await supabase
      .from('assignments')
      .insert({
        school_id: payload.schoolId,
        teacher_id: payload.teacherId,
        class_id: payload.classId,
        stream_id: payload.streamId ?? null,
        subject_id: payload.subjectId,
        lesson_id: payload.lessonId ?? null,
        title: payload.title.trim(),
        instructions: payload.instructions.trim(),
        assigned_date: payload.assignedDate,
        due_date: payload.dueDate,
        submission_type: payload.submissionType,
        evidence_track: payload.evidenceTrack,
        max_score: payload.maxScore ?? null,
        status: 'published',
      })
      .select('*, classes(name), streams(name), subjects(name), teacher:employees(people(first_name, last_name))')
      .single();

    if (assignErr || !assignmentRow) {
      throw new Error(`Failed to create assignment: ${assignErr?.message ?? 'Unknown error'}`);
    }

    const assignment = mapAssignmentRow(assignmentRow);

    // 2. Automatically establish expected student participants from active class enrolments
    try {
      let enrolmentQuery = supabase
        .from('student_enrolments')
        .select('student_id')
        .eq('school_id', payload.schoolId)
        .eq('class_id', payload.classId)
        .eq('status', 'active');

      if (payload.streamId) {
        enrolmentQuery = enrolmentQuery.eq('stream_id', payload.streamId);
      }

      const { data: enrolments } = await enrolmentQuery;
      if (Array.isArray(enrolments) && enrolments.length > 0) {
        const submissionRows = enrolments.map((e) => ({
          school_id: payload.schoolId,
          assignment_id: assignment.id,
          student_id: e.student_id,
          participation_status: 'expected',
          submission_status: 'pending',
          work_type: 'notebook',
          teacher_review_status: 'unreviewed',
        }));

        await supabase.from('student_submissions').insert(submissionRows);
      }
    } catch (err) {
      console.warn('Assignment roster provisioning fallback:', err);
    }

    return assignment;
  },

  async getAssignments(
    schoolId: string,
    filter?: { classId?: string; subjectId?: string; lessonId?: string }
  ): Promise<Assignment[]> {
    let query = supabase
      .from('assignments')
      .select('*, classes(name), streams(name), subjects(name), teacher:employees(people(first_name, last_name))')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (filter?.classId) {
      query = query.eq('class_id', filter.classId);
    }
    if (filter?.subjectId) {
      query = query.eq('subject_id', filter.subjectId);
    }
    if (filter?.lessonId) {
      query = query.eq('lesson_id', filter.lessonId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Failed to load assignments:', error);
      return [];
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return [];

    // Fetch submissions metrics for these assignments
    const assignmentIds = rows.map((r) => r.id);
    let allSubmissions: Array<{ assignment_id: string; participation_status: string; submission_status: string; teacher_review_status: string }> = [];
    try {
      const { data: subData } = await supabase
        .from('student_submissions')
        .select('assignment_id, participation_status, submission_status, teacher_review_status')
        .in('assignment_id', assignmentIds);
      if (Array.isArray(subData)) {
        allSubmissions = subData;
      }
    } catch {
      allSubmissions = [];
    }

    return rows.map((r) => {
      const subsForThis = allSubmissions
        .filter((s) => s.assignment_id === r.id)
        .map((s) => ({
          participationStatus: s.participation_status as any,
          submissionStatus: s.submission_status as any,
          teacherReviewStatus: s.teacher_review_status as any,
        }));
      const metrics = computeSubmissionMetrics(subsForThis);

      return {
        ...mapAssignmentRow(r),
        ...metrics,
      };
    });
  },

  async getAssignmentDetail(assignmentId: string): Promise<{
    assignment: Assignment;
    submissions: StudentSubmission[];
  } | null> {
    const { data: assignRow, error: assignErr } = await supabase
      .from('assignments')
      .select('*, classes(name), streams(name), subjects(name), teacher:employees(people(first_name, last_name))')
      .eq('id', assignmentId)
      .maybeSingle();

    if (assignErr || !assignRow) return null;

    const { data: subRows, error: subErr } = await supabase
      .from('student_submissions')
      .select('*, student:students(admission_number, people(first_name, last_name)), reviewer:employees(people(first_name, last_name))')
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: true });

    if (subErr) {
      console.warn('Failed to load assignment submissions:', subErr);
    }

    const submissions: StudentSubmission[] = (subRows || []).map(mapSubmissionRow);
    const metrics = computeSubmissionMetrics(submissions);

    return {
      assignment: {
        ...mapAssignmentRow(assignRow),
        ...metrics,
      },
      submissions,
    };
  },

  async updateSubmission(
    submissionId: string,
    updates: {
      participationStatus?: ParticipationStatus;
      submissionStatus?: SubmissionStatus;
      workType?: WorkType;
      workSummary?: string | null;
      workReferenceLocation?: string | null;
    }
  ): Promise<StudentSubmission> {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.participationStatus !== undefined) {
      payload.participation_status = updates.participationStatus;
    }
    if (updates.submissionStatus !== undefined) {
      payload.submission_status = updates.submissionStatus;
      if (updates.submissionStatus === 'submitted' || updates.submissionStatus === 'late') {
        payload.submitted_at = new Date().toISOString();
      }
    }
    if (updates.workType !== undefined) {
      payload.work_type = updates.workType;
    }
    if (updates.workSummary !== undefined) {
      payload.work_summary = updates.workSummary;
    }
    if (updates.workReferenceLocation !== undefined) {
      payload.work_reference_location = updates.workReferenceLocation;
    }

    const { data, error } = await supabase
      .from('student_submissions')
      .update(payload)
      .eq('id', submissionId)
      .select('*, student:students(admission_number, people(first_name, last_name)), reviewer:employees(people(first_name, last_name))')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update student submission: ${error?.message ?? 'Unknown error'}`);
    }

    return mapSubmissionRow(data);
  },

  async reviewSubmission(
    submissionId: string,
    review: {
      reviewStatus: TeacherReviewStatus;
      feedback?: string;
      score?: number | null;
      teacherId: string;
    }
  ): Promise<StudentSubmission> {
    const payload: Record<string, unknown> = {
      teacher_review_status: review.reviewStatus,
      teacher_feedback: review.feedback ?? null,
      score: review.score ?? null,
      reviewed_by_teacher_id: review.teacherId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('student_submissions')
      .update(payload)
      .eq('id', submissionId)
      .select('*, student:students(admission_number, people(first_name, last_name)), reviewer:employees(people(first_name, last_name))')
      .single();

    if (error || !data) {
      throw new Error(`Failed to review student submission: ${error?.message ?? 'Unknown error'}`);
    }

    return mapSubmissionRow(data);
  },
};

function mapAssignmentRow(r: any): Assignment {
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
    teacherName,
    classId: String(r.class_id),
    className: cls?.name,
    streamId: r.stream_id,
    streamName: stm?.name,
    subjectId: String(r.subject_id),
    subjectName: subj?.name,
    lessonId: r.lesson_id,
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

function mapSubmissionRow(r: any): StudentSubmission {
  const student = one(r?.student);
  const studentPerson = one(student?.people);
  const studentName = studentPerson
    ? `${studentPerson.first_name} ${studentPerson.last_name}`.trim()
    : undefined;
  const admissionNumber = student?.admission_number;

  const reviewer = one(r?.reviewer);
  const reviewerPerson = one(reviewer?.people);
  const reviewerName = reviewerPerson
    ? `${reviewerPerson.first_name} ${reviewerPerson.last_name}`.trim()
    : undefined;

  return {
    id: String(r.id),
    schoolId: String(r.school_id),
    assignmentId: String(r.assignment_id),
    studentId: String(r.student_id),
    studentName,
    admissionNumber,
    participationStatus: r.participation_status,
    submissionStatus: r.submission_status,
    submittedAt: r.submitted_at,
    workType: r.work_type,
    workSummary: r.work_summary,
    workReferenceLocation: r.work_reference_location,
    workMetadata: r.work_metadata,
    teacherReviewStatus: r.teacher_review_status,
    teacherFeedback: r.teacher_feedback,
    score: r.score,
    reviewedByTeacherId: r.reviewed_by_teacher_id,
    reviewedByTeacherName: reviewerName,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
