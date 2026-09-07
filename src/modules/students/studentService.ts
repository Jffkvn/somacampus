import { supabase } from '../../lib/supabase';
import type { StudentAcademicEvidence } from '../../types/domain';

export interface StudentDirectoryRow {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  className: string;
  streamName?: string;
  guardianPhone?: string;
  status?: string;
  medicalAlert?: string;
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
  academicEvidence?: StudentAcademicEvidence;
}

export interface StudentGuardianRow {
  id: string;
  name: string;
  relationship: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  address?: string;
}

export interface StudentEmergencyContactRow {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  priority: number;
  address?: string;
}

export interface StudentEnrolmentHistoryRow {
  id: string;
  className: string;
  streamName?: string;
  academicYearName: string;
  startDate: string;
  endDate?: string | null;
  status: string;
  exitReason?: string | null;
}

export interface StudentMedicalInfo {
  alertOnly: boolean;
  allergies?: string | null;
  conditions?: string | null;
  medication?: string | null;
  bloodGroup?: string | null;
  restrictions?: string | null;
  notes?: string | null;
}

export interface StudentDocumentRow {
  id: string;
  docType: string;
  storagePath: string;
  uploadedAt: string;
}

export interface StudentFinanceSummary {
  totalBilled: number;
  totalPaid: number;
  balance: number;
}

export interface StudentDossier {
  studentId: string;
  admissionNumber: string;
  status: string;
  currentClass: string;
  currentStream?: string;
  enrolmentId?: string;
  createdAt: string;
  personal: {
    fullName: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    nationality?: string | null;
    nationalId?: string | null;
    address?: string | null;
    photoUrl?: string | null;
  };
  enrolmentHistory: StudentEnrolmentHistoryRow[];
  guardians: StudentGuardianRow[];
  emergencyContacts: StudentEmergencyContactRow[];
  medical: StudentMedicalInfo;
  documents: StudentDocumentRow[];
  finance: StudentFinanceSummary | null;
}

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

