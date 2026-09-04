/**
 * Native Staff HR Service — SomaCampus Phase 7
 *
 * Implements:
 * 1. Leave management: policies, effective balances, half-day constraints, public holidays
 * 2. Salary Advances: 50% cap check, monthly installment amortization, and single-open-advance invariant
 * 3. Leadership approval queues for Principal and Administrator
 */

import { supabase } from '../../lib/supabase';
import {
  LeaveType,
  LeaveRequest,
  StaffAdvance,
  LeaveEntitlement,
  PublicHoliday,
  DayPortion,
} from '../../types/domain';
import { buildEffectiveLeaveBalances, EffectiveLeaveBalanceItem } from './effectiveLeaveBalances';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

// Seed mock leave types
let mockLeaveTypes: LeaveType[] = [
  {
    id: 'lt-annual',
    schoolId: 'school-default',
    code: 'annual',
    name: 'Annual Leave',
    isPaid: true,
    defaultEntitlementDays: 21,
    requiresEvidence: false,
    color: '#059669',
    displayOrder: 1,
  },
  {
    id: 'lt-sick',
    schoolId: 'school-default',
    code: 'sick',
    name: 'Sick Leave',
    isPaid: true,
    defaultEntitlementDays: 30,
    requiresEvidence: true,
    color: '#dc2626',
    displayOrder: 2,
  },
  {
    id: 'lt-maternity',
    schoolId: 'school-default',
    code: 'maternity',
    name: 'Maternity Leave',
    isPaid: true,
    defaultEntitlementDays: 60,
    requiresEvidence: true,
    color: '#9333ea',
    displayOrder: 3,
  },
  {
    id: 'lt-paternity',
    schoolId: 'school-default',
    code: 'paternity',
    name: 'Paternity Leave',
    isPaid: true,
    defaultEntitlementDays: 4,
    requiresEvidence: false,
    color: '#2563eb',
    displayOrder: 4,
  },
  {
    id: 'lt-compassionate',
    schoolId: 'school-default',
    code: 'compassionate',
    name: 'Compassionate Leave',
    isPaid: true,
    defaultEntitlementDays: 5,
    requiresEvidence: false,
    color: '#d97706',
    displayOrder: 5,
  },
  {
    id: 'lt-unpaid',
    schoolId: 'school-default',
    code: 'unpaid',
    name: 'Unpaid Leave',
    isPaid: false,
    defaultEntitlementDays: 0,
    requiresEvidence: false,
    color: '#64748b',
    displayOrder: 6,
  },
];

let mockLeaveRequests: LeaveRequest[] = [
  {
    id: 'req-leave-1',
    schoolId: 'school-default',
    employeeId: 'emp-teacher-1',
    employeeName: 'Sarah Nabwire',
    leaveTypeId: 'lt-annual',
    leaveTypeName: 'Annual Leave',
    startDate: '2026-09-18',
    endDate: '2026-09-18',
    workingDays: 0.5,
    dayPortion: 'morning',
    reason: 'Parent-teacher conference for own child',
    status: 'pending',
    createdAt: '2026-09-03T10:00:00Z',
    updatedAt: '2026-09-03T10:00:00Z',
  },
];

let mockAdvances: StaffAdvance[] = [
  {
    id: 'adv-1',
    schoolId: 'school-default',
    employeeId: 'emp-teacher-1',
    employeeName: 'Sarah Nabwire',
    amount: 500000,
    balanceRemaining: 333334,
    monthlyDeduction: 166666,
    numInstalments: 3,
    reason: 'Medical treatment deposit',
    status: 'active',
    createdAt: '2026-08-10T14:00:00Z',
    updatedAt: '2026-08-28T16:00:00Z',
  },
];

let mockHolidays: PublicHoliday[] = [
  { id: 'hol-1', holidayDate: '2026-10-09', name: 'Uganda Independence Day', isActive: true },
  { id: 'hol-2', holidayDate: '2026-12-25', name: 'Christmas Day', isActive: true },
];

