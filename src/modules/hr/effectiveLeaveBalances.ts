/**
 * Effective Leave Balances Engine — Native SomaCampus HR
 *
 * Implements:
 * 1. Merging school-wide leave type policies with employee-specific database records
 * 2. Subtracting pending in-flight leave requests from available balance so staff
 *    cannot overdraw their leave quota by submitting concurrent requests
 */

import { LeaveType, LeaveEntitlement, LeaveRequest } from '../../types/domain';

export interface EffectiveLeaveBalanceItem {
  leaveTypeId: string;
  code: string;
  name: string;
  color: string;
  isPaid: boolean;
  entitledDays: number;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
  isDefault: boolean;
}

/**
 * Calculates effective leave balances including pending request deductions.
 */
export function buildEffectiveLeaveBalances(
  leaveTypes: LeaveType[],
  entitlements: LeaveEntitlement[] = [],
  pendingRequests: LeaveRequest[] = []
): EffectiveLeaveBalanceItem[] {
  return leaveTypes.map((type) => {
    const explicit = entitlements.find((e) => e.leaveTypeId === type.id);
    const entitledDays = explicit
      ? Number(explicit.entitledDays)
      : Number(type.defaultEntitlementDays || 0);

    const usedDays = explicit?.usedDays ? Number(explicit.usedDays) : 0;

    // Sum working days of any pending requests for this leave type
    const pendingDays = pendingRequests
      .filter((req) => req.leaveTypeId === type.id && req.status === 'pending')
      .reduce((sum, req) => sum + Number(req.workingDays || 0), 0);

    const availableDays = Math.max(0, entitledDays - usedDays - pendingDays);

    return {
      leaveTypeId: type.id,
      code: type.code,
      name: type.name,
      color: type.color || '#1e40af',
      isPaid: type.isPaid,
      entitledDays,
      usedDays,
      pendingDays,
      availableDays,
      isDefault: !explicit,
    };
  });
}
