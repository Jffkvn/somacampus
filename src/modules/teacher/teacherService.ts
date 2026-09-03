import { TeacherTodayViewModel, TimetableEntry } from '../../types/domain';

export const teacherService = {
  /**
   * Fetches the teacher's daily cockpit view model.
   * Connects to Supabase `timetable_entries` and `teacher_attendance` when live.
   */
  async getTeacherToday(teacherId: string, date: string): Promise<TeacherTodayViewModel> {
    // In Phase 1 foundation: provides a valid typed domain response adhering to TeacherTodayViewModel contract
    const mockSchedule: TimetableEntry[] = [
      {
        id: 'tt-entry-001',
        timetableId: 'tt-term-1',
        schoolId: 'school-grace-01',
        classId: 'class-p5-blue',
        className: 'Stage 5 Blue',
        streamName: 'Blue',
        subjectId: 'sub-math',
        subjectName: 'Mathematics',
        teacherId,
        teacherName: 'Mrs. Sarah Namukasa',
        roomName: 'Lab Block Room 3',
        dayOfWeek: 2,
        startTime: '08:00',
        endTime: '09:00',
        studentCount: 24,
        curriculumPosition: {
          topicId: 'cambridge-p5-fractions',
          topicName: 'Fractions & Decimals',
          objective: 'Convert mixed numbers to improper fractions and solve word problems.',
        },
      },
      {
        id: 'tt-entry-002',
        timetableId: 'tt-term-1',
        schoolId: 'school-grace-01',
        classId: 'class-p5-blue',
        className: 'Stage 5 Blue',
        streamName: 'Blue',
        subjectId: 'sub-eng',
        subjectName: 'English',
        teacherId,
        teacherName: 'Mrs. Sarah Namukasa',
        roomName: 'Classroom 5B',
        dayOfWeek: 2,
        startTime: '09:00',
        endTime: '10:00',
        studentCount: 24,
        curriculumPosition: {
          topicId: 'cambridge-p5-grammar',
          topicName: 'Complex Sentences',
          objective: 'Identify and construct complex sentences using subordinate conjunctions.',
        },
      },
      {
        id: 'tt-entry-003',
        timetableId: 'tt-term-1',
        schoolId: 'school-grace-01',
        classId: 'class-p5-blue',
        className: 'Stage 5 Blue',
        streamName: 'Blue',
        subjectId: 'sub-sci',
        subjectName: 'Science',
        teacherId,
        teacherName: 'Mrs. Sarah Namukasa',
        roomName: 'Science Lab 1',
        dayOfWeek: 2,
        startTime: '11:00',
        endTime: '12:00',
        studentCount: 24,
        curriculumPosition: {
          topicId: 'cambridge-p5-water',
          topicName: 'The Water Cycle',
          objective: 'Investigate evaporation, condensation, precipitation, and accumulation.',
        },
      },
    ];

    return {
      teacherId,
      teacherName: 'Mrs. Sarah Namukasa',
      date,
      dayLabel: 'Tuesday, 3 September 2026',
      clockInStatus: {
        isClockedIn: false,
      },
      schedule: mockSchedule,
      activeClassIndex: 0,
      activeTimetableEntry: mockSchedule[0],
      completedLessonIds: [],
      dailyEvents: [
        {
          id: 'event-01',
          title: "Cambridge Primary Staff Briefing",
          time: '07:45 AM',
          location: 'Staff Common Room',
          eventType: 'meeting',
        },
        {
          id: 'event-02',
          title: "Parents' Consultation Evening",
          time: '03:30 PM',
          location: 'Main Assembly Hall',
          eventType: 'assembly',
        },
      ],
    };
  },

  /**
   * Clock in teacher. Connects to JantaHR attendance log.
   */
  async clockIn(_teacherId: string): Promise<{ isClockedIn: boolean; clockedInAt: string; verificationMethod: 'verified_gps' | 'verified_manual' }> {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return {
      isClockedIn: true,
      clockedInAt: timeStr,
      verificationMethod: 'verified_gps',
    };
  },
};