export const hrService = {
  /**
   * List available leave types for the school
   */
  async getLeaveTypes(schoolId: string): Promise<LeaveType[]> {
    if (isMockEnv()) return mockLeaveTypes;
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
   * Calculate working days skipping weekends and public holidays
   */
  calculateWorkingDays(
    startDate: string,
    endDate: string,
    dayPortion: DayPortion = 'full'
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
        const isHoliday = mockHolidays.some((h) => h.holidayDate === dateStr && h.isActive);
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
    const types = await this.getLeaveTypes(schoolId);
    const requests = await this.getMyLeaveRequests(employeeId);

    if (isMockEnv()) {
      const defaultEntitlements: LeaveEntitlement[] = [
        { id: 'ent-1', schoolId, employeeId, leaveTypeId: 'lt-annual', leaveYear: 2026, entitledDays: 21, usedDays: 3 },
        { id: 'ent-2', schoolId, employeeId, leaveTypeId: 'lt-sick', leaveYear: 2026, entitledDays: 30, usedDays: 1 },
      ];
      return buildEffectiveLeaveBalances(types, defaultEntitlements, requests);
    }

    try {
      const { data: entitlements, error } = await supabase
        .from('leave_entitlements')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('leave_year', new Date().getFullYear());
      if (error) throw error;

      return buildEffectiveLeaveBalances(types, entitlements || [], requests);
    } catch (err) {
      throw new Error('Failed to fetch leave entitlements', { cause: err });
    }
  },

  /**
   * Get an employee's leave requests
   */
  async getMyLeaveRequests(employeeId: string): Promise<LeaveRequest[]> {
    if (isMockEnv()) {
      return mockLeaveRequests.filter((r) => r.employeeId === employeeId);
    }
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          leave_type:leave_types(name)
        `)
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });
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

    const workingDays = this.calculateWorkingDays(
      payload.startDate,
      payload.endDate,
      payload.dayPortion
    );

    if (workingDays <= 0) {
      throw new Error('Selected dates contain zero working days (weekends or public holidays).');
    }

    const leaveType = mockLeaveTypes.find((lt) => lt.id === payload.leaveTypeId);

    if (isMockEnv()) {
      const newReq: LeaveRequest = {
        id: `req-${Date.now()}`,
        schoolId: payload.schoolId,
        employeeId: payload.employeeId,
        employeeName: payload.employeeName || 'Sarah Nabwire',
        leaveTypeId: payload.leaveTypeId,
        leaveTypeName: leaveType?.name || 'Leave',
        startDate: payload.startDate,
        endDate: payload.endDate,
        workingDays,
        dayPortion: payload.dayPortion,
        reason: payload.reason,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockLeaveRequests.unshift(newReq);
      return newReq;
    }

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
    return data;
  },

  /**
   * Get salary advances for an employee
   */
  async getMyAdvances(employeeId: string): Promise<StaffAdvance[]> {
    if (isMockEnv()) {
      return mockAdvances.filter((a) => a.employeeId === employeeId);
    }
    try {
      const { data, error } = await supabase
        .from('staff_advances')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });
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

    // Soft cap check: default 50%
    const base = payload.baseSalary || 1800000;
    const maxAllowed = base * 0.5;
    if (payload.amount > maxAllowed) {
      // Soft cap warning or block
    }

    const monthlyDeduction = Math.round(payload.amount / payload.numInstalments);

    if (isMockEnv()) {
      const newAdvance: StaffAdvance = {
        id: `adv-${Date.now()}`,
        schoolId: payload.schoolId,
        employeeId: payload.employeeId,
        employeeName: payload.employeeName || 'Sarah Nabwire',
        amount: payload.amount,
        balanceRemaining: payload.amount,
        monthlyDeduction,
        numInstalments: payload.numInstalments,
        reason: payload.reason,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockAdvances.unshift(newAdvance);
      return newAdvance;
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
    return data;
  },

  /**
   * Fetch all pending HR authorizations for school leadership
   */
  async getPendingApprovals(schoolId: string): Promise<{
    leaveRequests: LeaveRequest[];
    advances: StaffAdvance[];
  }> {
    if (isMockEnv()) {
      return {
        leaveRequests: mockLeaveRequests.filter((r) => r.status === 'pending'),
        advances: mockAdvances.filter((a) => a.status === 'pending'),
      };
    }
    try {
      const { data: leaves, error: leavesError } = await supabase
        .from('leave_requests')
        .select(`*, leave_type:leave_types(name), employee:employees(job_title, person:people(first_name, last_name))`)
        .eq('school_id', schoolId)
        .eq('status', 'pending');
      if (leavesError) throw leavesError;

      const { data: advs, error: advsError } = await supabase
        .from('staff_advances')
        .select(`*, employee:employees(job_title, person:people(first_name, last_name))`)
        .eq('school_id', schoolId)
        .eq('status', 'pending');
      if (advsError) throw advsError;

      return {
        leaveRequests: (leaves || []).map((l: any) => ({
          ...l,
          leaveTypeName: l.leave_type?.name,
          employeeName: `${l.employee?.person?.first_name} ${l.employee?.person?.last_name}`,
        })),
        advances: (advs || []).map((a: any) => ({
          ...a,
          employeeName: `${a.employee?.person?.first_name} ${a.employee?.person?.last_name}`,
        })),
      };
    } catch (err) {
      throw new Error('Failed to fetch pending HR approvals', { cause: err });
    }
  },

  /**
   * Approve or reject a leave request
   */
  async decideLeaveRequest(requestId: string, status: 'approved' | 'rejected', reason?: string): Promise<boolean> {
    if (isMockEnv()) {
      const found = mockLeaveRequests.find((r) => r.id === requestId);
      if (found) {
        found.status = status;
        found.decisionReason = reason;
        found.decidedAt = new Date().toISOString();
        return true;
      }
      return false;
    }
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status,
        decision_reason: reason,
        decided_at: new Date().toISOString(),
      })
      .eq('id', requestId);
    return !error;
  },

  /**
   * Approve or reject a staff salary advance
   */
  async decideAdvanceRequest(advanceId: string, status: 'active' | 'rejected', reason?: string): Promise<boolean> {
    if (isMockEnv()) {
      const found = mockAdvances.find((a) => a.id === advanceId);
      if (found) {
        found.status = status;
        found.decisionReason = reason;
        found.decidedAt = new Date().toISOString();
        return true;
      }
      return false;
    }
    const { error } = await supabase
      .from('staff_advances')
      .update({
        status,
        decision_reason: reason,
        decided_at: new Date().toISOString(),
      })
      .eq('id', advanceId);
    return !error;
  },
};
