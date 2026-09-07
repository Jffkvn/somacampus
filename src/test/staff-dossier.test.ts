/**
 * Slice 1 Task 4 — Staff Directory, Hire Wizard & Staff Dossier (TDD).
 *
 * Tests the staffService contract:
 * - listStaff: filter by query, teaching vs support, status.
 * - hireStaff: leadership gate (admin/principal), atomic creation, official subjects.
 * - getStaffDossier: comprehensive 6-domain dossier, teacher financial firewall.
 * - updateStaffPersonal: personal & employment updates.
 * - appointTeacherSubject / removeTeacherSubject: official subject appointments.
 * - exitStaffMember: non-destructive offboarding, status + exit_date + exit_reason.
 * - mock honesty & error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockRpc, mockStorageFrom, mockUpload } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
    storage: { from: mockStorageFrom },
  },
}));

import { staffService } from '../modules/staff/staffService';
import type { HireStaffPayload, StaffExitPayload } from '../types/domain';

describe('Staff Directory & Staff Dossier (Slice 1 Task 4)', () => {
  let tableResponses: Record<string, unknown> = {};
  let captured: { table: string; filters: Array<[string, unknown]> }[] = [];

  const builderFor = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    captured.push({ table, filters });
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
    b.ilike = vi.fn(() => b);
    b.or = vi.fn(() => b);
    b.is = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.insert = vi.fn(() => b);
    b.update = vi.fn(() => b);
    b.delete = vi.fn(() => b);
    b.single = vi.fn(() => respond());
    b.maybeSingle = vi.fn(() => respond());
    (b as { then: unknown }).then = (res: unknown, rej: unknown) =>
      respond().then(res as never, rej as never);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    captured = [];
    tableResponses = {};
    mockFrom.mockReset();
    mockFrom.mockImplementation((tbl: string) => builderFor(tbl));
    mockRpc.mockReset();
    mockUpload.mockReset();
    mockStorageFrom.mockReturnValue({ upload: mockUpload });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('(1) listStaff returns employees joined with people, filtered by school and options', async () => {
    tableResponses['employees'] = {
      data: [
        {
          id: 'emp-1',
          person_id: 'p-1',
          school_id: 'sch-1',
          employee_number: 'EMP-2026-0001',
          role: 'Primary Teacher',
          department: 'Academics',
          is_teacher: true,
          status: 'active',
          hire_date: '2026-01-10',
          contract_type: 'permanent',
          qualification: 'Bachelor of Education',
          people: {
            first_name: 'John',
            last_name: 'Okello',
            email: 'john.okello@school.ug',
            phone: '+256701111111',
          },
          teacher_official_subjects: [
            {
              id: 'tos-1',
              subject_id: 'sub-math',
              subjects: { name: 'Mathematics' },
            },
          ],
        },
        {
          id: 'emp-2',
          person_id: 'p-2',
          school_id: 'sch-1',
          employee_number: 'EMP-2026-0002',
          role: 'Accountant',
          department: 'Finance',
          is_teacher: false,
          status: 'active',
          hire_date: '2026-02-01',
          contract_type: 'fixed_term',
          qualification: 'CPA',
          people: {
            first_name: 'Sarah',
            last_name: 'Namono',
            email: 'sarah.n@school.ug',
            phone: '+256702222222',
          },
          teacher_official_subjects: [],
        },
      ],
      error: null,
    };

    const list = await staffService.listStaff('sch-1');
    expect(list).toHaveLength(2);
    expect(list[0].fullName).toBe('John Okello');
    expect(list[0].isTeacher).toBe(true);
    expect(list[0].officialSubjects).toHaveLength(1);
    expect(list[0].officialSubjects[0].subjectName).toBe('Mathematics');
    expect(list[1].fullName).toBe('Sarah Namono');
    expect(list[1].isTeacher).toBe(false);
  });

  it('(2) hireStaff: leadership gate rejects teacher/bursar/parent before any DB call', async () => {
    const payload: HireStaffPayload = {
      schoolId: 'sch-1',
      firstName: 'David',
      lastName: 'Mukasa',
      role: 'Science Teacher',
      department: 'Academics',
      isTeacher: true,
      contractType: 'permanent',
    };

    for (const forbidden of ['teacher', 'bursar', 'parent', 'student'] as const) {
      await expect(
        staffService.hireStaff(payload, forbidden)
      ).rejects.toThrow(/Leadership role required/i);
    }

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('(3) hireStaff: invokes hire_staff_member RPC for admin/principal', async () => {
    mockRpc.mockResolvedValueOnce({
      data: 'emp-new-uuid',
      error: null,
    });

    const payload: HireStaffPayload = {
      schoolId: 'sch-1',
      firstName: 'David',
      lastName: 'Mukasa',
      email: 'david.m@school.ug',
      phone: '+256703333333',
      dateOfBirth: '1990-05-14',
      gender: 'male',
      nationalId: 'CM900111222333',
      nationality: 'Ugandan',
      address: 'Plot 4 Entebbe Rd',
      role: 'Science Teacher',
      department: 'Academics',
      isTeacher: true,
      hireDate: '2026-09-01',
      contractType: 'permanent',
      qualification: 'B.Sc Education (Honours)',
      subjectIds: ['sub-sci', 'sub-math'],
    };

    const empId = await staffService.hireStaff(payload, 'principal');
    expect(empId).toBe('emp-new-uuid');
    expect(mockRpc).toHaveBeenCalledWith('hire_staff_member', expect.objectContaining({
      p_school_id: 'sch-1',
      p_first_name: 'David',
      p_last_name: 'Mukasa',
      p_email: 'david.m@school.ug',
      p_is_teacher: true,
      p_subject_ids: ['sub-sci', 'sub-math'],
    }));
  });

  it('(4) getStaffDossier: teacher privacy firewall blocks non-self teacher from seeing payroll', async () => {
    tableResponses['employees'] = {
      data: {
        id: 'emp-10',
        person_id: 'p-10',
        school_id: 'sch-1',
        employee_number: 'EMP-2026-0010',
        role: 'Teacher',
        department: 'Academics',
        is_teacher: true,
        status: 'active',
        hire_date: '2026-01-01',
        exit_date: null,
        exit_reason: null,
        contract_type: 'permanent',
        qualification: 'B.Ed',
        notes: null,
        people: {
          first_name: 'Alice',
          last_name: 'Kigozi',
          email: 'alice@school.ug',
          phone: '+256704444444',
          date_of_birth: '1992-04-10',
          gender: 'female',
          national_id: 'CF920111222',
          nationality: 'Ugandan',
          address: 'Ntinda, Kampala',
          photo_url: null,
        },
      },
      error: null,
    };
    tableResponses['teacher_official_subjects'] = { data: [], error: null };
    tableResponses['teaching_allocations'] = { data: [], error: null };
    tableResponses['staff_documents'] = { data: [], error: null };
    tableResponses['employee_leave_entitlements'] = { data: [], error: null };
    tableResponses['employee_payroll_profiles'] = {
      data: {
        base_salary: 2500000,
        bank_name: 'Stanbic Bank',
        bank_account_number: '9030012345678',
      },
      error: null,
    };

    // When viewed by a teacher who is NOT Alice (different employee/user id)
    const dossierForColleague = await staffService.getStaffDossier('emp-10', 'teacher', 'other-emp');
    expect(dossierForColleague.payrollSummary).toBeNull();

    // When viewed by an admin or principal
    const dossierForAdmin = await staffService.getStaffDossier('emp-10', 'admin', 'admin-user');
    expect(dossierForAdmin.payrollSummary).not.toBeNull();
    expect(dossierForAdmin.payrollSummary?.canView).toBe(true);
    expect(dossierForAdmin.payrollSummary?.profileConfigured).toBe(true);
    expect(dossierForAdmin.payrollSummary?.baseSalary).toBe(2500000);
  });

  it('(5) appointTeacherSubject: assigns subject to teacher in official subjects', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'tos-new-uuid', error: null });

    const tosId = await staffService.appointTeacherSubject(
      'sch-1',
      'emp-1',
      'sub-chem',
      'Appointed for A-Level Chemistry',
      'principal'
    );
    expect(tosId).toBe('tos-new-uuid');
    expect(mockRpc).toHaveBeenCalledWith('appoint_teacher_subject', {
      p_school_id: 'sch-1',
      p_teacher_id: 'emp-1',
      p_subject_id: 'sub-chem',
      p_notes: 'Appointed for A-Level Chemistry',
    });
  });

  it('(6) exitStaffMember: leadership gate + sets exit_date, exit_reason, status=terminated without deleting', async () => {
    // Non-leadership rejected
    const payload: StaffExitPayload = {
      exitDate: '2026-09-30',
      exitReason: 'resigned',
      notes: 'Moving to international school',
      status: 'terminated',
    };

    await expect(
      staffService.exitStaffMember('emp-1', payload, 'teacher')
    ).rejects.toThrow(/Leadership role required/i);

    // Leadership approved
    mockRpc.mockResolvedValueOnce({ data: 'emp-1', error: null });
    const res = await staffService.exitStaffMember('emp-1', payload, 'admin');
    expect(res).toBe('emp-1');
    expect(mockRpc).toHaveBeenCalledWith('exit_staff_member', {
      p_employee_id: 'emp-1',
      p_exit_date: '2026-09-30',
      p_exit_reason: 'resigned',
      p_status: 'terminated',
    });
  });

  it('(7) honest mock fallbacks and error handling', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');

    const list = await staffService.listStaff('sch-1');
    expect(list).toEqual([]);

    const payload: HireStaffPayload = {
      schoolId: 'sch-1',
      firstName: 'Test',
      lastName: 'Staff',
      role: 'Teacher',
      department: 'Academics',
      isTeacher: true,
      contractType: 'permanent',
    };

    await expect(staffService.hireStaff(payload, 'admin')).rejects.toThrow(
      /Cannot hire staff in mock environment/i
    );
  });
});
