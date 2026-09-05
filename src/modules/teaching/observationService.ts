import { supabase } from '../../lib/supabase';
import type { TeacherObservation, ObservationType, ObservationVisibility } from '../../types/domain';

export interface CreateObservationInput {
  schoolId: string;
  studentId: string;
  teacherId: string;
  classId: string;
  streamId?: string | null;
  subjectId?: string | null;
  lessonId?: string | null;
  assignmentId?: string | null;
  observationType: ObservationType;
  observationText: string;
  visibility?: ObservationVisibility;
  observedAt?: string;
}

export const observationService = {
  async createObservation(input: CreateObservationInput): Promise<TeacherObservation> {
    if (!input.observationText?.trim()) {
      throw new Error('Observation text is required');
    }
    if (!input.studentId) {
      throw new Error('Student ID is required');
    }
    if (!input.teacherId) {
      throw new Error('Teacher ID is required');
    }
    if (!input.classId) {
      throw new Error('Class ID is required');
    }

    const { data, error } = await supabase
      .from('teacher_observations')
      .insert({
        school_id: input.schoolId,
        student_id: input.studentId,
        teacher_id: input.teacherId,
        class_id: input.classId,
        stream_id: input.streamId ?? null,
        subject_id: input.subjectId ?? null,
        lesson_id: input.lessonId ?? null,
        assignment_id: input.assignmentId ?? null,
        observation_type: input.observationType,
        observation_text: input.observationText.trim(),
        visibility: input.visibility ?? 'academic_team',
        observed_at: input.observedAt ?? new Date().toISOString(),
      })
      .select('*, teacher:employees(people(first_name, last_name)), student:students(admission_number, people(first_name, last_name)), subjects(name), classes(name), streams(name)')
      .single();

    if (error || !data) {
      throw new Error(`Failed to record teacher observation: ${error?.message ?? 'Unknown error'}`);
    }

    return mapObservationRow(data);
  },

  async getObservationsForStudent(studentId: string): Promise<TeacherObservation[]> {
    const { data, error } = await supabase
      .from('teacher_observations')
      .select('*, teacher:employees(people(first_name, last_name)), student:students(admission_number, people(first_name, last_name)), subjects(name), classes(name), streams(name)')
      .eq('student_id', studentId)
      .order('observed_at', { ascending: false });

    if (error) {
      console.warn('Failed to load observations for student:', error);
      return [];
    }

    return (data || []).map(mapObservationRow);
  },

  /**
   * Draft-context query (Phase 8F Task 2): parent_visible observations for
   * one student, filtered SERVER-SIDE (.eq visibility) with the student
   * join selected so mapObservationRow.studentName resolves. Callers keep
   * the client-side parent_visible double-filter as belt-and-braces.
   */
  async getParentVisibleObservationsForStudent(studentId: string): Promise<TeacherObservation[]> {
    const { data, error } = await supabase
      .from('teacher_observations')
      .select('*, teacher:employees(people(first_name, last_name)), student:students(admission_number, people(first_name, last_name)), subjects(name), classes(name), streams(name)')
      .eq('student_id', studentId)
      .eq('visibility', 'parent_visible')
      .order('observed_at', { ascending: false });

    if (error) {
      console.warn('Failed to load parent-visible observations for student:', error);
      return [];
    }

    return (data || []).map(mapObservationRow);
  },

  async getObservationsForLesson(lessonId: string): Promise<TeacherObservation[]> {
    const { data, error } = await supabase
      .from('teacher_observations')
      .select('*, teacher:employees(people(first_name, last_name)), student:students(admission_number, people(first_name, last_name)), subjects(name), classes(name), streams(name)')
      .eq('lesson_id', lessonId)
      .order('observed_at', { ascending: false });

    if (error) {
      console.warn('Failed to load observations for lesson:', error);
      return [];
    }

    return (data || []).map(mapObservationRow);
  },
};

function one<T>(val: T | T[] | null | undefined): T | null {
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}

function mapObservationRow(r: any): TeacherObservation {
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
    studentName,
    teacherId: String(r.teacher_id),
    teacherName,
    classId: String(r.class_id),
    className: cls?.name,
    streamId: r.stream_id,
    streamName: stm?.name,
    subjectId: r.subject_id,
    subjectName: subj?.name,
    lessonId: r.lesson_id,
    assignmentId: r.assignment_id,
    observationType: r.observation_type,
    observationText: r.observation_text,
    visibility: r.visibility,
    observedAt: r.observed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
