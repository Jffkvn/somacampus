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
 * CANONICAL PERMISSION MODEL (Issue 2 — routes vs codes vs RLS):
 * - ROUTES (the allowlist below, enforced by RequireAccess in App.tsx) are
 *   authoritative for NAVIGATION: which role may VISIT a money/leadership
 *   path. Direct-URL navigation bypasses the sidebar, so this allowlist is
 *   the navigation arbiter.
 * - ROLE_PERMISSIONS (config/permissions.ts) is authoritative for
 *   FEATURE-LEVEL checks via hasPermission(): which role may USE a
 *   capability (fees.view_accounts, expenses.view, hr.payroll.view, ...).
 * - RLS (Supabase policies + current_employee_id_for_school) is the FINAL
 *   arbiter for DATA: even an allowed route with an allowed code sees only
 *   rows its school-scoped identity may read; denials throw, never leak.
 *
 * Route <-> code alignment (pinned by teacher-privacy.test.tsx):
 *   /fees                     <-> fees.view_accounts      (bursar, admin, principal)
 *   /fees/import              <-> fees.import_reconcile   (bursar, admin; principal denied)
 *   /expenses                 <-> expenses.view           (bursar, admin, principal)
 *   /payroll + /admin payroll <-> hr.payroll.view         (bursar, admin, principal)
 *   /dashboard/school         <-> school.dashboard.view   (principal, admin)
 *   /admin/overview           <-> school.settings.manage  (admin)
 *   /administration/inventory <-> inventory.manage        (admin, principal)
 *   /administration/audit     <-> admin-only allowlist entry (no dedicated
 *     code — navigation allowlist is the gate, RLS the data arbiter).
 *
 * KNOWN LIMITATION (Issue 5 — documented, not fixed): StudentDetail fee
 * helpers are currently UNWIRED — StudentDetailPage renders no fee UI at
 * all, so teacher blindness there holds BY ABSENCE (pinned by the D10(c)
 * render test asserting zero money content), not by an explicit gate. If
 * fee UI is ever added to that page, it MUST be wrapped in
 * shouldShowStudentFeeRow / canViewStudentFees before render.
 *
 * FAIL-CLOSED NOTE (Issue 4): canAccessPath stays default-ALLOW for
 * unlisted paths (flipping to deny-by-default could lock legitimate
 * academic pages). Fail-closed coverage for money routes lives in the
 * TEST suite: teacher-privacy.test.tsx extracts every route path declared
 * in App.tsx and asserts each /fees|payroll|expenses|finance|admin|
 * dashboard|payslip path is either allowlisted here (teacher-denied) or
 * explicitly declared open (self-service HR, own-data only). A future
 * money route that is not allowlisted fails the suite.
 *
 * Pure functions only — no UI, no academic logic.
 */
import { hasPermission, type PermissionCode, type UserRole } from '../config/permissions';

/** Permission codes that expose institutional or student money. */
export const FINANCE_PERMISSION_CODES: PermissionCode[] = [
  'fees.view_accounts',
  'fees.import_reconcile',
  'expenses.view',
  'hr.staff.view',
  'hr.payroll.view',
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
 * Exported so the test suite can pin fail-closed money-path coverage
 * against the route list declared in App.tsx (see header note).
 */
export const ROUTE_ROLE_ALLOWLIST: Array<{ prefix: string; roles: UserRole[] }> = [
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
