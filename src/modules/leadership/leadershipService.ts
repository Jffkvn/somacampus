import { LeadershipLessonSummary } from '../../types/domain';

export interface LeadershipDashboardViewModel {
  schoolName: string;
  academicTerm: string;
  stats: {
    enrolledStudents: number;
    activeTeachers: number;
    attendanceRate: number;
    lessonsExpected: number;
    lessonsCompleted: number;
  };
  attendanceTrend: Array<{ day: string; studentRate: number; staffRate: number }>;
  activeLessons: LeadershipLessonSummary[];
  alerts: Array<{
    id: string;
    type: 'critical' | 'warning' | 'pending';
    title: string;
    description: string;
    actionRoute?: string;
  }>;
}

export const leadershipService = {
  async getSchoolLeadershipDashboard(schoolId: string, _date: string): Promise<LeadershipDashboardViewModel> {
    const mockLessons: LeadershipLessonSummary[] = [
      {
        lessonId: 'les-001',
        schoolId,
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
        schoolId,
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
        schoolId,
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

    return {
      schoolName: "Grace's Cambridge Centre",
      academicTerm: 'Term 1, 2026-2027',
      stats: {
        enrolledStudents: 1204,
        activeTeachers: 84,
        attendanceRate: 96.4,
        lessonsExpected: 86,
        lessonsCompleted: 82,
      },
      attendanceTrend: [
        { day: 'Mon', studentRate: 95.8, staffRate: 98.0 },
        { day: 'Tue', studentRate: 96.4, staffRate: 98.5 },
        { day: 'Wed', studentRate: 94.9, staffRate: 97.0 },
        { day: 'Thu', studentRate: 96.8, staffRate: 99.0 },
        { day: 'Fri', studentRate: 95.2, staffRate: 96.5 },
      ],
      activeLessons: mockLessons,
      alerts: [
        {
          id: 'alert-1',
          type: 'critical',
          title: '3 Unmatched Payment Records',
          description: 'Recent bank import has 3 rows requiring admission number resolution.',
          actionRoute: '/fees/reconciliation',
        },
        {
          id: 'alert-2',
          type: 'warning',
          title: 'Missing Lesson Note (Stage 4 Green)',
          description: 'James Kato has not submitted the 09:00 Science lesson note.',
          actionRoute: '/dashboard/school/teaching',
        },
      ],
    };
  },
};
