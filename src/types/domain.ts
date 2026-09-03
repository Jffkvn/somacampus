/**
 * SomaCampus Core Domain Contracts
 *
 * Enforces the architectural rule:
 * Domain model -> database contract -> service/API contract -> UI.
 */

// 1. Timetable Entry Contract
export interface TimetableEntry {
  id: string;
  timetableId: string;
  schoolId: string;
  classId: string;
  className: string;
  streamId?: string;
  streamName?: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  roomId?: string;
  roomName?: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = Monday, 7 = Sunday
  startTime: string; // e.g. "08:00"
  endTime: string;   // e.g. "09:00"
  studentCount: number;
  curriculumPosition?: {
    topicId: string;
    topicName: string;
    objective: string;
  };
}

// 2. Teacher Today View Model Contract
export interface TeacherTodayViewModel {
  teacherId: string;
  teacherName: string;
  date: string;
  dayLabel: string; // e.g. "Tuesday, 3 September"
  clockInStatus: {
    isClockedIn: boolean;
    clockedInAt?: string;
    locationVerified?: boolean;
    verificationMethod?: 'verified_gps' | 'verified_manual' | 'flagged';
  };
  schedule: TimetableEntry[];
  activeClassIndex?: number;
  activeTimetableEntry?: TimetableEntry;
  completedLessonIds: string[];
  dailyEvents: Array<{
    id: string;
    title: string;
    time?: string;
    location?: string;
    eventType: 'assembly' | 'meeting' | 'holiday' | 'exam' | 'custom';
  }>;
}

// 3. Attendance Session Contract
export interface AttendanceSession {
  id: string;
  schoolId: string;
  classId: string;
  streamId?: string;
  teacherId: string;
  timetableEntryId?: string;
  lessonId?: string;
  date: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  createdAt: string;
  updatedAt: string;
}

// 4. Attendance Record Contract (Longitudinal Learner History)
export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  photoUrl?: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  remarks?: string;
  recordedBy: string;
  recordedAt: string;
  correctedAt?: string;
  correctionReason?: string;
  correctedBy?: string;
}

// 5. Lesson Context Contract
export interface LessonContext {
  lessonId?: string;
  timetableEntryId: string;
  schoolId: string;
  classId: string;
  className: string;
  streamName?: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  date: string;
  startTime: string;
  endTime: string;
  roomName?: string;
  curriculum: {
    framework: string; // e.g. "Cambridge Primary"
    level: string;     // e.g. "Stage 5"
    topic: string;     // e.g. "Water Cycle"
    objective: string; // e.g. "Explain evaporation and condensation"
  };
  previousLessonSummary?: string;
  relevantResourcesCount: number;
}

// 6. Lesson Submission Contract
export interface LessonSubmission {
  lessonId: string;
  timetableEntryId: string;
  status: 'completed' | 'partial' | 'not_completed' | 'struggled' | 'advanced';
  whatWasTaught: string;
  visibleLessonNote: string;
  privateReflection?: string; // Strictly isolated from leadership view
  attendanceSessionId?: string;
  submittedAt: string;
  submittedBy: string;
}

// 7. Leadership Lesson Summary Contract
export interface LeadershipLessonSummary {
  lessonId: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  teacherPhotoUrl?: string;
  classId: string;
  className: string;
  subjectName: string;
  scheduledTime: string;
  submittedAt: string;
  status: 'completed' | 'partial' | 'not_completed' | 'struggled' | 'advanced';
  curriculumTopic: string;
  visibleLessonNote: string;
  hasAttendanceRecorded: boolean;
  studentCount: number;
}

// 8. Student Learning Summary Contract (Longitudinal Learner Record)
export interface StudentLearningSummary {
  studentId: string;
  schoolId: string;
  admissionNumber: string;
  fullName: string;
  className: string;
  photoUrl?: string;
  overallAttendancePercentage: number;
  totalDaysPresent: number;
  totalDaysAbsent: number;
  totalDaysLate: number;
  currentCurriculumPosition: string;
  strengths: string[];
  supportAreas: string[];
  recentObservations: Array<{
    id: string;
    date: string;
    teacherName: string;
    observation: string;
    competency?: string;
  }>;
  recentEvidenceCount: number;
  activeInterventionsCount: number;
  feeClearanceStatus: 'cleared' | 'partial' | 'overdue';
  feeBalance: number;
}
