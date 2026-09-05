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
      { label: 'Assignments', href: '/teaching/assignments', roles: ['teacher', 'admin'] },
      { label: 'Worksheets', href: '/teaching/worksheets', roles: ['teacher', 'admin'] },
      { label: 'Quizzes', href: '/teaching/quizzes', roles: ['teacher', 'admin'] },
      { label: 'Resource Library', href: '/teaching/resources', roles: ['teacher', 'admin', 'principal'] },
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
      { label: 'School Activities & Sports', href: '/activities', roles: ['teacher', 'admin', 'principal'] },
      { label: 'Timetable', href: '/timetable' },
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
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: MessageSquare,
    roles: ['teacher', 'admin', 'principal', 'bursar', 'parent'],
    subItems: [
      { label: 'Announcements', href: '/communication/announcements' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: ShieldAlert,
    roles: ['admin', 'principal'],
    subItems: [
      { label: 'School Setup', href: '/admin/overview', roles: ['admin'] },
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
  {
    id: 'family_portal',
    label: 'Family Portal',
    icon: Users,
    roles: ['parent'],
    subItems: [
      { label: 'Home & Overview', href: '/parent/home', roles: ['parent'] },
    ],
  },
];