function assertLeadershipRole(role: string): void {
  if (role !== 'admin' && role !== 'principal') {
    throw new Error(`Unauthorized: role '${role}' is not permitted to perform student operational mutations.`);
  }
}

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
            id, admission_number, status,
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
          status: st?.status ?? 'active',
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
        academicEvidence,
      };
    } catch {
      return null;
    }
  },

  /**
   * Slice 1 Task 3: Comprehensive Student Dossier
   * Returns personal, enrolment history, guardians, emergency contacts,
   * role-scoped medical info, and documents.
   * Mock env -> null. Never exposes financial info to teachers.
   */
  async getStudentDossier(
    studentId: string,
    _schoolId: string,
    callerRole: string
  ): Promise<StudentDossier | null> {
    if (isMockEnv()) return null;

    try {
      // 1. Core Student & Person details
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select(`
          id, admission_number, status, created_at,
          person:people!students_person_id_fkey(
            id, first_name, last_name, date_of_birth, gender,
            nationality, national_id, address, photo_url
          )
        `)
        .eq('id', studentId)
        .maybeSingle();

      if (studentErr || !student) return null;

      const person = one((student as any).person) ?? {};
      const firstName = person.first_name ?? '';
      const lastName = person.last_name ?? '';
      const fullName = `${firstName}${lastName ? ` ${lastName}` : ''}`.trim() || 'Unknown student';

      // 2. Enrolment History (all intervals ordered by start_date DESC)
      let enrolmentHistory: StudentEnrolmentHistoryRow[] = [];
      let currentClass = '—';
      let currentStream: string | undefined = undefined;
      let enrolmentId: string | undefined = undefined;

      try {
        const { data: enrolments } = await supabase
          .from('student_enrolments')
          .select(`
            id, status, start_date, end_date, exit_reason,
            classes(id, name),
            streams(id, name),
            academic_years(id, name)
          `)
          .eq('student_id', studentId)
          .order('start_date', { ascending: false });

        if (Array.isArray(enrolments)) {
          enrolmentHistory = enrolments.map((e: any) => {
            const cls = one(e.classes);
            const stm = one(e.streams);
            const ay = one(e.academic_years);
            return {
              id: e.id,
              className: cls?.name ?? '—',
              streamName: stm?.name ?? undefined,
              academicYearName: ay?.name ?? '—',
              startDate: e.start_date ? String(e.start_date).slice(0, 10) : '—',
              endDate: e.end_date ? String(e.end_date).slice(0, 10) : null,
              status: e.status ?? 'active',
              exitReason: e.exit_reason ?? null,
            };
          });

          // Active enrolment resolution
          const active = enrolments.find((e: any) => e.status === 'active') ?? enrolments[0];
          if (active) {
            enrolmentId = active.id;
            const cls = one(active.classes);
            const stm = one(active.streams);
            currentStream = stm?.name ?? undefined;
            currentClass = stm?.name ? `${cls?.name ?? ''} ${stm.name}`.trim() : (cls?.name ?? '—');
          }
        }
      } catch (err) {
        console.warn('Student enrolment history lookup fallback:', err);
      }

      // 3. Guardians
      let guardians: StudentGuardianRow[] = [];
      try {
        const { data: gData } = await supabase
          .from('student_guardians')
          .select(`
            id, relationship, is_primary,
            person:people!student_guardians_guardian_person_id_fkey(
              id, first_name, last_name, phone, email, address
            )
          `)
          .eq('student_id', studentId);

        if (Array.isArray(gData)) {
          guardians = gData.map((g: any) => {
            const p = one(g.person) ?? {};
            const gFirst = p.first_name ?? '';
            const gLast = p.last_name ?? '';
            const gName = `${gFirst}${gLast ? ` ${gLast}` : ''}`.trim() || 'Guardian';
            return {
              id: g.id,
              name: gName,
              relationship: g.relationship ?? 'Guardian',
              phone: p.phone ?? undefined,
              email: p.email ?? undefined,
              isPrimary: Boolean(g.is_primary),
              address: p.address ?? undefined,
            };
          });
        }
      } catch (err) {
        console.warn('Student guardians lookup fallback:', err);
      }

      // 4. Emergency Contacts
      let emergencyContacts: StudentEmergencyContactRow[] = [];
      try {
        const { data: ecData } = await supabase
          .from('student_emergency_contacts')
          .select('id, name, relationship, phone, priority, address')
          .eq('student_id', studentId)
          .order('priority', { ascending: true });

        if (Array.isArray(ecData)) {
          emergencyContacts = ecData.map((ec: any) => ({
            id: ec.id,
            name: ec.name ?? '',
            relationship: ec.relationship ?? '',
            phone: ec.phone ?? '',
            priority: ec.priority ?? 1,
            address: ec.address ?? undefined,
          }));
        }
      } catch (err) {
        console.warn('Student emergency contacts lookup fallback:', err);
      }

      // 5. Medical Information (Strict role scoping)
      let medical: StudentMedicalInfo = { alertOnly: true, allergies: null };
      if (callerRole === 'admin' || callerRole === 'principal') {
        // Leadership gets full medical dossier
        try {
          const { data: medData } = await supabase
            .from('student_medical')
            .select('*')
            .eq('student_id', studentId)
            .maybeSingle();

          if (medData) {
            medical = {
              alertOnly: false,
              allergies: medData.allergies ?? null,
              conditions: medData.conditions ?? undefined,
              medication: medData.medication ?? undefined,
              bloodGroup: medData.blood_group ?? undefined,
              restrictions: medData.restrictions ?? undefined,
              notes: medData.notes ?? undefined,
            };
          } else {
            medical = { alertOnly: false, allergies: null };
          }
        } catch (err) {
          console.warn('Student full medical lookup fallback:', err);
          medical = { alertOnly: false, allergies: null };
        }
      } else {
        // Staff/Teachers get alert-level exposure only (allergies)
        try {
          const { data: alertData } = await supabase
            .from('student_medical_alerts')
            .select('allergies')
            .eq('student_id', studentId)
            .maybeSingle();

          medical = {
            alertOnly: true,
            allergies: alertData?.allergies ?? null,
          };
        } catch (err) {
          console.warn('Student medical alert lookup fallback:', err);
          medical = { alertOnly: true, allergies: null };
        }
      }

      // 6. Documents
      let documents: StudentDocumentRow[] = [];
      try {
        const { data: docData } = await supabase
          .from('student_documents')
          .select('id, doc_type, storage_path, uploaded_at')
          .eq('student_id', studentId)
          .order('uploaded_at', { ascending: false });

        if (Array.isArray(docData)) {
          documents = docData.map((d: any) => ({
            id: d.id,
            docType: d.doc_type ?? 'document',
            storagePath: d.storage_path ?? '',
            uploadedAt: d.uploaded_at ?? '',
          }));
        }
      } catch (err) {
        console.warn('Student documents lookup fallback:', err);
      }

      // 7. Finance Summary (Teachers are completely firewalled)
      let finance: StudentFinanceSummary | null = null;
      if (callerRole === 'admin' || callerRole === 'principal' || callerRole === 'bursar') {
        try {
          const { data: feeData } = await supabase
            .from('student_fee_accounts')
            .select('total_billed, total_paid, current_balance')
            .eq('student_id', studentId)
            .maybeSingle();

          if (feeData) {
            finance = {
              totalBilled: Number(feeData.total_billed ?? 0),
              totalPaid: Number(feeData.total_paid ?? 0),
              balance: Number(feeData.current_balance ?? 0),
            };
          }
        } catch (err) {
          console.warn('Student finance lookup fallback:', err);
        }
      }

      return {
        studentId: (student as any).id,
        admissionNumber: (student as any).admission_number ?? '—',
        status: (student as any).status ?? 'active',
        currentClass,
        currentStream,
        enrolmentId,
        createdAt: String((student as any).created_at ?? ''),
        personal: {
          fullName,
          firstName,
          lastName,
          dateOfBirth: person.date_of_birth ? String(person.date_of_birth).slice(0, 10) : null,
          gender: person.gender ?? null,
          nationality: person.nationality ?? null,
          nationalId: person.national_id ?? null,
          address: person.address ?? null,
          photoUrl: person.photo_url ?? null,
        },
        enrolmentHistory,
        guardians,
        emergencyContacts,
        medical,
        documents,
        finance,
      };
    } catch {
      return null;
    }
  },

  /**
   * Updates demographic fields on the student's linked people record.
   * Gated strictly to leadership (admin/principal).
   */
  async updateStudentPersonal(
    studentId: string,
    callerRole: string,
    payload: {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      nationality?: string;
      nationalId?: string;
    }
  ): Promise<void> {
    assertLeadershipRole(callerRole);
    if (isMockEnv()) {
      throw new Error('Cannot update student personal details in mock environment');
    }

    const { data: student, error: fetchErr } = await supabase
      .from('students')
      .select('person_id')
      .eq('id', studentId)
      .single();

    if (fetchErr || !student) {
      throw new Error(`Failed to find student person record: ${fetchErr?.message ?? 'Unknown'}`);
    }

    const updatePayload: Record<string, unknown> = {};
    if (payload.firstName !== undefined) updatePayload.first_name = payload.firstName;
    if (payload.lastName !== undefined) updatePayload.last_name = payload.lastName;
    if (payload.dateOfBirth !== undefined) updatePayload.date_of_birth = payload.dateOfBirth;
    if (payload.gender !== undefined) updatePayload.gender = payload.gender;
    if (payload.address !== undefined) updatePayload.address = payload.address;
    if (payload.nationality !== undefined) updatePayload.nationality = payload.nationality;
    if (payload.nationalId !== undefined) updatePayload.national_id = payload.nationalId;

    const { error: updateErr } = await supabase
      .from('people')
      .update(updatePayload)
      .eq('id', (student as any).person_id);

    if (updateErr) {
      throw new Error(`Failed to update student details: ${updateErr.message}`);
    }
  },

  /**
   * Transfers a student to a new class/stream via atomic RPC.
   * Closes active enrolment interval and opens a new one.
   */
  async transferStudent(
    studentId: string,
    callerRole: string,
    payload: {
      targetClassId: string;
      targetStreamId?: string;
      effectiveDate?: string;
      reason?: string;
    }
  ): Promise<string> {
    assertLeadershipRole(callerRole);
    if (isMockEnv()) {
      throw new Error('Cannot transfer student in mock environment');
    }

    const { data, error } = await supabase.rpc('transfer_student_enrolment', {
      p_student_id: studentId,
      p_target_class_id: payload.targetClassId,
      p_target_stream_id: payload.targetStreamId ?? null,
      p_effective_date: payload.effectiveDate ?? null,
      p_reason: payload.reason ?? 'transferred_class',
    });

    if (error) {
      throw new Error(`Failed to transfer student: ${error.message}`);
    }

    return String(data);
  },

  /**
   * Withdraws or graduates a student via atomic RPC.
   * Closes active enrolment with exit reason and updates student status.
   */
  async withdrawStudent(
    studentId: string,
    callerRole: string,
    payload: {
      effectiveDate?: string;
      reason?: string;
      finalStatus?: 'withdrawn' | 'graduated';
    }
  ): Promise<boolean> {
    assertLeadershipRole(callerRole);
    if (isMockEnv()) {
      throw new Error('Cannot withdraw student in mock environment');
    }

    const { data, error } = await supabase.rpc('withdraw_student', {
      p_student_id: studentId,
      p_effective_date: payload.effectiveDate ?? null,
      p_exit_reason: payload.reason ?? 'withdrawn',
      p_final_status: payload.finalStatus ?? 'withdrawn',
    });

    if (error) {
      throw new Error(`Failed to withdraw student: ${error.message}`);
    }

    return Boolean(data);
  },

  /**
   * Updates student medical profile.
   * Gated strictly to leadership (admin/principal).
   */
  async updateStudentMedical(
    studentId: string,
    callerRole: string,
    payload: {
      allergies?: string;
      conditions?: string;
      medication?: string;
      bloodGroup?: string;
      restrictions?: string;
      notes?: string;
    }
  ): Promise<void> {
    assertLeadershipRole(callerRole);
    if (isMockEnv()) {
      throw new Error('Cannot update medical information in mock environment');
    }

    const { error } = await supabase.from('student_medical').upsert({
      student_id: studentId,
      allergies: payload.allergies ?? null,
      conditions: payload.conditions ?? null,
      medication: payload.medication ?? null,
      blood_group: payload.bloodGroup ?? null,
      restrictions: payload.restrictions ?? null,
      notes: payload.notes ?? null,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to update medical details: ${error.message}`);
    }
  },
};
