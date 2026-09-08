/**
 * Slice 1 Task 3 — Student Dossier & Operational Lifecycle (TDD).
 *
 * Contract under test (src/modules/students/studentService):
 * - getStudentDossier(studentId, schoolId, callerRole):
 *   Returns complete 7-domain dossier (personal, enrolment history, guardians,
 *   emergency contacts, role-scoped medical, documents).
 * - Role privacy:
 *   - Teachers receive alert-level medical only (alertOnly=true, allergies string)
 *     and zero financial account data (finance=null).
 *   - Leadership receives full medical records and financial access.
 * - updateStudentPersonal(studentId, role, payload):
 *   Updates demographic fields on people table. Throws if not leadership.
 * - transferStudent(studentId, role, payload):
 *   Invokes atomic `transfer_student_enrolment` RPC. Throws if not leadership.
 * - withdrawStudent(studentId, role, payload):
 *   Invokes atomic `withdraw_student` RPC. Throws if not leadership.
 * - updateStudentMedical(studentId, role, payload):
 *   Upserts student_medical. Throws if not leadership.
 * - Mock honesty + DB-error throw behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import { studentService } from '../modules/students/studentService';

describe('Student Dossier & Lifecycle (Slice 1 Task 3)', () => {
  let tableResponses: Record<string, unknown> = {};
  let captured: { table: string; filters: Array<[string, unknown]>; payload?: unknown; action?: string }[] = [];

  const builderFor = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const entry: { table: string; filters: Array<[string, unknown]>; payload?: unknown; action?: string } = {
      table,
      filters,
    };
    captured.push(entry);

    const respond = () => {
      const r: unknown = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };

    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn((col: string, val: unknown) => {
      filters.push([col, val]);
      return b;
    });
    b.order = vi.fn(() => b);
    b.insert = vi.fn((p: unknown) => {
      entry.action = 'insert';
      entry.payload = p;
      return b;
    });
    b.update = vi.fn((p: unknown) => {
      entry.action = 'update';
      entry.payload = p;
      return b;
    });
    b.upsert = vi.fn((p: unknown) => {
      entry.action = 'upsert';
      entry.payload = p;
      return b;
    });
    b.single = vi.fn(() => respond());
    b.maybeSingle = vi.fn(() => respond());
    (b as { then: unknown }).then = (res: unknown, rej: unknown) =>
      respond().then(res as never, rej as never);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    mockRpc.mockResolvedValue({ data: 'new-enrolment-uuid', error: null });
    tableResponses = {};
    captured = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  const STUDENT_ID = 'stu-1111-1111';
  const SCHOOL_ID = 'sch-2222-2222';

  it('(a) getStudentDossier returns complete multi-domain profile for leadership', async () => {
    tableResponses['students'] = {
      data: {
        id: STUDENT_ID,
        admission_number: 'GCC-2026-0042',
        status: 'active',
        created_at: '2026-01-10T08:00:00Z',
        person: {
          id: 'per-1111',
          first_name: 'Grace',
          last_name: 'Achieng',
          date_of_birth: '2016-04-12',
          gender: 'female',
          nationality: 'Ugandan',
          national_id: 'CM160412345',
          address: 'Plot 42 Kololo, Kampala',
          photo_url: 'https://example.com/photo.jpg',
        },
      },
      error: null,
    };

    tableResponses['student_enrolments'] = {
      data: [
        {
          id: 'enr-1',
          school_id: SCHOOL_ID,
          class_id: 'cls-1',
          stream_id: 'stm-1',
          academic_year_id: 'ay-2026',
          status: 'active',
          start_date: '2026-01-10',
          end_date: null,
          exit_reason: null,
          classes: { id: 'cls-1', name: 'Year 5' },
          streams: { id: 'stm-1', name: 'Blue' },
          academic_years: { id: 'ay-2026', name: '2026–2027' },
        },
      ],
      error: null,
    };

    tableResponses['student_guardians'] = {
      data: [
        {
          id: 'sg-1',
          relationship: 'Mother',
          is_primary: true,
          person: {
            id: 'per-g1',
            first_name: 'Sarah',
            last_name: 'Achieng',
            phone: '+256701234567',
            email: 'mother@example.com',
          },
        },
      ],
      error: null,
    };

    tableResponses['student_emergency_contacts'] = {
      data: [
        {
          id: 'sec-1',
          student_id: STUDENT_ID,
          name: 'Uncle David',
          relationship: 'Uncle',
          phone: '+256772987654',
          priority: 1,
          address: 'Ntinda, Kampala',
        },
      ],
      error: null,
    };

    tableResponses['student_medical'] = {
      data: {
        student_id: STUDENT_ID,
        allergies: 'Severe Peanut Allergy',
        conditions: 'Mild Asthma',
        medication: 'Salbutamol inhaler as needed',
        blood_group: 'O+',
        restrictions: 'Avoid strenuous cross-country in cold weather',
        notes: 'Inhaler kept with class teacher',
      },
      error: null,
    };

    tableResponses['student_documents'] = {
      data: [
        {
          id: 'doc-1',
          student_id: STUDENT_ID,
          doc_type: 'birth_certificate',
          storage_path: `${SCHOOL_ID}/${STUDENT_ID}/birth_cert.pdf`,
          uploaded_at: '2026-01-10T09:00:00Z',
        },
      ],
      error: null,
    };

    tableResponses['student_fee_accounts'] = {
      data: {
        id: 'sfa-1',
        total_billed: 1500000,
        total_paid: 1000000,
        current_balance: 500000,
      },
      error: null,
    };

    const dossier = await studentService.getStudentDossier(STUDENT_ID, SCHOOL_ID, 'principal');
    expect(dossier).not.toBeNull();
    expect(dossier?.admissionNumber).toBe('GCC-2026-0042');
    expect(dossier?.personal.fullName).toBe('Grace Achieng');
    expect(dossier?.personal.gender).toBe('female');
    expect(dossier?.personal.dateOfBirth).toBe('2016-04-12');
    expect(dossier?.currentClass).toBe('Year 5 Blue');
    expect(dossier?.enrolmentHistory).toHaveLength(1);
    expect(dossier?.guardians).toHaveLength(1);
    expect(dossier?.guardians[0].phone).toBe('+256701234567');
    expect(dossier?.emergencyContacts).toHaveLength(1);
    expect(dossier?.medical.alertOnly).toBe(false);
    expect(dossier?.medical.allergies).toBe('Severe Peanut Allergy');
    expect(dossier?.medical.medication).toBe('Salbutamol inhaler as needed');
    expect(dossier?.finance).not.toBeNull();
    expect(dossier?.finance?.balance).toBe(500000);
    expect(dossier?.documents).toHaveLength(1);
  });

  it('(b) teacher role privacy: gets allergy alert only and zero finance access', async () => {
    tableResponses['students'] = {
      data: {
        id: STUDENT_ID,
        admission_number: 'GCC-2026-0042',
        status: 'active',
        created_at: '2026-01-10T08:00:00Z',
        person: {
          id: 'per-1111',
          first_name: 'Grace',
          last_name: 'Achieng',
        },
      },
      error: null,
    };

    tableResponses['student_enrolments'] = {
      data: [
        {
          id: 'enr-1',
          school_id: SCHOOL_ID,
          class_id: 'cls-1',
          stream_id: 'stm-1',
          academic_year_id: 'ay-2026',
          status: 'active',
          start_date: '2026-01-10',
          classes: { id: 'cls-1', name: 'Year 5' },
          streams: { id: 'stm-1', name: 'Blue' },
          academic_years: { id: 'ay-2026', name: '2026–2027' },
        },
      ],
      error: null,
    };

    // Alert view for staff/teacher
    tableResponses['student_medical_alerts'] = {
      data: {
        student_id: STUDENT_ID,
        school_id: SCHOOL_ID,
        allergies: 'Severe Peanut Allergy',
      },
      error: null,
    };

    const dossier = await studentService.getStudentDossier(STUDENT_ID, SCHOOL_ID, 'teacher');
    expect(dossier).not.toBeNull();
    // Teacher sees allergy pill
    expect(dossier?.medical.alertOnly).toBe(true);
    expect(dossier?.medical.allergies).toBe('Severe Peanut Allergy');
    // Teacher does NOT see medication or private clinical notes
    expect(dossier?.medical.medication).toBeUndefined();
    expect(dossier?.medical.notes).toBeUndefined();
    // Teacher NEVER sees finance data
    expect(dossier?.finance).toBeNull();
  });

  it('(c) updateStudentPersonal updates demographic fields and throws for unauthorized roles', async () => {
    // Teacher should throw before DB call
    await expect(
      studentService.updateStudentPersonal(STUDENT_ID, 'teacher', {
        firstName: 'Grace',
        lastName: 'Achieng',
        address: 'New Address',
      })
    ).rejects.toThrow(/unauthorized/i);

    // Principal should succeed
    tableResponses['people'] = { data: { id: 'per-1111' }, error: null };
    tableResponses['students'] = { data: { person_id: 'per-1111' }, error: null };

    await studentService.updateStudentPersonal(STUDENT_ID, 'principal', {
      firstName: 'Grace',
      lastName: 'Achieng',
      dateOfBirth: '2016-04-12',
      gender: 'female',
      address: 'Plot 55 Nakasero, Kampala',
      nationality: 'Ugandan',
      nationalId: 'CM160412345',
    });

    const peopleUpdate = captured.find((c) => c.table === 'people' && c.action === 'update');
    expect(peopleUpdate).toBeDefined();
    expect(peopleUpdate?.payload).toMatchObject({
      first_name: 'Grace',
      last_name: 'Achieng',
      date_of_birth: '2016-04-12',
      gender: 'female',
      address: 'Plot 55 Nakasero, Kampala',
      nationality: 'Ugandan',
      national_id: 'CM160412345',
    });
  });

  it('(d) transferStudent calls atomic transfer_student_enrolment RPC and throws for non-leadership', async () => {
    await expect(
      studentService.transferStudent(STUDENT_ID, 'teacher', {
        targetClassId: 'cls-target',
        targetStreamId: 'stm-target',
        effectiveDate: '2026-06-01',
        reason: 'transferred_stream',
      })
    ).rejects.toThrow(/unauthorized/i);

    mockRpc.mockResolvedValueOnce({ data: 'new-enrolment-uuid', error: null });

    const newEnrolId = await studentService.transferStudent(STUDENT_ID, 'principal', {
      targetClassId: 'cls-target',
      targetStreamId: 'stm-target',
      effectiveDate: '2026-06-01',
      reason: 'transferred_stream',
    });

    expect(newEnrolId).toBe('new-enrolment-uuid');
    expect(mockRpc).toHaveBeenCalledWith('transfer_student_enrolment', {
      p_student_id: STUDENT_ID,
      p_target_class_id: 'cls-target',
      p_target_stream_id: 'stm-target',
      p_effective_date: '2026-06-01',
      p_reason: 'transferred_stream',
    });
  });

  it('(e) withdrawStudent calls atomic withdraw_student RPC and throws for non-leadership', async () => {
    await expect(
      studentService.withdrawStudent(STUDENT_ID, 'bursar', {
        effectiveDate: '2026-09-01',
        reason: 'relocated',
        finalStatus: 'withdrawn',
      })
    ).rejects.toThrow(/unauthorized/i);

    mockRpc.mockResolvedValueOnce({ data: true, error: null });

    const success = await studentService.withdrawStudent(STUDENT_ID, 'admin', {
      effectiveDate: '2026-09-01',
      reason: 'relocated',
      finalStatus: 'withdrawn',
    });

    expect(success).toBe(true);
    // 'relocated' is not a DB-allowed exit_reason — it maps to the 'other' bucket.
    expect(mockRpc).toHaveBeenCalledWith('withdraw_student', {
      p_student_id: STUDENT_ID,
      p_effective_date: '2026-09-01',
      p_exit_reason: 'other',
      p_final_status: 'withdrawn',
    });
  });

  it('(f) updateStudentMedical upserts student_medical and throws for non-leadership', async () => {
    await expect(
      studentService.updateStudentMedical(STUDENT_ID, 'teacher', {
        allergies: 'Peanuts',
      })
    ).rejects.toThrow(/unauthorized/i);

    tableResponses['student_medical'] = { data: { student_id: STUDENT_ID }, error: null };

    await studentService.updateStudentMedical(STUDENT_ID, 'principal', {
      allergies: 'Severe Peanut Allergy',
      conditions: 'Asthma',
      medication: 'Inhaler',
      bloodGroup: 'O+',
      restrictions: 'No strenuous sport in rain',
      notes: 'Parent carries epi-pen',
    });

    const medUpsert = captured.find((c) => c.table === 'student_medical' && c.action === 'upsert');
    expect(medUpsert).toBeDefined();
    expect(medUpsert?.payload).toMatchObject({
      student_id: STUDENT_ID,
      allergies: 'Severe Peanut Allergy',
      conditions: 'Asthma',
      medication: 'Inhaler',
      blood_group: 'O+',
      restrictions: 'No strenuous sport in rain',
      notes: 'Parent carries epi-pen',
    });
  });

  it('(g) mock honesty: mock env degrades safely on reads and throws on writes', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');

    const profile = await studentService.getStudentDossier(STUDENT_ID, SCHOOL_ID, 'principal');
    expect(profile).toBeNull();

    await expect(
      studentService.updateStudentPersonal(STUDENT_ID, 'principal', { firstName: 'Test' })
    ).rejects.toThrow();

    await expect(
      studentService.transferStudent(STUDENT_ID, 'principal', {
        targetClassId: 'cls-1',
        effectiveDate: '2026-01-01',
        reason: 'transferred_class',
      })
    ).rejects.toThrow();
  });

  describe('withdraw exit_reason mapping (Batch A Task 1)', () => {
    it('(h) withdrawing with UI category transferred_school SUCCEEDS with allowed enum', async () => {
      mockRpc.mockResolvedValueOnce({ data: true, error: null });

      const success = await studentService.withdrawStudent(STUDENT_ID, 'admin', {
        effectiveDate: '2026-09-01',
        reason: 'transferred_school',
        finalStatus: 'withdrawn',
      });

      expect(success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('withdraw_student', {
        p_student_id: STUDENT_ID,
        p_effective_date: '2026-09-01',
        p_exit_reason: 'withdrawn',
        p_final_status: 'withdrawn',
      });
    });

    it('(i) free-text notes suffix is stripped so the CHECK-constrained enum stays valid', async () => {
      mockRpc.mockResolvedValueOnce({ data: true, error: null });

      const success = await studentService.withdrawStudent(STUDENT_ID, 'principal', {
        effectiveDate: '2026-09-01',
        reason: "transferred_school: Relocated to Entebbe, admitted to St. Mary's",
        finalStatus: 'withdrawn',
      });

      expect(success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('withdraw_student', {
        p_student_id: STUDENT_ID,
        p_effective_date: '2026-09-01',
        p_exit_reason: 'withdrawn',
        p_final_status: 'withdrawn',
      });
    });

    it('(j) maps every UI exit-reason category to an allowed DB enum value', async () => {
      const cases: Array<[string, string]> = [
        ['transferred_school', 'withdrawn'],
        ['family_relocated', 'withdrawn'],
        ['completed_studies', 'graduated'],
        ['financial_reasons', 'withdrawn'],
        ['medical_reasons', 'withdrawn'],
        ['other', 'other'],
        // Already-allowed values pass through untouched.
        ['withdrawn', 'withdrawn'],
        ['graduated', 'graduated'],
        ['promoted', 'promoted'],
        ['transferred_class', 'transferred_class'],
        ['transferred_stream', 'transferred_stream'],
        // Unknown legacy values fall back to the honest 'other' bucket.
        ['relocated', 'other'],
      ];

      for (const [input, expected] of cases) {
        mockRpc.mockResolvedValueOnce({ data: true, error: null });
        const ok = await studentService.withdrawStudent(STUDENT_ID, 'admin', {
          effectiveDate: '2026-09-01',
          reason: input,
          finalStatus: 'withdrawn',
        });
        expect(ok).toBe(true);
        expect(mockRpc).toHaveBeenLastCalledWith('withdraw_student', {
          p_student_id: STUDENT_ID,
          p_effective_date: '2026-09-01',
          p_exit_reason: expected,
          p_final_status: 'withdrawn',
        });
      }
    });

    it('(k) defaults to withdrawn when no reason is given', async () => {
      mockRpc.mockResolvedValueOnce({ data: true, error: null });

      const success = await studentService.withdrawStudent(STUDENT_ID, 'admin', {
        effectiveDate: '2026-09-01',
        finalStatus: 'withdrawn',
      });

      expect(success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('withdraw_student', {
        p_student_id: STUDENT_ID,
        p_effective_date: '2026-09-01',
        p_exit_reason: 'withdrawn',
        p_final_status: 'withdrawn',
      });
    });
  });

  describe('guardian phone visibility gating (Batch A Task 2)', () => {
    const seedContactTables = () => {
      tableResponses['students'] = {
        data: {
          id: STUDENT_ID,
          admission_number: 'GCC-2026-0042',
          status: 'active',
          created_at: '2026-01-10T08:00:00Z',
          person: { id: 'per-1111', first_name: 'Grace', last_name: 'Achieng' },
        },
        error: null,
      };
      tableResponses['student_enrolments'] = {
        data: [
          {
            id: 'enr-1',
            status: 'active',
            start_date: '2026-01-10',
            classes: { id: 'cls-1', name: 'Year 5' },
            streams: { id: 'stm-1', name: 'Blue' },
            academic_years: { id: 'ay-2026', name: '2026–2027' },
          },
        ],
        error: null,
      };
      tableResponses['student_guardians'] = {
        data: [
          {
            id: 'sg-1',
            relationship: 'Mother',
            is_primary: true,
            person: {
              id: 'per-g1',
              first_name: 'Sarah',
              last_name: 'Achieng',
              phone: '+256701234567',
              email: 'mother@example.com',
              address: 'Plot 42 Kololo, Kampala',
            },
          },
        ],
        error: null,
      };
      tableResponses['student_emergency_contacts'] = {
        data: [
          {
            id: 'sec-1',
            student_id: STUDENT_ID,
            name: 'Uncle David',
            relationship: 'Uncle',
            phone: '+256772987654',
            priority: 1,
            address: 'Ntinda, Kampala',
          },
        ],
        error: null,
      };
      tableResponses['student_medical_alerts'] = {
        data: { student_id: STUDENT_ID, allergies: null },
        error: null,
      };
      tableResponses['student_medical'] = {
        data: {
          student_id: STUDENT_ID,
          allergies: null,
          conditions: null,
          medication: null,
          blood_group: null,
          restrictions: null,
          notes: null,
        },
        error: null,
      };
      tableResponses['student_documents'] = { data: [], error: null };
    };

    it('(l) teacher-role projection contains NO guardian phone/email/address, DOES contain emergency contact', async () => {
      seedContactTables();
      const dossier = await studentService.getStudentDossier(STUDENT_ID, SCHOOL_ID, 'teacher');
      expect(dossier).not.toBeNull();
      expect(dossier?.guardians).toHaveLength(1);
      expect(dossier?.guardians[0].name).toBe('Sarah Achieng');
      expect(dossier?.guardians[0].relationship).toBe('Mother');
      expect('phone' in (dossier?.guardians[0] as object)).toBe(false);
      expect('email' in (dossier?.guardians[0] as object)).toBe(false);
      expect('address' in (dossier?.guardians[0] as object)).toBe(false);
      expect(dossier?.emergencyContacts).toHaveLength(1);
      expect(dossier?.emergencyContacts[0]).toMatchObject({
        name: 'Uncle David',
        relationship: 'Uncle',
        phone: '+256772987654',
      });
    });

    it('(m) admin/principal projection keeps full guardian + emergency fields', async () => {
      for (const officeRole of ['admin', 'principal']) {
        seedContactTables();
        captured = [];
        const dossier = await studentService.getStudentDossier(STUDENT_ID, SCHOOL_ID, officeRole);
        expect(dossier).not.toBeNull();
        expect(dossier?.guardians[0].phone).toBe('+256701234567');
        expect(dossier?.guardians[0].email).toBe('mother@example.com');
        expect(dossier?.guardians[0].address).toBe('Plot 42 Kololo, Kampala');
        expect(dossier?.emergencyContacts[0].phone).toBe('+256772987654');
      }
    });
  });
});
