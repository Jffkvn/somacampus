import {
  Calendar,
  BookOpen,
  Users,
  GraduationCap,
  DollarSign,
  MessageSquare,
  ShieldAlert,
  Clock,
  UserCheck,
} from 'lucide-react';
import type { UserRole } from './permissions';

export interface NavSubItem {
  label: string;
  href: string;
  roles?: UserRole[];
}

export interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  subItems?: NavSubItem[];
  roles?: UserRole[];
}

export const NAVIGATION_CONFIG: NavGroup[] = [
  {
    id: 'today',
    label: 'Today',
    icon: Clock,
    href: '/teacher/today',
    roles: ['teacher', 'admin', 'principal'],
  },
  {
    id: 'school_dashboard',
    label: 'School Cockpit',
    icon: GraduationCap,
    href: '/dashboard/school',
    roles: ['principal', 'admin'],
  },
  {
    id: 'teaching',
    label: 'Teaching',
    icon: BookOpen,
    roles: ['teacher', 'admin', 'principal'],
    subItems: [
      { label: 'My Classes', href: '/teacher/classes', roles: ['teacher', 'admin'] },
      { label: 'Live Lessons', href: '/teaching/lessons', roles: ['teacher', 'admin', 'principal'] },
      { label: 'Online Sessions', href: '/teaching/online', roles: ['teacher', 'admin', 'principal'] },
      { label: 'Assignments', href: '/teaching/assignments', roles: ['teacher', 'admin'] },
      { label: 'Worksheets', href: '/teaching/worksheets', roles: ['teacher', 'admin'] },
      { label: 'Quizzes', href: '/teaching/quizzes', roles: ['teacher', 'admin'] },
      { label: 'Resource Library', href: '/teaching/resources', roles: ['teacher', 'admin', 'principal'] },
      { label: 'Supply Requests', href: '/inventory/request', roles: ['teacher', 'admin', 'principal'] },
    ],
  },
  {
    id: 'academics',
    label: 'Academics',
    icon: Calendar,
    roles: ['teacher', 'admin', 'principal'],
    subItems: [
      { label: 'Curriculum Explorer', href: '/curriculum', roles: ['teacher', 'admin', 'principal'] },
      { label: 'Schemes of Work', href: '/planning/schemes', roles: ['teacher', 'admin', 'principal'] },
      { label: 'Timetable & Teaching Policies', href: '/planning/policies', roles: ['admin', 'principal'] },
      { label: 'Timetable Builder', href: '/planning/timetable/builder', roles: ['admin', 'principal'] },
      { label: 'School Activities & Sports', href: '/activities', roles: ['teacher', 'admin', 'principal'] },
      { label: 'Master Timetable', href: '/timetable', roles: ['teacher', 'admin', 'principal'] },
      { label: 'School Calendar', href: '/calendar' },
      { label: 'Class & Streams', href: '/classes', roles: ['admin', 'principal'] },
    ],
  },
  {
    id: 'students',
    label: 'Students',
    icon: Users,
    roles: ['teacher', 'admin', 'principal'],
    subItems: [
      { label: 'All Students', href: '/students' },
      { label: 'Admit Student', href: '/students/new', roles: ['admin', 'principal'] },
      { label: 'Attendance Roster', href: '/students/attendance' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: DollarSign,
    roles: ['bursar', 'admin', 'principal'],
    subItems: [
      { label: 'Fee Accounts', href: '/fees', roles: ['bursar', 'admin', 'principal'] },
      { label: 'Operating Expenses', href: '/expenses', roles: ['bursar', 'admin', 'principal'] },
      { label: 'Payroll Engine', href: '/payroll', roles: ['bursar', 'admin', 'principal'] },
      { label: 'Payment Imports', href: '/fees/import', roles: ['bursar', 'admin'] },
      { label: 'Centre Operations', href: '/online/centre', roles: ['bursar', 'admin', 'principal'] },
    ],
  },
  {
    id: 'family_portal',
    label: 'Family Portal',
    icon: Users,
    roles: ['parent'],
    subItems: [
      { label: 'Home & Overview', href: '/parent/home', roles: ['parent'] },
      // Online content lives as a card in /parent/home — no separate nav item.
      // Phase 8E Task 1: staff already reach /calendar via the Academics
      // group; parents had no calendar entry (Family Portal only).
      { label: 'School Calendar', href: '/calendar', roles: ['parent'] },
    ],
  },
  {
    id: 'student_portal',
    label: 'Student Portal',
    icon: GraduationCap,
    roles: ['student'],
    subItems: [
      { label: 'My Online Learning', href: '/student/home', roles: ['student'] },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: MessageSquare,
    roles: ['teacher', 'admin', 'principal', 'bursar', 'parent'],
    subItems: [
      { label: 'Announcements', href: '/communication/announcements' },
      { label: 'Messages', href: '/communication/messages', roles: ['teacher', 'parent'] },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: ShieldAlert,
    roles: ['admin', 'principal'],
    subItems: [
      { label: 'School Setup', href: '/admin/overview', roles: ['admin'] },
      { label: 'Staff Directory', href: '/staff', roles: ['admin', 'principal'] },
      { label: 'Admissions Queue', href: '/admissions', roles: ['admin', 'principal'] },
      { label: 'HR Approvals & Leave', href: '/administration/hr/approvals', roles: ['admin', 'principal'] },
      { label: 'Inventory & Assets', href: '/administration/inventory' },
      { label: 'Audit Log', href: '/administration/audit', roles: ['admin'] },
    ],
  },
  {
    id: 'staff_portal',
    label: 'My HR & Payslips',
    icon: UserCheck,
    roles: ['teacher', 'admin', 'principal', 'bursar'],
    subItems: [
      { label: 'Leave & Balances', href: '/people/hr/leave' },
      { label: 'Salary Advances', href: '/people/hr/advances' },
      { label: 'My Payslips', href: '/people/hr/payslips' },
    ],
  },
];
