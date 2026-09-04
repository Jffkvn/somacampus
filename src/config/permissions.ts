/**
 * SomaCampus Permissions and Role System
 *
 * Granular permissions mapped by educational role.
 * Enforced on both UI navigation and database RLS.
 */

export type UserRole =
  | 'teacher'
  | 'principal'
  | 'bursar'
  | 'admin'
  | 'parent'
  | 'student';

export type PermissionCode =
  | 'school.dashboard.view'
  | 'school.settings.manage'
  | 'calendar.manage'
  | 'calendar.view'
  | 'teacher.clock_in'
  | 'timetable.view_all'
  | 'timetable.view_assigned'
  | 'attendance.student.record'
  | 'attendance.student.correct'
  | 'lessons.create'
  | 'lessons.submit'
  | 'lessons.notes.view_leadership'
  | 'teacher.reflection.view_own'
  | 'student.profile.view'
  | 'student.learning.view'
  | 'portal.children.view'
  | 'portal.fees.view'
  | 'portal.attendance.view'
  | 'portal.learning.view'
  | 'announcements.view'
  | 'messages.view'
  | 'fees.view_accounts'
  | 'fees.import_reconcile'
  | 'expenses.view'
  | 'hr.staff.view'
  | 'hr.payroll.view'
  | 'hr.payroll.manage'
  | 'inventory.manage'
  | 'reports.view_official';

export const ROLE_PERMISSIONS: Record<UserRole, PermissionCode[]> = {
  admin: [
    'school.dashboard.view',
    'school.settings.manage',
    'calendar.manage',
    'calendar.view',
    'teacher.clock_in',
    'timetable.view_all',
    'attendance.student.record',
    'attendance.student.correct',
    'lessons.create',
    'lessons.notes.view_leadership',
    'student.profile.view',
    'student.learning.view',
    'fees.view_accounts',
    'fees.import_reconcile',
    'expenses.view',
    'hr.staff.view',
    'hr.payroll.view',
    'hr.payroll.manage',
    'inventory.manage',
    'reports.view_official',
  ],
  principal: [
    'school.dashboard.view',
    'calendar.manage',
    'calendar.view',
    'teacher.clock_in',
    'timetable.view_all',
    'lessons.notes.view_leadership',
    'student.profile.view',
    'student.learning.view',
    'fees.view_accounts',
    'expenses.view',
    'hr.staff.view',
    'hr.payroll.view',
    'inventory.manage',
    'reports.view_official',
  ],
  teacher: [
    'calendar.view',
    'teacher.clock_in',
    'timetable.view_assigned',
    'attendance.student.record',
    'attendance.student.correct',
    'lessons.create',
    'lessons.submit',
    'teacher.reflection.view_own',
    'student.profile.view',
    'student.learning.view',
    'announcements.view',
    'messages.view',
  ],
  bursar: [
    'calendar.view',
    'fees.view_accounts',
    'fees.import_reconcile',
    'expenses.view',
    'hr.payroll.view',
    'reports.view_official',
  ],
  parent: [
    'calendar.view',
    'portal.children.view',
    'portal.fees.view',
    'portal.attendance.view',
    'portal.learning.view',
    'announcements.view',
    'messages.view',
  ],
  student: [
    'calendar.view',
  ],
};

export function hasPermission(role: UserRole, permission: PermissionCode): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getRoleLandingRoute(role: UserRole): string {
  switch (role) {
    case 'teacher':
      return '/teacher/today';
    case 'principal':
      return '/dashboard/school';
    case 'bursar':
      return '/fees';
    case 'admin':
      return '/admin/overview';
    case 'parent':
      return '/parent/home';
    case 'student':
      return '/student/home';
    default:
      return '/teacher/today';
  }
}
