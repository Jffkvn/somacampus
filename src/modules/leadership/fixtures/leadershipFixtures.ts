import { LeadershipLessonSummary } from '../../../types/domain';

export const INITIAL_LEADERSHIP_LESSONS: LeadershipLessonSummary[] = [
  {
    lessonId: 'les-001',
    schoolId: 'school-default',
    teacherId: 'teacher-sarah',
    teacherName: 'Sarah Namukasa',
    classId: 'class-p5-blue',
    className: 'Stage 5 Blue',
    subjectName: 'Mathematics',
    scheduledTime: '08:00 - 09:00',
    submittedAt: '08:58 AM',
    status: 'completed',
    curriculumTopic: 'Fractions & Decimals',
    visibleLessonNote: 'Covered mixed numbers conversion. Class responded actively; 4 students needed assistance with simplified fractions.',
    hasAttendanceRecorded: true,
    studentCount: 24,
  },
  {
    lessonId: 'les-002',
    schoolId: 'school-default',
    teacherId: 'teacher-david',
    teacherName: 'David Ochieng',
    classId: 'class-p6-red',
    className: 'Stage 6 Red',
    subjectName: 'English',
    scheduledTime: '08:00 - 09:00',
    submittedAt: '09:05 AM',
    status: 'completed',
    curriculumTopic: 'Persuasive Writing',
    visibleLessonNote: 'Introductory essay outlining arguments. All 26 students drafted thesis statements.',
    hasAttendanceRecorded: true,
    studentCount: 26,
  },
  {
    lessonId: 'les-003',
    schoolId: 'school-default',
    teacherId: 'teacher-james',
    teacherName: 'James Kato',
    classId: 'class-p4-green',
    className: 'Stage 4 Green',
    subjectName: 'Science',
    scheduledTime: '09:00 - 10:00',
    submittedAt: '—',
    status: 'not_completed',
    curriculumTopic: 'Habitats & Adaptations',
    visibleLessonNote: 'Lesson submission pending.',
    hasAttendanceRecorded: false,
    studentCount: 22,
  },
];

export function getInitialLeadershipLessons(schoolId: string): LeadershipLessonSummary[] {
  return INITIAL_LEADERSHIP_LESSONS.map((l) => ({ ...l, schoolId }));
}
