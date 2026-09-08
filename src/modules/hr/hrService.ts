/**
 * Native Staff HR Service — SomaCampus Phase 7
 *
 * Implements:
 * 1. Leave management: policies, effective balances, half-day constraints, public holidays
 * 2. Salary Advances: 50% cap check, monthly installment amortization, and single-open-advance invariant
 * 3. Leadership approval queues for Principal and Administrator
 *
 * Mock Honesty: fails closed on database errors. Zero synthetic in-memory mocks.
 * In mock environments reads resolve to honest empty states and writes throw —
 * the live path always issues real queries.
 */

import { supabase } from '../../lib/supabase';
import { writeFinancialAudit } from '../../lib/financialAudit';
import { hasPermission, type UserRole } from '../../config/permissions';
import {
  LeaveType,
  LeaveRequest,
  StaffAdvance,
  LeaveEntitlement,
  PublicHoliday,
  DayPortion,
} from '../../types/domain';
import { buildEffectiveLeaveBalances, EffectiveLeaveBalanceItem } from './effectiveLeaveBalances';

const isMockEnv = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  // NOTE: assigning `undefined` back to import.meta.env under Vitest
  // round-trips as the literal string "undefined" (truthy) — treat it as
  // unset so mock-env detection stays honest in the test harness.
  if (!url || url === 'undefined' || url.includes('placeholder') || url.includes('mock')) return true;
  return false;
};

