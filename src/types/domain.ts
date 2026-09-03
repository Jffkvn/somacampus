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

// 2. Class Responsibility Contract (Class / Form Teacher pastoral guardianship)
export interface ClassResponsibility {
  classId: string;
  className: string;
  streamId?: string;
  streamName?: string;
  studentCount: number;
  classTeacherId: string;
  classTeacherName: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isCurrentUserClassTeacher: boolean;
  todayDailyAttendance?: {
    sessionId: string;
    isRecorded: boolean;
    recordedAt?: string;
    recordedByTeacherId?: string;
    recordedByTeacherName?: string;
    // Derivable from relationships, NOT an arbitrary stored string:
    isRecordedByClassTeacher: boolean;
    // Derived, display-only, never persisted. Per spec §7 role labels derive from relationships.
    recordedByRole?: 'class_teacher' | 'subject_teacher' | 'substitute' | 'admin';
    totalStudents: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    excusedCount: number;
  };
}

// 3. Teacher Today View Model Contract
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
  // 1. CLASS RESPONSIBILITIES (Pastoral & Daily Class Attendance)
  classResponsibilities: ClassResponsibility[];
  // 2. TEACHING TIMETABLE (Scheduled Instructional Lessons)
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

// 4. Daily Attendance Session Contract
// Crucial: Student attendance is NOT per-subject. Exactly ONE daily attendance record per class/stream.
export interface AttendanceSession {
  id: string;
  schoolId: string;
  classId: string;
  streamId?: string;
  classTeacherId: string;            // Responsible class teacher on attendance date
  classTeacherName?: string;
  recordedByTeacherId: string;       // Actual teacher who entered attendance
  recordedByTeacherName?: string;
  isRecordedByClassTeacher: boolean; // Derived: recordedByTeacherId === classTeacherId
  contextualTimetableEntryId?: string;
  date: string;                      // ONE daily class attendance record
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  createdAt: string;
  updatedAt: string;
}

// 5. Attendance Record Contract (Longitudinal Learner History)
export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  photoUrl?: string;
  streamId?: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  remarks?: string;
  recordedBy: string;
  recordedAt: string;
  correctedAt?: string;
  correctionReason?: string;
  correctedBy?: string;
}

// 6. Attendance Audit Log Contract (Historical correction trail)
export interface AttendanceAuditLog {
  id: string;
  attendanceRecordId: string;
  sessionId: string;
  studentId: string;
  previousStatus: 'present' | 'absent' | 'late' | 'excused';
  newStatus: 'present' | 'absent' | 'late' | 'excused';
  changedByTeacherId: string;
  changedByTeacherName?: string;
  changedAt: string;
  reason: string;
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
