/**
 * Teacher financial-blindness contract — SomaCampus Phase 7 (D10+D11).
 *
 * Single choke point for "may a teacher reach money?" decisions:
 * - canViewStudentFees: student fee balances / payment history / amounts.
 * - shouldShowStudentFeeRow: fee-row visibility gate (hidden when no
 *   readable clearance is present).
 * - canAccessPath: route-level money guard mirroring NAVIGATION_CONFIG
 *   group roles. Defense-in-depth behind the sidebar role filters in
 *   config/navigation.ts + Sidebar.tsx, because direct-URL navigation
 *   bypasses the sidebar entirely (App.tsx has no other role check).
 *
 * Pure functions only — no UI, no academic logic.
 */
import { hasPermission, type PermissionCode, type UserRole } from '../config/permissions';

/** Permission codes that expose institutional or student money. */
export const FINANCE_PERMISSION_CODES: PermissionCode[] = [
  'fees.view_accounts',
  'fees.import_reconcile',
  'hr.staff.view',
  'hr.payroll.manage',
];

/** Teacher may see only their OWN payslip/HR — never student or staff money. */
export function canViewStudentFees(role: UserRole): boolean {
  return hasPermission(role, 'fees.view_accounts');
}

/**
 * Fee-row visibility gate for student-facing surfaces.
 * Hidden whenever no readable fee clearance is present (undefined/null):
 * the row must never render an unreadable or inherited money state.
 */
export function shouldShowStudentFeeRow(
  clearanceStatus: string | null | undefined,
): boolean {
  return clearanceStatus !== undefined && clearanceStatus !== null;
}

/**
 * Route-level allowlist for money/leadership surfaces.
 * Mirrors the NAVIGATION_CONFIG group `roles` exactly; every other path
 * (academics, teacher workspace, self-service HR) stays open.
 */
const ROUTE_ROLE_ALLOWLIST: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: '/fees/import', roles: ['bursar', 'admin'] },
  { prefix: '/fees', roles: ['bursar', 'admin', 'principal'] },
  { prefix: '/expenses', roles: ['bursar', 'admin', 'principal'] },
  { prefix: '/payroll', roles: ['bursar', 'admin', 'principal'] },
  { prefix: '/dashboard/school', roles: ['principal', 'admin'] },
  { prefix: '/admin/overview', roles: ['admin'] },
  { prefix: '/administration/inventory', roles: ['admin', 'principal'] },
  { prefix: '/administration/audit', roles: ['admin'] },
  { prefix: '/administration/payroll', roles: ['bursar', 'admin', 'principal'] },
  // NOTE: /administration/hr intentionally open — MyHRPage renders ONLY the
  // viewer's own leave/advances/payslips (service layer is employee_id +
  // school_id scoped with RLS deny->throw). Teachers reach the same data
  // via /people/hr/*.
];

/** Longest-prefix match so /fees/import wins over /fees. */
export function canAccessPath(role: UserRole, path: string): boolean {
  const normalized = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  let best: { prefix: string; roles: UserRole[] } | null = null;
  for (const entry of ROUTE_ROLE_ALLOWLIST) {
    const isMatch =
      normalized === entry.prefix || normalized.startsWith(`${entry.prefix}/`);
    if (isMatch && (!best || entry.prefix.length > best.prefix.length)) {
      best = entry;
    }
  }
  if (!best) return true;
  return best.roles.includes(role);
}
