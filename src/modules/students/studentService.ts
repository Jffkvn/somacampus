import { supabase } from '../../lib/supabase';

export interface StudentDirectoryRow {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  className: string;
  streamName?: string;
}

export interface StudentAttendanceRecord {
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
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
}

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

const emptyProfile = (studentId: string): StudentProfile => ({
  profile: { studentId, admissionNumber: '—', fullName: 'Unknown student', className: '—' },
  attendance: { total: 0, present: 0, absent: 0, late: 0, excused: 0, percentage: 0 },
  recentRecords: [],
});

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
   * Fee line is best-effort: student_fee_accounts has no read path, so a
   * failed lookup degrades to undefined and the UI hides the fee row.
   * Never throws top-level — degrades to empties.
   */
  async getStudentProfile(studentId: string): Promise<StudentProfile> {
    if (isMockEnv()) return emptyProfile(studentId);
    try {
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('id, admission_number, person:people!students_person_id_fkey(first_name, last_name, photo_url)')
        .eq('id', studentId)
        .maybeSingle();

      if (studentErr || !student) return emptyProfile(studentId);

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

      let records: Array<{ date: string; status: string; remarks?: string | null }> = [];
      try {
        const { data, error } = await supabase
          .from('student_attendance_records')
          .select('date, status, remarks')
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
        .map((r) => ({
          date: String(r.date).slice(0, 10),
          status: (['present', 'absent', 'late', 'excused'] as const).includes(r.status as any)
            ? (r.status as StudentAttendanceRecord['status'])
            : 'present',
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
      };
    } catch {
      return emptyProfile(studentId);
    }
  },
};
