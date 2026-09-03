import { supabase } from '../../lib/supabase';
import type { StudentAcademicEvidence } from '../../types/domain';

export interface StudentDirectoryRow {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  className: string;
  streamName?: string;
}

export interface StudentAttendanceRecord {
  id: string;
  date: string;
  /** Raw status string from the record — unknown values render as-is, only the four known statuses are counted. */
  status: string;
  remarks?: string;
}

export interface StudentProfile {
  profile: {
    studentId: string;
    admissionNumber: string;
    fullName: string;
    className: string;
    photoUrl?: string;
  };
  attendance: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    percentage: number;
  };
  recentRecords: StudentAttendanceRecord[];
  feeClearanceStatus?: 'cleared' | 'partial' | 'overdue';
  feeBalance?: number;
  academicEvidence?: StudentAcademicEvidence;
}

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

export const studentService = {
  /**
   * Read-only directory of active enrolments for a school.
   * Mock env → honest [] (page shows "No students found").
   * Never throws — degrades to [].
   */
  async getStudentDirectory(schoolId: string): Promise<StudentDirectoryRow[]> {
    if (isMockEnv()) return [];
    try {
      const { data, error } = await supabase
        .from('student_enrolments')
        .select(`
          student_id,
          students!student_enrolments_student_id_fkey(
            id, admission_number,
            person:people!students_person_id_fkey(first_name, last_name)
          ),
          classes(id, name),
          streams(id, name)
        `)
        .eq('school_id', schoolId)
        .eq('status', 'active');

      if (error || !data) return [];

      return (data as any[]).map((row) => {
        const st = one(row.students);
        const person = st ? one(st.person) : null;
        const cls = one(row.classes);
        const stm = one(row.streams);
        const className = cls?.name ?? '—';
        return {
          studentId: st?.id ?? row.student_id,
          admissionNumber: st?.admission_number ?? '—',
          fullName: person?.first_name
            ? `${person.first_name}${person.last_name ? ` ${person.last_name}` : ''}`
            : 'Unknown student',
          className: stm?.name ? `${className} ${stm.name}` : className,
          streamName: stm?.name ?? undefined,
        };
      });
    } catch {
      return [];
    }
  },

  /**
   * Read-only student profile: identity + enrolment class + longitudinal
   * attendance aggregates + recent history (desc, max 10).
   * Returns null when the student is not found (or the identity lookup
   * fails) — distinct from a real student with zero attendance, which
   * returns a valid profile with 0% and empty history. Downstream
   * lookups (records, fees) degrade to empties without failing the profile.
   * Fee line is best-effort: student_fee_accounts has no read path, so a
   * failed lookup degrades to undefined and the UI hides the fee row.
   * Never throws top-level.
   */
  async getStudentProfile(studentId: string): Promise<StudentProfile | null> {
    if (isMockEnv()) return null;
    try {
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('id, admission_number, person:people!students_person_id_fkey(first_name, last_name, photo_url)')
        .eq('id', studentId)
        .maybeSingle();

      if (studentErr || !student) return null;

      const person = one((student as any).person);

      let className = '—';
      try {
        const { data: enrol } = await supabase
          .from('student_enrolments')
          .select('classes(id, name), streams(id, name)')
          .eq('student_id', studentId)
          .eq('status', 'active')
          .maybeSingle();
        const cls = one((enrol as any)?.classes);
        const stm = one((enrol as any)?.streams);
        if (cls?.name) className = stm?.name ? `${cls.name} ${stm.name}` : cls.name;
      } catch {
        // class label stays '—'
      }

      let records: Array<{ id?: string | null; date: string; status: string; remarks?: string | null }> = [];
      try {
        const { data, error } = await supabase
          .from('student_attendance_records')
          .select('id, date, status, remarks')
          .eq('student_id', studentId)
          .order('date', { ascending: false })
          .limit(60);
        if (!error && Array.isArray(data)) records = data as any[];
      } catch {
        records = [];
      }

      const present = records.filter((r) => r.status === 'present').length;
      const absent = records.filter((r) => r.status === 'absent').length;
      const late = records.filter((r) => r.status === 'late').length;
      const excused = records.filter((r) => r.status === 'excused').length;
      const total = records.length;
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

      const recentRecords: StudentAttendanceRecord[] = [...records]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 10)
        .map((r, i) => ({
          id: r.id ?? `record-${i}`,
          date: String(r.date).slice(0, 10),
          status: String(r.status),
          ...(r.remarks ? { remarks: r.remarks } : {}),
        }));

      // Fee line: best-effort only. No read policies exist → expected to
      // fail → undefined → UI hides the fee row. Never throws.
      let feeClearanceStatus: StudentProfile['feeClearanceStatus'];
      let feeBalance: number | undefined;
      try {
        const { data: fee, error: feeErr } = await supabase
          .from('student_fee_accounts')
          .select('clearance_status, balance')
          .eq('student_id', studentId)
          .maybeSingle();
        if (!feeErr && fee && ['cleared', 'partial', 'overdue'].includes((fee as any).clearance_status)) {
          feeClearanceStatus = (fee as any).clearance_status;
          feeBalance = Number((fee as any).balance ?? 0);
        }
      } catch {
        // hidden-on-empty: leave undefined
      }

      // Phase 4: Academic Learning Evidence
      const academicEvidence: StudentAcademicEvidence = {
        formalAssessments: [],
        diagnosticEvidence: [],
        observations: [],
      };

      try {
        const { data: subData } = await supabase
          .from('student_submissions')
          .select(`
            id,
            assignment_id,
            participation_status,
            submission_status,
            work_type,
            score,
            teacher_feedback,
            created_at,
            assignment:assignments!student_submissions_assignment_id_fkey(
              id, title, due_date, evidence_track, max_score, submission_type,
              subjects(name)
            )
          `)
          .eq('student_id', studentId)
          .order('created_at', { ascending: false });

        if (Array.isArray(subData)) {
          for (const s of subData) {
            const a = one(s.assignment);
            if (!a) continue;
            const subj = one(a.subjects);
            const subjectName = subj?.name ?? 'General';

            if (a.evidence_track === 'formal_graded') {
              if (s.score !== null && s.score !== undefined) {
                academicEvidence.formalAssessments.push({
                  id: s.id,
                  assignmentId: a.id,
                  title: a.title,
                  subjectName,
                  score: Number(s.score),
                  maxScore: Number(a.max_score ?? 100),
                  date: String(a.due_date ?? s.created_at).slice(0, 10),
                  teacherFeedback: s.teacher_feedback ?? undefined,
                });
              }
            } else {
              academicEvidence.diagnosticEvidence.push({
                id: s.id,
                assignmentId: a.id,
                title: a.title,
                subjectName,
                submissionType: a.submission_type,
                participationStatus: s.participation_status,
                submissionStatus: s.submission_status,
                workType: s.work_type,
                teacherFeedback: s.teacher_feedback ?? undefined,
                score: s.score !== null && s.score !== undefined ? Number(s.score) : undefined,
                date: String(a.due_date ?? s.created_at).slice(0, 10),
              });
            }
          }
        }
      } catch (err) {
        console.warn('Student academic submissions lookup fallback:', err);
      }

      try {
        const { data: obsData } = await supabase
          .from('teacher_observations')
          .select(`
            id,
            observation_type,
            observation_text,
            observed_at,
            teacher:employees(people(first_name, last_name)),
            subjects(name)
          `)
          .eq('student_id', studentId)
          .order('observed_at', { ascending: false });

        if (Array.isArray(obsData)) {
          for (const o of obsData) {
            const tch = one(o.teacher);
            const person = one(tch?.people);
            const teacherName = person ? `${person.first_name} ${person.last_name}`.trim() : 'Teacher';
            const subj = one(o.subjects);
            academicEvidence.observations.push({
              id: o.id,
              teacherName,
              type: o.observation_type,
              text: o.observation_text,
              subjectName: subj?.name ?? undefined,
              date: String(o.observed_at).slice(0, 10),
            });
          }
        }
      } catch (err) {
        console.warn('Student observations lookup fallback:', err);
      }

      return {
        profile: {
          studentId: (student as any).id,
          admissionNumber: (student as any).admission_number ?? '—',
          fullName: person?.first_name
            ? `${person.first_name}${person.last_name ? ` ${person.last_name}` : ''}`
            : 'Unknown student',
          className,
          ...(person?.photo_url ? { photoUrl: person.photo_url } : {}),
        },
        attendance: { total, present, absent, late, excused, percentage },
        recentRecords,
        ...(feeClearanceStatus ? { feeClearanceStatus, feeBalance } : {}),
        academicEvidence,
      };
    } catch {
      return null;
    }
  },
};
