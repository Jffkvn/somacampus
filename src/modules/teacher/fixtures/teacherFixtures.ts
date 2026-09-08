import { TimetableEntry } from '../../../types/domain';

export const INITIAL_TEACHER_SCHEDULE: TimetableEntry[] = [
  {
    id: 'tt-entry-001',
    timetableId: 'tt-term-1',
    schoolId: '22222222-2222-2222-2222-222222222222',
    classId: '55555555-5555-5555-5555-555555555551',
    className: 'Stage 5 Blue',
    streamName: 'Blue',
    subjectId: '77777777-7777-7777-7777-777777777771',
    subjectName: 'Mathematics',
    teacherId: '99999999-9999-9999-9999-999999999992', // David Musoke
    teacherName: 'Mr. David Musoke',
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
];

export function getTeacherScheduleFallback(employeeId: string, teacherName: string): TimetableEntry[] {
  return [
    {
      id: 'tt-entry-001',
      timetableId: 'tt-term-1',
      schoolId: '22222222-2222-2222-2222-222222222222',
      classId: '55555555-5555-5555-5555-555555555551',
      className: 'Stage 5 Blue',
      streamName: 'Blue',
      subjectId: '77777777-7777-7777-7777-777777777771',
      subjectName: 'Mathematics',
      teacherId: '99999999-9999-9999-9999-999999999992',
      teacherName: 'Mr. David Musoke',
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
      schoolId: '22222222-2222-2222-2222-222222222222',
      classId: '55555555-5555-5555-5555-555555555551',
      className: 'Stage 5 Blue',
      streamName: 'Blue',
      subjectId: '77777777-7777-7777-7777-777777777772',
      subjectName: 'English',
      teacherId: employeeId,
      teacherName: teacherName,
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
      schoolId: '22222222-2222-2222-2222-222222222222',
      classId: '55555555-5555-5555-5555-555555555551',
      className: 'Stage 5 Blue',
      streamName: 'Blue',
      subjectId: '77777777-7777-7777-7777-777777777773',
      subjectName: 'Science',
      teacherId: '99999999-9999-9999-9999-999999999994',
      teacherName: 'Mr. James Kato',
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
}

export interface StudentRosterItem {
  id: string;
  admissionNumber: string;
  name: string;
  status: 'present' | 'absent' | 'late' | 'excused';
}

export const INITIAL_STUDENT_ROSTER: StudentRosterItem[] = [
  { id: '22222222-0000-0000-0000-000000000001', admissionNumber: 'GCC-2024-001', name: 'John Okello', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000002', admissionNumber: 'GCC-2024-002', name: 'Grace Achieng', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000003', admissionNumber: 'GCC-2024-003', name: 'Brian Kigozi', status: 'absent' },
  { id: '22222222-0000-0000-0000-000000000004', admissionNumber: 'GCC-2024-004', name: 'Doreen Nalubega', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000005', admissionNumber: 'GCC-2024-005', name: 'Emmanuel Sserwadda', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000006', admissionNumber: 'GCC-2024-006', name: 'Faith Nakato', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000007', admissionNumber: 'GCC-2024-007', name: 'George William Mukasa', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000008', admissionNumber: 'GCC-2024-008', name: 'Harriet Namatovu', status: 'present' },
];