export const hrService = {
  /**
   * List available leave types for the school
   */
  async getLeaveTypes(schoolId: string): Promise<LeaveType[]> {
    if (isMockEnv()) return [];
    try {
      const { data, error } = await supabase
        .from('leave_types')
        .select('*')
        .eq('school_id', schoolId)
        .is('archived_at', null)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        schoolId: r.school_id,
        code: r.code,
        name: r.name,
        isPaid: r.is_paid,
        defaultEntitlementDays: r.default_entitlement_days,
        requiresEvidence: r.requires_evidence,
        color: r.color,
        displayOrder: r.display_order,
      }));
    } catch (err) {
      throw new Error('Failed to fetch leave types', { cause: err });
    }
  },

  /**
   * Fetch active public holidays for a school (plus national holidays, which
   * carry a NULL school_id per the public_holidays table definition).
   * Fails closed: any database error throws, never a fallback list.
   */
  async getSchoolHolidays(schoolId?: string): Promise<PublicHoliday[]> {
    if (isMockEnv()) return [];
    try {
      const { data, error } = await supabase
        .from('public_holidays')
        .select('*')
        .or(`school_id.is.null,school_id.eq.${schoolId || '00000000-0000-0000-0000-000000000000'}`)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []).map((h: any) => ({
        id: h.id,
        schoolId: h.school_id ?? null,
        holidayDate: h.holiday_date,
        name: h.name,
        isActive: h.is_active,
      }));
    } catch (err) {
      throw new Error('Failed to fetch school holidays', { cause: err });
    }
  },

  /**
   * Calculate working days skipping weekends and the given public holidays.
   * Pure helper: callers pass the holidays explicitly (submit paths fetch them
   * via getSchoolHolidays, which throws on DB error). Defaults to a
   * weekends-only computation — never to a seeded mock list.
   */
  calculateWorkingDays(
    startDate: string,
    endDate: string,
    dayPortion: DayPortion = 'full',
    holidays: PublicHoliday[] = []
  ): number {
    if (dayPortion === 'morning' || dayPortion === 'afternoon') {
      return 0.5;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;

    let count = 0;
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      const dateStr = current.toISOString().split('T')[0];

      // Exclude Saturday (6) and Sunday (0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const isHoliday = holidays.some((h) => h.holidayDate === dateStr && h.isActive);
        if (!isHoliday) {
          count++;
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  },

  /**
   * Get effective leave balances for an employee
   */
  async getEffectiveBalances(schoolId: string, employeeId: string): Promise<EffectiveLeaveBalanceItem[]> {
    if (isMockEnv()) return [];

    const types = await this.getLeaveTypes(schoolId);
    const requests = await this.getMyLeaveRequests(employeeId, schoolId);

    try {
      const { data: rows, error } = await supabase
        .from('leave_entitlements')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('school_id', schoolId)
        .eq('leave_year', new Date().getFullYear());
      if (error) throw error;

      const entitlements: LeaveEntitlement[] = (rows || []).map((r: any) => ({
        id: r.id,
        schoolId: r.school_id,
        employeeId: r.employee_id,
        leaveTypeId: r.leave_type_id,
        leaveYear: r.leave_year,
        entitledDays: Number(r.entitled_days),
      }));
      return buildEffectiveLeaveBalances(types, entitlements, requests);
    } catch (err) {
      throw new Error('Failed to fetch leave entitlements', { cause: err });
    }
  },

  /**
   * Get an employee's leave requests.
   * D7: school-scoped identity — callers MUST pass the school context so a
   * school-A employment can never satisfy a school-B row.
   */
  async getMyLeaveRequests(employeeId: string, schoolId?: string): Promise<LeaveRequest[]> {
    if (isMockEnv()) return [];
    try {
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          leave_type:leave_types(name)
        `)
        .eq('employee_id', employeeId);
      if (schoolId) query = query.eq('school_id', schoolId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        schoolId: r.school_id,
        employeeId: r.employee_id,
        leaveTypeId: r.leave_type_id,
        leaveTypeName: r.leave_type?.name,
        startDate: r.start_date,
        endDate: r.end_date,
        workingDays: Number(r.working_days),
        dayPortion: r.day_portion,
        reason: r.reason,
        status: r.status,
        decidedBy: r.decided_by,
        decidedAt: r.decided_at,
        decisionReason: r.decision_reason,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (err) {
      throw new Error('Failed to fetch leave requests', { cause: err });
    }
  },

  /**
   * Submit a new leave request (with half-day constraint validation)
   */
  async submitLeaveRequest(payload: {
    schoolId: string;
    employeeId: string;
    employeeName?: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    dayPortion: DayPortion;
    reason: string;
  }): Promise<LeaveRequest> {
    // Enforce half-day shape invariant
    if (payload.dayPortion !== 'full') {
      if (payload.startDate !== payload.endDate) {
        throw new Error('A half-day leave request must be on a single date.');
      }
    }

    // Holidays come from the live table (fails closed on DB error); the pure
    // calculator takes them as an explicit parameter.
    const holidays = await this.getSchoolHolidays(payload.schoolId);
    const workingDays = this.calculateWorkingDays(
      payload.startDate,
      payload.endDate,
      payload.dayPortion,
      holidays
    );

    if (workingDays <= 0) {
      throw new Error('Selected dates contain zero working days (weekends or public holidays).');
    }

    if (isMockEnv()) {
      throw new Error('hrService.submitLeaveRequest: unavailable in mock environment (no fake writes)');
    }

    const leaveType = (await this.getLeaveTypes(payload.schoolId)).find(
      (lt) => lt.id === payload.leaveTypeId
    );

    const { data, error } = await supabase
      .from('leave_requests')
      .insert({
        school_id: payload.schoolId,
        employee_id: payload.employeeId,
        leave_type_id: payload.leaveTypeId,
        start_date: payload.startDate,
        end_date: payload.endDate,
        working_days: workingDays,
        day_portion: payload.dayPortion,
        reason: payload.reason,
      })
      .select()
      .single();
    if (error) throw error;
    const r: any = data;
    return {
      id: r.id,
      schoolId: r.school_id ?? payload.schoolId,
      employeeId: r.employee_id ?? payload.employeeId,
      employeeName: payload.employeeName,
      leaveTypeId: r.leave_type_id ?? payload.leaveTypeId,
      leaveTypeName: leaveType?.name,
      startDate: r.start_date ?? payload.startDate,
      endDate: r.end_date ?? payload.endDate,
      workingDays: Number(r.working_days ?? workingDays),
      dayPortion: (r.day_portion ?? payload.dayPortion) as DayPortion,
      reason: r.reason ?? payload.reason,
      status: (r.status ?? 'pending') as LeaveRequest['status'],
      createdAt: r.created_at ?? new Date().toISOString(),
      updatedAt: r.updated_at ?? new Date().toISOString(),
    };
  },

  /**
   * Get salary advances for an employee.
   * D7: school-scoped identity — callers MUST pass the school context so a
   * school-A employment can never satisfy a school-B row.
   */
  async getMyAdvances(employeeId: string, schoolId?: string): Promise<StaffAdvance[]> {
    if (isMockEnv()) return [];
    try {
      let query = supabase
        .from('staff_advances')
        .select('*')
        .eq('employee_id', employeeId);
      if (schoolId) query = query.eq('school_id', schoolId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        schoolId: r.school_id,
        employeeId: r.employee_id,
        amount: Number(r.amount),
        balanceRemaining: Number(r.balance_remaining),
        monthlyDeduction: Number(r.monthly_deduction),
        numInstalments: r.num_instalments,
        reason: r.reason,
        status: r.status,
        decidedBy: r.decided_by,
        decidedAt: r.decided_at,
        decisionReason: r.decision_reason,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (err) {
      throw new Error('Failed to fetch staff advances', { cause: err });
    }
  },

  /**
   * Submit a new salary advance request (Enforcing Single Open Advance Invariant)
   */
  async submitAdvanceRequest(payload: {
    schoolId: string;
    employeeId: string;
    employeeName?: string;
    amount: number;
    numInstalments: number;
    reason: string;
    baseSalary?: number;
  }): Promise<StaffAdvance> {
    // Single-open-advance check is intentionally employee-GLOBAL (no school
    // filter): the DB partial unique index staff_advances_one_open_per_employee_idx
    // enforces one open advance per employee_id across schools, so the service
    // pre-check must match to raise the clean policy error instead of a raw
    // unique violation. Reads elsewhere stay school-scoped.
    const existing = await this.getMyAdvances(payload.employeeId);
    const hasOpenAdvance = existing.some((a) =>
      ['pending', 'active', 'flagged'].includes(a.status)
    );

    // Database partial unique index invariant
    if (hasOpenAdvance) {
      throw new Error(
        'Policy Invariant Violation: You already have an active or pending salary advance. Staff may hold at most one open advance at a time.'
      );
    }

    // Enforce 50% gross salary cap
    const base = payload.baseSalary || 1800000;
    const maxAllowed = base * 0.5;
    if (payload.amount > maxAllowed) {
      throw new Error(
        `Policy Invariant Violation: Salary advance request of UGX ${payload.amount.toLocaleString()} exceeds the 50% monthly salary cap (UGX ${maxAllowed.toLocaleString()}).`
      );
    }

    const monthlyDeduction = Math.round(payload.amount / payload.numInstalments);

    if (isMockEnv()) {
      throw new Error('hrService.submitAdvanceRequest: unavailable in mock environment (no fake writes)');
    }

    const { data, error } = await supabase
      .from('staff_advances')
      .insert({
        school_id: payload.schoolId,
        employee_id: payload.employeeId,
        amount: payload.amount,
        balance_remaining: payload.amount,
        monthly_deduction: monthlyDeduction,
        num_instalments: payload.numInstalments,
        reason: payload.reason,
      })
      .select()
      .single();
    if (error) throw error;
    const r: any = data;
    return {
      id: r.id,
      schoolId: r.school_id ?? payload.schoolId,
      employeeId: r.employee_id ?? payload.employeeId,
      employeeName: payload.employeeName,
      amount: Number(r.amount ?? payload.amount),
      balanceRemaining: Number(r.balance_remaining ?? payload.amount),
      monthlyDeduction: Number(r.monthly_deduction ?? monthlyDeduction),
      numInstalments: r.num_instalments ?? payload.numInstalments,
      reason: r.reason ?? payload.reason,
      status: (r.status ?? 'pending') as StaffAdvance['status'],
      createdAt: r.created_at ?? new Date().toISOString(),
      updatedAt: r.updated_at ?? new Date().toISOString(),
    };
  },

  /**
   * Fetch all pending HR authorizations for school leadership
   */
  async getPendingApprovals(schoolId: string): Promise<{
    leaveRequests: LeaveRequest[];
    advances: StaffAdvance[];
  }> {
    if (isMockEnv()) {
      return { leaveRequests: [], advances: [] };
    }
    try {
      const { data: leaves, error: leavesError } = await supabase
        .from('leave_requests')
        .select(`*, leave_type:leave_types(name), employee:employees(role, department, person:people(first_name, last_name))`)
        .eq('school_id', schoolId)
        .eq('status', 'pending');
      if (leavesError) throw leavesError;

      const { data: advs, error: advsError } = await supabase
        .from('staff_advances')
        .select(`*, employee:employees(role, department, person:people(first_name, last_name))`)
        .eq('school_id', schoolId)
        .eq('status', 'pending');
      if (advsError) throw advsError;

      return {
        leaveRequests: (leaves || []).map((l: any) => ({
          ...l,
          leaveTypeName: l.leave_type?.name,
          employeeName: `${l.employee?.person?.first_name || ''} ${l.employee?.person?.last_name || ''}`.trim(),
        })),
        advances: (advs || []).map((a: any) => ({
          ...a,
          employeeName: `${a.employee?.person?.first_name || ''} ${a.employee?.person?.last_name || ''}`.trim(),
        })),
      };
    } catch (err) {
      throw new Error('Failed to fetch pending HR approvals', { cause: err });
    }
  },

  /**
   * Approve or reject a leave request
   */
  async decideLeaveRequest(
    requestId: string,
    status: 'approved' | 'rejected',
    reason?: string,
    callerUserId?: string
  ): Promise<boolean> {
    if (isMockEnv()) {
      throw new Error('hrService.decideLeaveRequest: unavailable in mock environment (no fake writes)');
    }
    if (!callerUserId?.trim()) {
      throw new Error('hrService.decideLeaveRequest: callerUserId is required for decision attribution (decided_by).');
    }
    const { data: current, error: fetchErr } = await supabase
      .from('leave_requests')
      .select('school_id, status')
      .eq('id', requestId)
      .single();
    if (fetchErr) throw fetchErr;
    if (current && (current as any).status && (current as any).status !== 'pending') {
      throw new Error('Invalid State: Leave request has already been decided.');
    }
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status,
        decision_reason: reason,
        decided_by: callerUserId || null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', requestId);
    if (error) return false;
    await writeFinancialAudit({
      schoolId: (current as any)?.school_id ?? 'school-default',
      entityType: 'leave_request',
      entityId: requestId,
      action: status,
      reason: reason ?? `decideLeaveRequest ${status}`,
      previousData: { status: (current as any)?.status ?? 'pending' },
      newData: { id: requestId, status, decided_by: callerUserId },
    });
    return true;
  },

  /**
   * Approve or reject a staff salary advance
   */
  async decideAdvanceRequest(
    advanceId: string,
    status: 'active' | 'rejected',
    reason?: string,
    callerUserId?: string
  ): Promise<boolean> {
    if (isMockEnv()) {
      throw new Error('hrService.decideAdvanceRequest: unavailable in mock environment (no fake writes)');
    }
    if (!callerUserId?.trim()) {
      throw new Error('hrService.decideAdvanceRequest: callerUserId is required for decision attribution (decided_by).');
    }
    const { data: current, error: fetchErr } = await supabase
      .from('staff_advances')
      .select('school_id, status')
      .eq('id', advanceId)
      .single();
    if (fetchErr) throw fetchErr;
    if (current && (current as any).status && (current as any).status !== 'pending') {
      throw new Error('Invalid State: Salary advance request has already been decided.');
    }
    const { error } = await supabase
      .from('staff_advances')
      .update({
        status,
        decision_reason: reason,
        decided_by: callerUserId || null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', advanceId);
    if (error) return false;
    await writeFinancialAudit({
      schoolId: (current as any)?.school_id ?? 'school-default',
      entityType: 'staff_advance',
      entityId: advanceId,
      action: status,
      reason: reason ?? `decideAdvanceRequest ${status}`,
      previousData: { status: (current as any)?.status ?? 'pending' },
      newData: { id: advanceId, status, decided_by: callerUserId },
    });
    return true;
  },

  /**
   * Save or update a leave type
   */
  async saveLeaveType(payload: Partial<LeaveType> & { schoolId: string; name: string; code: string }): Promise<LeaveType> {
    if (isMockEnv()) {
      throw new Error('hrService.saveLeaveType: unavailable in mock environment (no fake writes)');
    }
    const row = {
      school_id: payload.schoolId,
      code: payload.code,
      name: payload.name,
      is_paid: payload.isPaid ?? true,
      default_entitlement_days: payload.defaultEntitlementDays ?? 21,
      requires_evidence: payload.requiresEvidence ?? false,
      color: payload.color ?? '#059669',
      display_order: payload.displayOrder ?? 1,
    };
    if (payload.id) {
      const { data, error } = await supabase
        .from('leave_types')
        .update(row)
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return {
        id: data.id,
        schoolId: data.school_id,
        code: data.code,
        name: data.name,
        isPaid: data.is_paid,
        defaultEntitlementDays: data.default_entitlement_days,
        requiresEvidence: data.requires_evidence,
        color: data.color,
        displayOrder: data.display_order,
      };
    } else {
      const { data, error } = await supabase
        .from('leave_types')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return {
        id: data.id,
        schoolId: data.school_id,
        code: data.code,
        name: data.name,
        isPaid: data.is_paid,
        defaultEntitlementDays: data.default_entitlement_days,
        requiresEvidence: data.requires_evidence,
        color: data.color,
        displayOrder: data.display_order,
      };
    }
  },

  /**
   * Fetch active payroll profiles for school employees
   */
  async getEmployeePayrollProfiles(schoolId: string): Promise<any[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('employee_payroll_profiles')
      .select('*, employee:employees(id, employee_number, role, person:people(first_name, last_name))')
      .eq('school_id', schoolId)
      .is('effective_to', null);
    if (error) throw error;
    return data || [];
  },

  /**
   * Upsert an employee payroll profile atomically.
   * Gated on hr.payroll.manage (per ROLE_PERMISSIONS: admin only) — callers
   * thread the viewer's role from the UI auth context.
   */
  async upsertPayrollProfile(payload: {
    schoolId: string;
    employeeId: string;
    baseSalary: number;
    currency?: string;
    payBasis?: string;
    paymentMethod?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountName?: string;
    nssfApplicable?: boolean;
    effectiveFrom?: string;
    actorRole?: UserRole;
  }): Promise<void> {
    const effectiveFrom = payload.effectiveFrom || new Date().toISOString().slice(0, 10);

    if (isMockEnv()) {
      throw new Error('hrService.upsertPayrollProfile: unavailable in mock environment (no fake writes)');
    }

    if (!payload.actorRole) {
      throw new Error('hrService.upsertPayrollProfile: actorRole is required (hr.payroll.manage).');
    }
    if (!hasPermission(payload.actorRole, 'hr.payroll.manage')) {
      throw new Error(
        `hrService.upsertPayrollProfile: role '${payload.actorRole}' is not authorized (requires hr.payroll.manage).`
      );
    }

    // Close existing profile
    await supabase
      .from('employee_payroll_profiles')
      .update({ effective_to: effectiveFrom })
      .eq('employee_id', payload.employeeId)
      .is('effective_to', null);

    const { error } = await supabase
      .from('employee_payroll_profiles')
      .insert({
        school_id: payload.schoolId,
        employee_id: payload.employeeId,
        effective_from: effectiveFrom,
        base_salary: payload.baseSalary,
        currency: payload.currency || 'UGX',
        pay_basis: payload.payBasis || 'salaried',
        payment_method: payload.paymentMethod || 'bank_transfer',
        bank_name: payload.bankName || null,
        bank_account_number: payload.bankAccountNumber || null,
        bank_account_name: payload.bankAccountName || null,
        nssf_applicable: payload.nssfApplicable ?? true,
      });
    if (error) throw error;
  },

  /**
   * Upsert an employee leave entitlement for a specific leave year.
   * Gated on hr.payroll.manage (per ROLE_PERMISSIONS: admin only) — callers
   * thread the viewer's role from the UI auth context.
   */
  async upsertLeaveEntitlement(payload: {
    schoolId: string;
    employeeId: string;
    leaveTypeId: string;
    leaveYear?: number;
    entitledDays: number;
    actorRole?: UserRole;
  }): Promise<void> {
    const leaveYear = payload.leaveYear || new Date().getFullYear();

    if (isMockEnv()) {
      throw new Error('hrService.upsertLeaveEntitlement: unavailable in mock environment (no fake writes)');
    }

    if (!payload.actorRole) {
      throw new Error('hrService.upsertLeaveEntitlement: actorRole is required (hr.payroll.manage).');
    }
    if (!hasPermission(payload.actorRole, 'hr.payroll.manage')) {
      throw new Error(
        `hrService.upsertLeaveEntitlement: role '${payload.actorRole}' is not authorized (requires hr.payroll.manage).`
      );
    }

    const { error } = await supabase
      .from('leave_entitlements')
      .upsert(
        {
          school_id: payload.schoolId,
          employee_id: payload.employeeId,
          leave_type_id: payload.leaveTypeId,
          leave_year: leaveYear,
          entitled_days: payload.entitledDays,
        },
        { onConflict: 'employee_id,leave_type_id,leave_year' }
      );
    if (error) throw error;
  },
};
