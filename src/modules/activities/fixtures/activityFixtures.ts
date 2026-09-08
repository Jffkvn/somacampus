import { ActivityClearance, ActivityEnrolment, SchoolActivity } from '../../../types/domain';

export const INITIAL_ACTIVITIES: SchoolActivity[] = [
  {
    id: 'act-swimming',
    schoolId: 'school-default',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    name: 'Competitive Swimming Squad',
    category: 'sports',
    isPaid: true,
    feeAmount: 250000,
    leadTeacherId: 'emp-teacher-1',
    leadTeacherName: 'Sarah Nabwire',
    capacity: 25,
    enrolledCount: 3,
    status: 'active',
    createdAt: '2026-08-15T00:00:00Z',
  },
  {
    id: 'act-robotics',
    schoolId: 'school-default',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    name: 'Junior Robotics & STEM Club',
    category: 'academic_club',
    isPaid: true,
    feeAmount: 300000,
    leadTeacherId: 'emp-teacher-2',
    leadTeacherName: 'Grace Alupo',
    capacity: 20,
    enrolledCount: 2,
    status: 'active',
    createdAt: '2026-08-15T00:00:00Z',
  },
  {
    id: 'act-debate',
    schoolId: 'school-default',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    name: 'Primary Debate & Public Speaking',
    category: 'arts',
    isPaid: false,
    feeAmount: 0,
    leadTeacherId: 'emp-teacher-1',
    leadTeacherName: 'Sarah Nabwire',
    capacity: 30,
    enrolledCount: 4,
    status: 'active',
    createdAt: '2026-08-15T00:00:00Z',
  },
];

export const INITIAL_ACTIVITY_ENROLMENTS: ActivityEnrolment[] = [
  {
    id: 'enr-1',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-amari',
    studentName: 'Amari Kyomugisha',
    className: 'Stage 5 Blue',
    streamName: 'Blue',
    status: 'enrolled',
    enrolledAt: '2026-08-20T10:00:00Z',
  },
  {
    id: 'enr-2',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-aurora',
    studentName: 'Aurora Namukasa',
    className: 'Stage 7 Red',
    streamName: 'Red',
    status: 'enrolled',
    enrolledAt: '2026-08-20T10:30:00Z',
  },
  {
    id: 'enr-3',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-brian',
    studentName: 'Brian Musoke',
    className: 'Stage 5 Blue',
    streamName: 'Blue',
    status: 'enrolled',
    enrolledAt: '2026-08-21T09:00:00Z',
  },
];

export const INITIAL_CLEARANCES: ActivityClearance[] = [
  {
    id: 'clr-amari',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-amari',
    status: 'cleared',
    basis: 'paid',
    clearedAt: '2026-08-28T14:10:00Z',
    operationalNote: 'Term 1 sports fee verified by bursar',
  },
  {
    id: 'clr-aurora',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-aurora',
    status: 'cleared',
    basis: 'promise_to_pay',
    clearedAt: '2026-09-02T11:00:00Z',
    validUntil: '2026-09-25',
    operationalNote: 'Parent signed promissory commitment to pay by Sept 25',
  },
  {
    id: 'clr-brian',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-brian',
    status: 'pending_review',
    basis: 'promise_to_pay',
    clearedAt: '2026-09-03T08:00:00Z',
    operationalNote: 'Awaiting parent letter',
  },
];

export const activityFixtureStore = {
  activities: [...INITIAL_ACTIVITIES],
  enrolments: [...INITIAL_ACTIVITY_ENROLMENTS],
  clearances: [...INITIAL_CLEARANCES],
  reset() {
    this.activities = [...INITIAL_ACTIVITIES];
    this.enrolments = [...INITIAL_ACTIVITY_ENROLMENTS];
    this.clearances = [...INITIAL_CLEARANCES];
  },
};
