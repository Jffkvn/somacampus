/**
 * Staff Service (Slice 1 Task 4).
 *
 * Operational staff management:
 * - listStaff: Filtered directory of teaching and support staff.
 * - hireStaff: Atomic hiring wizard creation + official subject appointments.
 * - getStaffDossier: Multi-domain dossier with teacher financial firewall.
 * - updateStaffPersonal: Edit personal and contract details.
 * - appointTeacherSubject / removeTeacherSubject: Official curriculum qualifications.
 * - exitStaffMember: Non-destructive offboarding, preserving all historical records.
 * - uploadStaffDocument: Private staff documentation in staff_docs bucket.
 */
import { supabase } from '../../lib/supabase';
import type { UserRole } from '../../config/permissions';
import type {
  StaffMemberSummary,
  StaffDossier,
  StaffDocumentItem,
  HireStaffPayload,
  StaffExitPayload,
  TeacherOfficialSubject,
  TeachingAllocation,
} from '../../types/domain';

function isMockEnv(): boolean {
  return !import.meta.env.VITE_SUPABASE_URL;
}

export function assertLeadershipRole(role?: UserRole): void {
  if (role !== 'admin' && role !== 'principal') {
    throw new Error('Leadership role required (admin or principal).');
  }
}



export const staffService = {
  /**
   * List staff members in a school with search and role/status filtering.
   */
  async listStaff(
    schoolId: string,
    options: {
      search?: string;
      type?: 'all' | 'teaching' | 'support';
      status?: 'all' | 'active' | 'on_leave' | 'terminated';
    } = {}
  ): Promise<StaffMemberSummary[]> {
    if (isMockEnv()) {
      return [];
    }

    let data: any[] | null = null;

    try {
      let query = supabase
        .from('employees')
        .select(`
          id,
          person_id,
          school_id,
          employee_number,
          role,
          department,
          is_teacher,
          status,
          hire_date,
          contract_type,
          qualification,
          people:person_id (
            first_name,
            last_name,
            email,
            phone
          ),
          teacher_official_subjects (
            id,
            subject_id,
            subjects:subject_id (
              name
            )
          )
        `)
        .eq('school_id', schoolId)
        .order('employee_number', { ascending: true });

      if (options.type === 'teaching') {
        query = query.eq('is_teacher', true);
      } else if (options.type === 'support') {
        query = query.eq('is_teacher', false);
      }

      if (options.status && options.status !== 'all') {
        query = query.eq('status', options.status);
      }

      const res = await query;
      if (res.error) {
        throw res.error;
      }
      data = res.data;
    } catch (err: any) {
      console.warn('Extended staff list query failed; falling back to baseline schema:', err?.message);
      try {
        let baseQuery = supabase
          .from('employees')
          .select(`
            id,
            person_id,
            school_id,
            employee_number,
            role,
            department,
            is_teacher,
            status,
            people:person_id (
              first_name,
              last_name,
              email,
              phone
            )
          `)
          .eq('school_id', schoolId)
          .order('employee_number', { ascending: true });

        if (options.type === 'teaching') {
          baseQuery = baseQuery.eq('is_teacher', true);
        } else if (options.type === 'support') {
          baseQuery = baseQuery.eq('is_teacher', false);
        }

        if (options.status && options.status !== 'all') {
          baseQuery = baseQuery.eq('status', options.status);
        }

        const baseRes = await baseQuery;
        if (!baseRes.error) {
          data = baseRes.data;
        } else {
          throw baseRes.error;
        }
      } catch (baseErr: any) {
        throw new Error(`staffService.listStaff: ${baseErr?.message || 'Database query failed'}`);
      }
    }

    if (!data || data.length === 0) {
      return [];
    }

    const summaries: StaffMemberSummary[] = (data as any[]).map((emp) => {
      const p = emp.people || {};
      const fName = p.first_name || '';
      const lName = p.last_name || '';
      const subjects = (emp.teacher_official_subjects || []).map((tos: any) => ({
        id: tos.id,
        subjectId: tos.subject_id,
        subjectName: tos.subjects?.name || 'Unknown Subject',
      }));

      return {
        id: emp.id,
        personId: emp.person_id,
        schoolId: emp.school_id,
        employeeNumber: emp.employee_number,
        firstName: fName,
        lastName: lName,
        fullName: `${fName} ${lName}`.trim(),
        email: p.email ?? null,
        phone: p.phone ?? null,
        role: emp.role || 'Staff',
        department: emp.department || 'General',
        isTeacher: Boolean(emp.is_teacher),
        status: emp.status || 'active',
        hireDate: emp.hire_date ?? null,
        contractType: emp.contract_type ?? null,
        qualification: emp.qualification ?? null,
        officialSubjects: subjects,
      };
    });

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      return summaries.filter((s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.employeeNumber.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        (s.qualification && s.qualification.toLowerCase().includes(q))
      );
    }

    return summaries;
  },

  /**
   * Get active curriculum subjects for the school.
   */
  async getSchoolSubjects(schoolId: string): Promise<Array<{ id: string; name: string; code: string }>> {
    if (isMockEnv()) {
      return [];
    }
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, code')
      .eq('school_id', schoolId)
      .order('name');
    if (error) throw error;
    return (data || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      code: s.code || '',
    }));
  },

  /**
   * Atomic staff hiring via hire_staff_member RPC.
   */
  async hireStaff(payload: HireStaffPayload, actorRole?: UserRole): Promise<string> {
    assertLeadershipRole(actorRole);

    if (isMockEnv()) {
      throw new Error('Cannot hire staff in mock environment: live database required.');
    }

    if (!payload.firstName?.trim() || !payload.lastName?.trim()) {
      throw new Error('First name and last name are required.');
    }

    const { data, error } = await supabase.rpc('hire_staff_member', {
      p_school_id: payload.schoolId,
      p_first_name: payload.firstName.trim(),
      p_last_name: payload.lastName.trim(),
      p_email: payload.email?.trim() || null,
      p_phone: payload.phone?.trim() || null,
      p_date_of_birth: payload.dateOfBirth || null,
      p_gender: payload.gender || null,
      p_national_id: payload.nationalId?.trim() || null,
      p_nationality: payload.nationality?.trim() || null,
      p_address: payload.address?.trim() || null,
      p_role: payload.role.trim(),
      p_department: payload.department.trim(),
      p_is_teacher: payload.isTeacher,
      p_hire_date: payload.hireDate || new Date().toISOString().split('T')[0],
      p_contract_type: payload.contractType || 'permanent',
      p_qualification: payload.qualification?.trim() || null,
      p_employee_number: payload.employeeNumber?.trim() || null,
      p_subject_ids: payload.subjectIds && payload.subjectIds.length > 0 ? payload.subjectIds : null,
    });

    if (error) {
      const isMissingRpc =
        error.code === 'PGRST202' ||
        error.message?.includes('schema cache') ||
        error.message?.includes('hire_staff_member') ||
        error.message?.includes('Could not find the function');

      if (!isMissingRpc) {
        throw error;
      }

      console.warn('hire_staff_member RPC not present in schema cache; attempting direct table inserts.');

      const { data: personData, error: personErr } = await supabase
        .from('people')
        .insert({
          school_id: payload.schoolId,
          first_name: payload.firstName.trim(),
          last_name: payload.lastName.trim(),
          email: payload.email?.trim() || null,
          phone: payload.phone?.trim() || null,
          gender: payload.gender || null,
          date_of_birth: payload.dateOfBirth || null,
          national_id: payload.nationalId?.trim() || null,
          nationality: payload.nationality?.trim() || null,
          address: payload.address?.trim() || null,
        })
        .select('id')
        .single();

      if (personErr || !personData) {
        throw new Error(`hireStaffMember: Failed to create person record: ${personErr?.message || 'Unknown error'}`);
      }

      const empNumber =
        payload.employeeNumber?.trim() ||
        `EMP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const { data: empData, error: empErr } = await supabase
        .from('employees')
        .insert({
          person_id: personData.id,
          school_id: payload.schoolId,
          employee_number: empNumber,
          role: payload.role.trim() || 'teacher',
          department: payload.department.trim() || 'Academics',
          is_teacher: payload.isTeacher ?? true,
          status: 'active',
          hire_date: payload.hireDate || new Date().toISOString().split('T')[0],
          contract_type: payload.contractType || 'permanent',
          qualification: payload.qualification?.trim() || null,
        })
        .select('id')
        .single();

      if (empErr || !empData) {
        throw new Error(`hireStaffMember: Failed to create employee record: ${empErr?.message || 'Unknown error'}`);
      }

      if (payload.subjectIds && payload.subjectIds.length > 0) {
        const subjectsPayload = payload.subjectIds.map((sId) => ({
          school_id: payload.schoolId,
          teacher_id: empData.id,
          subject_id: sId,
          appointed_at: payload.hireDate || new Date().toISOString().split('T')[0],
        }));
        await supabase.from('teacher_official_subjects').insert(subjectsPayload);
      }

      return empData.id;
    }
    return data as string;
  },

  /**
   * Comprehensive 6-domain Personnel Dossier with strict financial firewall.
   */
  async getStaffDossier(
    employeeId: string,
    callerRole?: UserRole,
    callerEmployeeOrUserId?: string
  ): Promise<StaffDossier> {
    if (isMockEnv()) {
      throw new Error('staffService.getStaffDossier: unavailable in mock environment (no fake reads)');
    }

    let emp: any = null;

    try {
      const { data: extEmp, error: empError } = await supabase
        .from('employees')
        .select(`
          id,
          person_id,
          school_id,
          employee_number,
          role,
          department,
          is_teacher,
          status,
          hire_date,
          exit_date,
          exit_reason,
          contract_type,
          qualification,
          notes,
          people:person_id (
            first_name,
            last_name,
            email,
            phone,
            date_of_birth,
            gender,
            national_id,
            nationality,
            address,
            photo_url
          )
        `)
        .eq('id', employeeId)
        .single();

      if (empError) throw empError;
      emp = extEmp;
    } catch (err: any) {
      console.warn('Extended staff dossier query failed, falling back to baseline schema:', err?.message);
      try {
        const { data: baseEmp, error: baseErr } = await supabase
          .from('employees')
          .select(`
            id,
            person_id,
            school_id,
            employee_number,
            role,
            department,
            is_teacher,
            status,
            people:person_id (
              first_name,
              last_name,
              email,
              phone,
              photo_url
            )
          `)
          .eq('id', employeeId)
          .single();

        if (!baseErr && baseEmp) {
          emp = baseEmp;
        }
      } catch {}
    }

    if (!emp) {
      throw new Error(`Staff member with ID ${employeeId} not found.`);
    }

    const p = (emp as any).people || {};
    const fName = p.first_name || '';
    const lName = p.last_name || '';

    // Query official subjects
    const { data: tosData } = await supabase
      .from('teacher_official_subjects')
      .select('id, school_id, teacher_id, subject_id, appointed_at, notes, subjects:subject_id(name)')
      .eq('teacher_id', employeeId);

    const officialSubjects: TeacherOfficialSubject[] = (tosData || []).map((row: any) => ({
      id: row.id,
      schoolId: row.school_id,
      teacherId: row.teacher_id,
      subjectId: row.subject_id,
      subjectName: row.subjects?.name || 'Unknown Subject',
      appointedAt: row.appointed_at,
      notes: row.notes,
    }));

    // Query active teaching allocations
    const { data: allocData } = await supabase
      .from('teaching_allocations')
      .select(`
        id,
        school_id,
        academic_year_id,
        class_id,
        stream_id,
        subject_id,
        teacher_id,
        periods_per_week,
        status,
        allocation_source,
        proposal_reason,
        approved_by,
        approved_at,
        effective_from,
        effective_to,
        classes:class_id(name),
        streams:stream_id(name),
        subjects:subject_id(name)
      `)
      .eq('teacher_id', employeeId)
      .eq('status', 'approved');

    const activeAllocations: TeachingAllocation[] = (allocData || []).map((row: any) => ({
      id: row.id,
      schoolId: row.school_id,
      academicYearId: row.academic_year_id,
      classId: row.class_id,
      className: row.classes?.name,
      streamId: row.stream_id,
      streamName: row.streams?.name,
      subjectId: row.subject_id,
      subjectName: row.subjects?.name,
      teacherId: row.teacher_id,
      periodsPerWeek: row.periods_per_week,
      status: row.status,
      allocationSource: row.allocation_source,
      proposalReason: row.proposal_reason,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
    }));

    // Query leave entitlements & types
    let leaveBalances: StaffDossier['leaveBalances'] = [];
    try {
      const leaveYear = new Date().getFullYear();
      const { data: typesData } = await supabase
        .from('leave_types')
        .select('id, name, code, default_entitlement_days')
        .eq('school_id', emp.school_id)
        .order('display_order', { ascending: true });

      const { data: entData } = await supabase
        .from('leave_entitlements')
        .select('id, leave_type_id, entitled_days')
        .eq('employee_id', employeeId)
        .eq('leave_year', leaveYear);

      const entMap = new Map((entData || []).map((e: any) => [e.leave_type_id, Number(e.entitled_days)]));

      // Honest usage source: leave_entitlements carries no used_days column
      // (schema: entitled_days only), so used days are computed from approved
      // leave_requests working_days within the entitlement year. Pending,
      // rejected, withdrawn and cancelled requests never count, nor does
      // approved leave from other years.
      let usageByType = new Map<string, number>();
      try {
        const { data: reqData } = await supabase
          .from('leave_requests')
          .select('leave_type_id, working_days, start_date, status')
          .eq('employee_id', employeeId)
          .eq('status', 'approved');
        usageByType = new Map<string, number>();
        for (const r of (reqData || []) as any[]) {
          if (r?.status !== 'approved') continue;
          const startYear = typeof r?.start_date === 'string' && r.start_date.length >= 4
            ? Number(r.start_date.slice(0, 4))
            : NaN;
          if (Number.isNaN(startYear) || startYear !== leaveYear) continue;
          const key = r.leave_type_id as string;
          usageByType.set(key, (usageByType.get(key) || 0) + Number(r.working_days || 0));
        }
      } catch {
        usageByType = new Map<string, number>();
      }

      leaveBalances = (typesData || []).map((lt: any) => {
        const allowance = entMap.has(lt.id)
          ? Number(entMap.get(lt.id))
          : Number(lt.default_entitlement_days || 0);
        const used = usageByType.get(lt.id) || 0;
        return {
          leaveTypeId: lt.id,
          leaveTypeName: lt.name,
          code: lt.code,
          annualAllowance: allowance,
          usedDays: used,
          remainingDays: allowance - used,
        };
      });
    } catch {
      leaveBalances = [];
    }

    // Query staff documents
    const { data: docData } = await supabase
      .from('staff_documents')
      .select('id, employee_id, doc_type, storage_path, uploaded_at')
      .eq('employee_id', employeeId)
      .order('uploaded_at', { ascending: false });

    const documents: StaffDocumentItem[] = (docData || []).map((d: any) => ({
      id: d.id,
      employeeId: d.employee_id,
      docType: d.doc_type,
      storagePath: d.storage_path,
      uploadedAt: d.uploaded_at,
    }));

    // Strict Teacher Financial Firewall:
    // Teachers cannot view payroll/salary data of other staff members.
    const isSelf = Boolean(callerEmployeeOrUserId && callerEmployeeOrUserId === employeeId);
    const canViewPayroll =
      callerRole === 'admin' ||
      callerRole === 'principal' ||
      callerRole === 'bursar' ||
      isSelf;

    let payrollSummary: StaffDossier['payrollSummary'] = null;

    if (canViewPayroll) {
      const { data: payProfile } = await supabase
        .from('employee_payroll_profiles')
        .select('base_salary, bank_name, bank_account_number, bank_account_name, currency, pay_basis, payment_method, nssf_applicable')
        .eq('employee_id', employeeId)
        .is('effective_to', null)
        .maybeSingle();

      if (payProfile) {
        payrollSummary = {
          canView: true,
          profileConfigured: true,
          baseSalary: payProfile.base_salary ? Number(payProfile.base_salary) : null,
          bankName: payProfile.bank_name ?? null,
          accountNumber: payProfile.bank_account_number ?? null,
          bankAccountName: payProfile.bank_account_name ?? null,
          payBasis: payProfile.pay_basis ?? 'salaried',
          paymentMethod: payProfile.payment_method ?? 'bank_transfer',
          nssfApplicable: payProfile.nssf_applicable ?? true,
          currency: payProfile.currency || 'UGX',
        };
      } else {
        payrollSummary = {
          canView: true,
          profileConfigured: false,
        };
      }
    }

    return {
      id: emp.id,
      personId: emp.person_id,
      schoolId: emp.school_id,
      employeeNumber: emp.employee_number,
      personal: {
        firstName: fName,
        lastName: lName,
        fullName: `${fName} ${lName}`.trim(),
        email: p.email ?? null,
        phone: p.phone ?? null,
        dateOfBirth: p.date_of_birth ?? null,
        gender: p.gender ?? null,
        nationalId: p.national_id ?? null,
        nationality: p.nationality ?? null,
        address: p.address ?? null,
        photoUrl: p.photo_url ?? null,
      },
      employment: {
        role: emp.role || 'Staff',
        department: emp.department || 'Academics',
        isTeacher: Boolean(emp.is_teacher),
        status: emp.status || 'active',
        hireDate: emp.hire_date ?? null,
        exitDate: emp.exit_date ?? null,
        exitReason: emp.exit_reason ?? null,
        contractType: emp.contract_type ?? null,
        qualification: emp.qualification ?? null,
        notes: emp.notes ?? null,
      },
      officialSubjects,
      activeAllocations,
      leaveBalances,
      payrollSummary,
      documents,
    };
  },

  /**
   * Update personal demographic and employment contract details.
   */
  async updateStaffPersonal(
    employeeId: string,
    personId: string,
    payload: {
      firstName?: string;
      lastName?: string;
      email?: string | null;
      phone?: string | null;
      dateOfBirth?: string | null;
      gender?: string | null;
      nationalId?: string | null;
      nationality?: string | null;
      address?: string | null;
      role?: string;
      department?: string;
      isTeacher?: boolean;
      contractType?: string;
      qualification?: string | null;
      notes?: string | null;
    },
    actorRole?: UserRole
  ): Promise<void> {
    assertLeadershipRole(actorRole);

    if (isMockEnv()) {
      throw new Error('Cannot update staff in mock environment: live database required.');
    }

    const personUpdates: Record<string, unknown> = {};
    if (payload.firstName !== undefined) personUpdates.first_name = payload.firstName.trim();
    if (payload.lastName !== undefined) personUpdates.last_name = payload.lastName.trim();
    if (payload.email !== undefined) personUpdates.email = payload.email?.trim() || null;
    if (payload.phone !== undefined) personUpdates.phone = payload.phone?.trim() || null;
    if (payload.dateOfBirth !== undefined) personUpdates.date_of_birth = payload.dateOfBirth || null;
    if (payload.gender !== undefined) personUpdates.gender = payload.gender || null;
    if (payload.nationalId !== undefined) personUpdates.national_id = payload.nationalId?.trim() || null;
    if (payload.nationality !== undefined) personUpdates.nationality = payload.nationality?.trim() || null;
    if (payload.address !== undefined) personUpdates.address = payload.address?.trim() || null;

    if (Object.keys(personUpdates).length > 0) {
      const { error: pError } = await supabase
        .from('people')
        .update(personUpdates)
        .eq('id', personId);
      if (pError) throw pError;
    }

    const empUpdates: Record<string, unknown> = {};
    if (payload.role !== undefined) empUpdates.role = payload.role.trim();
    if (payload.department !== undefined) empUpdates.department = payload.department.trim();
    if (payload.isTeacher !== undefined) empUpdates.is_teacher = payload.isTeacher;
    if (payload.contractType !== undefined) empUpdates.contract_type = payload.contractType;
    if (payload.qualification !== undefined) empUpdates.qualification = payload.qualification?.trim() || null;
    if (payload.notes !== undefined) empUpdates.notes = payload.notes?.trim() || null;

    if (Object.keys(empUpdates).length > 0) {
      const { error: eError } = await supabase
        .from('employees')
        .update(empUpdates)
        .eq('id', employeeId);
      if (eError) throw eError;
    }
  },

  /**
   * Appoint teacher to an official subject.
   */
  async appointTeacherSubject(
    schoolId: string,
    teacherId: string,
    subjectId: string,
    notes?: string,
    actorRole?: UserRole
  ): Promise<string> {
    assertLeadershipRole(actorRole);

    if (isMockEnv()) {
      throw new Error('Cannot appoint subject in mock environment: live database required.');
    }

    const { data, error } = await supabase.rpc('appoint_teacher_subject', {
      p_school_id: schoolId,
      p_teacher_id: teacherId,
      p_subject_id: subjectId,
      p_notes: notes ?? null,
    });

    if (error) throw error;
    return data as string;
  },

  /**
   * Remove official subject appointment.
   */
  async removeTeacherSubject(id: string, actorRole?: UserRole): Promise<void> {
    assertLeadershipRole(actorRole);

    if (isMockEnv()) {
      throw new Error('Cannot remove subject in mock environment: live database required.');
    }

    const { error } = await supabase
      .from('teacher_official_subjects')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Safe offboarding: Sets exit date, reason, and status=terminated without deleting data.
   */
  async exitStaffMember(
    employeeId: string,
    payload: StaffExitPayload,
    actorRole?: UserRole
  ): Promise<string> {
    assertLeadershipRole(actorRole);

    if (isMockEnv()) {
      throw new Error('Cannot exit staff in mock environment: live database required.');
    }

    const { data, error } = await supabase.rpc('exit_staff_member', {
      p_employee_id: employeeId,
      p_exit_date: payload.exitDate,
      p_exit_reason: payload.exitReason,
      p_status: payload.status || 'terminated',
    });

    if (error) throw error;
    return data as string;
  },

  /**
   * Upload staff document to private storage bucket.
   */
  async uploadStaffDocument(
    schoolId: string,
    employeeId: string,
    file: File,
    docType: StaffDocumentItem['docType'],
    actorRole?: UserRole
  ): Promise<StaffDocumentItem> {
    assertLeadershipRole(actorRole);

    if (isMockEnv()) {
      throw new Error('Cannot upload document in mock environment: live database required.');
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${schoolId}/${employeeId}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('staff_docs')
      .upload(storagePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data, error: insertError } = await supabase
      .from('staff_documents')
      .insert({
        employee_id: employeeId,
        doc_type: docType,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return {
      id: data.id,
      employeeId: data.employee_id,
      docType: data.doc_type,
      storagePath: data.storage_path,
      uploadedAt: data.uploaded_at,
    };
  },
};
