/**
 * P3-B exam sitting service — create sitting, list candidates, record human marks.
 * recordExamMark → learning_results (result_source='exam'). AI never writes marks.
 */
import { supabase } from '../../lib/supabase';
import {
  validateMark,
  validateSitting,
  type ExamCandidate,
  type ExamDelivery,
  type ExamSitting,
} from './examDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapSitting(r: any): ExamSitting {
  return {
    id: r.id,
    schoolId: r.school_id,
    subjectId: r.subject_id ?? null,
    classId: r.class_id ?? null,
    termLabel: r.term_label,
    title: r.title,
    examDate: r.exam_date ?? null,
    maxMarks: Number(r.max_marks ?? 100),
    venueNote: r.venue_note ?? null,
    delivery: r.delivery ?? 'in_person_only',
    status: r.status ?? 'draft',
  };
}

export const examService = {
  async createSitting(input: {
    schoolId: string;
    subjectId?: string | null;
    classId?: string | null;
    termLabel: string;
    title: string;
    examDate?: string | null;
    maxMarks?: number;
    venueNote?: string | null;
    delivery?: ExamDelivery;
  }): Promise<ExamSitting> {
    validateSitting({
      title: input.title,
      termLabel: input.termLabel,
      maxMarks: input.maxMarks ?? 100,
      delivery: input.delivery,
    });
    if (isMockEnv()) throw new Error('exam.createSitting: unavailable without live database');
    const { data, error } = await supabase
      .from('exam_sittings')
      .insert({
        school_id: input.schoolId,
        subject_id: input.subjectId ?? null,
        class_id: input.classId ?? null,
        term_label: input.termLabel.trim(),
        title: input.title.trim(),
        exam_date: input.examDate ?? null,
        max_marks: input.maxMarks ?? 100,
        venue_note: input.venueNote ?? null,
        delivery: input.delivery ?? 'in_person_only',
        status: 'draft',
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`exam.createSitting: ${error?.message ?? 'no row'}`);
    return mapSitting(data);
  },

  async listSittings(schoolId: string): Promise<ExamSitting[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('exam_sittings')
      .select('*')
      .eq('school_id', schoolId)
      .order('exam_date', { ascending: false, nullsFirst: false });
    if (error) throw new Error(`exam.listSittings: ${error.message}`);
    return (data ?? []).map(mapSitting);
  },

  async getSitting(id: string): Promise<ExamSitting | null> {
    if (isMockEnv()) return null;
    const { data, error } = await supabase.from('exam_sittings').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`exam.getSitting: ${error.message}`);
    return data ? mapSitting(data) : null;
  },

  async listCandidates(sitting: ExamSitting): Promise<ExamCandidate[]> {
    if (isMockEnv()) return [];
    const names = new Map<string, string>();
    let studentIds: string[] = [];

    if (sitting.classId) {
      const { data: enrolments, error } = await supabase
        .from('student_enrolments')
        .select('student_id')
        .eq('school_id', sitting.schoolId)
        .eq('class_id', sitting.classId)
        .eq('status', 'active');
      if (error) throw new Error(`exam.listCandidates: ${error.message}`);
      studentIds = [...new Set(((enrolments ?? []) as any[]).map((e) => String(e.student_id)))];
    }

    const { data: markRows, error: markErr } = await supabase
      .from('exam_marks')
      .select('student_id, score, note')
      .eq('sitting_id', sitting.id);
    if (markErr) throw new Error(`exam.listCandidates(marks): ${markErr.message}`);
    for (const m of ((markRows ?? []) as any[]) ?? []) {
      const id = String(m.student_id);
      if (!studentIds.includes(id)) studentIds.push(id);
    }

    if (studentIds.length) {
      const { data: students, error: stErr } = await supabase
        .from('students')
        .select('id, person:people!students_person_id_fkey(first_name, last_name)')
        .in('id', studentIds);
      if (stErr) throw new Error(`exam.listCandidates(students): ${stErr.message}`);
      for (const s of ((students ?? []) as any[]) ?? []) {
        const person = Array.isArray(s.person) ? s.person[0] : s.person;
        const n = [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim();
        if (n) names.set(String(s.id), n);
      }
    }

    const markByStudent = new Map(
      (((markRows ?? []) as any[]) ?? []).map((m) => [String(m.student_id), m]),
    );

    return studentIds.map((studentId) => {
      const m = markByStudent.get(studentId);
      return {
        studentId,
        studentName: names.get(studentId) || null,
        score: m?.score == null ? null : Number(m.score),
        note: m?.note ?? null,
      };
    });
  },

  async recordMark(input: {
    sittingId: string;
    studentId: string;
    score: number | null;
    note?: string | null;
    maxMarks: number;
  }): Promise<void> {
    validateMark(input.score, input.maxMarks);
    if (isMockEnv()) throw new Error('exam.recordMark: unavailable without live database');
    const { error } = await supabase.rpc('record_exam_mark', {
      p_sitting_id: input.sittingId,
      p_student_id: input.studentId,
      p_score: input.score,
      p_note: input.note ?? null,
    });
    if (error) throw new Error(`exam.recordMark: ${error.message}`);
  },
};
