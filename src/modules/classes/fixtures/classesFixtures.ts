import { ClassSummary } from '../classesService';

export const INITIAL_CLASSES_DATA: ClassSummary[] = [
  {
    id: 'class-p5',
    schoolId: '22222222-2222-2222-2222-222222222222',
    name: 'Primary 5',
    stageLevel: 'Stage 5',
    capacity: 80,
    enrolledCount: 42,
    classTeacher: {
      id: 'ct-1',
      teacherId: 'emp-teacher-1',
      teacherName: 'Sarah Nabwire',
      employeeNumber: 'EMP-001',
    },
    streams: [
      {
        id: 'stream-p5a',
        classId: 'class-p5',
        name: 'P.5 Blue',
        defaultRoom: 'Room 5A',
        capacity: 40,
        enrolledCount: 22,
        classTeacher: {
          id: 'ct-1',
          teacherId: 'emp-teacher-1',
          teacherName: 'Sarah Nabwire',
          employeeNumber: 'EMP-001',
        },
      },
      {
        id: 'stream-p5b',
        classId: 'class-p5',
        name: 'P.5 Green',
        defaultRoom: 'Room 5B',
        capacity: 40,
        enrolledCount: 20,
        classTeacher: null,
      },
    ],
  },
  {
    id: 'class-p6',
    schoolId: '22222222-2222-2222-2222-222222222222',
    name: 'Primary 6',
    stageLevel: 'Stage 6',
    capacity: 40,
    enrolledCount: 35,
    classTeacher: {
      id: 'ct-2',
      teacherId: 'emp-teacher-2',
      teacherName: 'Peter Mukasa',
      employeeNumber: 'EMP-002',
    },
    streams: [],
  },
];

export const classesFixtureStore = {
  classes: [...INITIAL_CLASSES_DATA],
  reset() {
    this.classes = [...INITIAL_CLASSES_DATA];
  },
};
