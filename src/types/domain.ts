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
  streamId?: string | null;
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
  curriculumObjectiveId?: string;
  curriculumObjectiveCode?: string;
  curriculumObjectiveTitle?: string;
  curriculumStageId?: string;
  teachingSequenceId?: string;
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
  objectiveIds?: string[];
  teachingSequenceId?: string;
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
}

// -----------------------------------------------------------------------------
// 9. PHASE 4: TEACHING LOOP & LEARNING EVIDENCE CONTRACTS
// -----------------------------------------------------------------------------

export type EvidenceTrack = 'formal_graded' | 'diagnostic_evidence';
export type SubmissionType = 'classwork' | 'homework' | 'worksheet' | 'quiz' | 'project' | 'practical';
export type AssignmentStatus = 'draft' | 'published' | 'closed' | 'archived';
export type ParticipationStatus = 'expected' | 'excused' | 'not_required';
export type SubmissionStatus = 'pending' | 'submitted' | 'late' | 'missing';
export type WorkType = 'notebook' | 'written' | 'oral' | 'file_reference' | 'photo_reference' | 'captured_evidence';
export type TeacherReviewStatus = 'unreviewed' | 'reviewed' | 'revision_requested';
export type ObservationType = 'learning_progress' | 'misconception' | 'strength' | 'support_need' | 'participation' | 'behaviour';
export type ObservationVisibility = 'academic_team' | 'internal_only' | 'parent_visible';

export interface Assignment {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName?: string;
  classId: string;
  className?: string;
  streamId?: string | null;
  streamName?: string;
  subjectId: string;
  subjectName?: string;
  lessonId?: string | null;
  title: string;
  instructions: string;
  assignedDate: string;
  dueDate: string;
  submissionType: SubmissionType;
  evidenceTrack: EvidenceTrack;
  maxScore?: number | null;
  status: AssignmentStatus;
  expectedCount?: number;
  submittedCount?: number;
  missingCount?: number;
  excusedCount?: number;
  reviewedCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudentSubmission {
  id: string;
  schoolId: string;
  assignmentId: string;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  participationStatus: ParticipationStatus;
  submissionStatus: SubmissionStatus;
  submittedAt?: string | null;
  workType: WorkType;
  workSummary?: string | null;
  workReferenceLocation?: string | null;
  workMetadata?: Record<string, unknown>;
  teacherReviewStatus: TeacherReviewStatus;
  teacherFeedback?: string | null;
  score?: number | null;
  reviewedByTeacherId?: string | null;
  reviewedByTeacherName?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherObservation {
  id: string;
  schoolId: string;
  studentId: string;
  studentName?: string;
  teacherId: string;
  teacherName?: string;
  classId: string;
  className?: string;
  streamId?: string | null;
  streamName?: string;
  subjectId?: string | null;
  subjectName?: string;
  lessonId?: string | null;
  assignmentId?: string | null;
  observationType: ObservationType;
  observationText: string;
  visibility: ObservationVisibility;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicAssessmentAuditLog {
  id: string;
  schoolId: string;
  submissionId: string;
  studentId: string;
  previousScore?: number | null;
  newScore?: number | null;
  changedByTeacherId: string;
  changedByTeacherName?: string;
  changedAt: string;
  reason: string;
}

export interface StudentAcademicEvidence {
  formalAssessments: Array<{
    id: string;
    assignmentId: string;
    title: string;
    subjectName: string;
    score: number;
    maxScore: number;
    date: string;
    teacherFeedback?: string;
  }>;
  diagnosticEvidence: Array<{
    id: string;
    assignmentId: string;
    title: string;
    subjectName: string;
    submissionType: SubmissionType;
    participationStatus: ParticipationStatus;
    submissionStatus: SubmissionStatus;
    workType: WorkType;
    teacherFeedback?: string;
    score?: number | null;
    date: string;
  }>;
  observations: Array<{
    id: string;
    teacherName: string;
    type: ObservationType;
    text: string;
    subjectName?: string;
    date: string;
  }>;
}

// -----------------------------------------------------------------------------
// 10. PHASE 5: LEARNING INTELLIGENCE & LONGITUDINAL EVIDENCE CONTRACTS
// -----------------------------------------------------------------------------

export type InterventionStatus = 'draft' | 'active' | 'completed' | 'abandoned';
export type InterventionOutcome = 'improved' | 'partially_improved' | 'unchanged' | 'declined';
export type InterventionEvidenceType = 'submission' | 'observation' | 'lesson' | 'formal_assessment';
export type PatternClassification =
  | 'observed_pattern'
  | 'possible_pattern'
  | 'teacher_confirmed'
  | 'ai_suggested'
  | 'insufficient_evidence';

export interface EvidenceReference {
  type: InterventionEvidenceType;
  id: string;
  titleOrSnippet: string;
  date: string;
}

export interface StudentIntervention {
  id: string;
  schoolId: string;
  studentId: string;
  studentName?: string;
  teacherId: string;
  teacherName?: string;
  classId: string;
  className?: string;
  streamId?: string | null;
  streamName?: string;
  subjectId: string;
  subjectName?: string;
  learningArea: string;
  topicName?: string;
  curriculumObjectiveId?: string | null;
  curriculumObjectiveCode?: string;
  curriculumObjectiveTitle?: string;
  /** @deprecated Use curriculumObjectiveId instead. Retained for historical migration. */
  curriculumObjectiveRef?: string | null;
  reason: string;
  strategyAction: string;
  targetOutcome: string;
  startDate: string;
  targetDate: string;
  status: InterventionStatus;
  outcome?: InterventionOutcome | null;
  outcomeNotes?: string | null;
  followUpNotes?: string | null;
  evidenceReferences: EvidenceReference[];
  createdAt: string;
  updatedAt: string;
}

export interface InterventionEvidenceRecord {
  id: string;
  schoolId: string;
  interventionId: string;
  evidenceType: InterventionEvidenceType;
  evidenceId: string;
  createdAt: string;
}

export interface InterventionAuditLog {
  id: string;
  schoolId: string;
  interventionId: string;
  previousStatus?: string | null;
  newStatus: string;
  changedByUserId: string;
  changedByUserName?: string;
  reason?: string | null;
  changedAt: string;
}

export interface LearningAreaPattern {
  subjectId: string;
  subjectName: string;
  learningArea: string;
  topicName?: string;
  classification: PatternClassification;
  summary: string;
  evidenceCount: number;
  observationsCount: number;
  evidenceReferences: EvidenceReference[];
  requiresAttention: boolean;
}

export interface StudentLongitudinalProfile {
  studentId: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  streamName?: string;
  academicOverview: {
    formalAveragePct: number | null;
    formalAssessmentsCount: number;
    diagnosticParticipationPct: number;
    diagnosticCount: number;
    observationsCount: number;
    attendancePercentage: number;
    activeInterventionsCount: number;
  };
  subjectTrajectories: Array<{
    subjectId: string;
    subjectName: string;
    formalAveragePct: number | null;
    diagnosticParticipationPct: number;
    evidenceCount: number;
    status: 'steady' | 'support_needed' | 'insufficient_evidence';
  }>;
  emergingPatterns: LearningAreaPattern[];
  activeInterventions: StudentIntervention[];
  pastInterventions: StudentIntervention[];
  evidenceTimeline: Array<{
    id: string;
    date: string;
    type: 'formal_assessment' | 'diagnostic_work' | 'teacher_observation' | 'intervention_action';
    subjectName: string;
    title: string;
    details: string;
    provenanceId: string;
    provenanceType: InterventionEvidenceType;
    badge: {
      label: string;
      variant: 'success' | 'warning' | 'info' | 'critical';
    };
  }>;
}

export interface PreLessonBriefing {
  classId: string;
  subjectId: string;
  className: string;
  subjectName: string;
  curriculumTopic: string;
  previousLesson?: {
    date: string;
    topic: string;
    visibleLessonNote: string;
    status: string;
  };
  recentClassEvidence: {
    totalSubmissions: number;
    averageFormalScorePct: number | null;
    summaryText: string;
    hasInsufficientEvidence: boolean;
  };
  studentsNeedingAttention: Array<{
    studentId: string;
    studentName: string;
    reason: string;
    activeInterventionId?: string;
    recentMisconceptionSnippet?: string;
    evidenceReferences: EvidenceReference[];
  }>;
  recentClassObservations: Array<{
    id: string;
    studentName: string;
    type: ObservationType;
    text: string;
    date: string;
  }>;
  suggestedRetrievalFocus: Array<{
    topic: string;
    prompt: string;
    evidenceBasis: string;
  }>;
  curriculumObjectiveId?: string;
  curriculumObjectiveCode?: string;
  curriculumObjectiveTitle?: string;
  prerequisiteObjectives?: Array<{
    id: string;
    code: string;
    title: string;
    relationshipType: string;
  }>;
}

// ==============================================================================
// PHASE 6: CURRICULUM ENGINE & ACADEMIC PLANNING CONTRACTS
// ==============================================================================

// 1. Global Curriculum Framework
export interface CurriculumFramework {
  id: string;
  code: string; // e.g. 'CAMBRIDGE_PRIMARY'
  name: string; // 'Cambridge Primary'
  jurisdiction?: string | null; // 'International'
  description?: string | null;
  isActive: boolean;
  createdAt: string;
}

// 2. Historically Safe Curriculum Version
export interface CurriculumVersion {
  id: string;
  frameworkId: string;
  versionCode: string; // e.g. '2026.1'
  releaseYear: number;
  validFrom: string;
  validTo?: string | null;
  isCurrent: boolean;
  createdAt: string;
}

// 3. Curriculum Subject Standard
export interface CurriculumSubject {
  id: string;
  versionId: string;
  code: string; // 'MATH', 'ENG', 'SCI', 'GP', 'COMP'
  name: string; // 'Mathematics', 'English', etc.
  description?: string | null;
  displayOrder: number;
}

// 4. Curriculum Stage
export interface CurriculumStage {
  id: string;
  versionId: string;
  stageNumber: number; // 1, 2, 3, 4, 5, 6
  name: string; // 'Stage 1', 'Stage 5'
  typicalAgeRange?: string | null; // 'Age 9-10'
  displayOrder: number;
}

// 5. Curriculum Strand
export interface CurriculumStrand {
  id: string;
  versionId: string;
  subjectId: string;
  stageId?: string | null;
  code: string; // 'N', 'G', 'S', 'TWM'
  name: string; // 'Number', 'Geometry & Measure'
  description?: string | null;
  displayOrder: number;
}

// 6. Curriculum Sub-Strand (Optional Depth per Guardrail H)
export interface CurriculumSubStrand {
  id: string;
  versionId: string;
  strandId: string;
  code: string; // 'Nn', 'Nf'
  name: string; // 'Fractions, Decimals and Percentages'
  description?: string | null;
  displayOrder: number;
}

// 7. Canonical Learning Objective
export interface LearningObjective {
  id: string;
  versionId: string;
  subjectId: string;
  stageId: string;
  strandId: string;
  subStrandId?: string | null; // Nullable for flat subjects like GP/COMP
  code: string; // '5Nn.01'
  title: string;
  description: string;
  progressionOrder: number;
  isAuthoritative: boolean;
  provenanceSource?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// 8. Learning Objective Relationship
export type LearningObjectiveRelationshipType =
  | 'prerequisite'
  | 'precursor'
  | 'extension'
  | 'cross_curricular';

export interface LearningObjectiveRelationship {
  id: string;
  sourceObjectiveId: string;
  targetObjectiveId: string;
  relationshipType: LearningObjectiveRelationshipType;
  notes?: string | null;
}

// 9. School Curriculum Adoption
export interface SchoolCurriculumAdoption {
  id: string;
  schoolId: string;
  frameworkId: string;
  versionId: string;
  status: 'active' | 'archived';
  adoptedAt: string;
}

// 10. School Subject Mapping (Adoption-Scoped)
export interface SchoolCurriculumSubjectMap {
  id: string;
  schoolId: string;
  adoptionId: string;
  subjectId: string; // Local school subject ID
  curriculumSubjectId: string; // Global curriculum subject ID
}

// 11. Scheme of Work (Term Plan)
export type SchemeOfWorkStatus = 'draft' | 'approved' | 'active' | 'archived';

export interface SchemeOfWork {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  streamId?: string | null;
  subjectId: string;
  stageId: string;
  createdByEmployeeId: string;
  title: string;
  overviewText?: string | null;
  status: SchemeOfWorkStatus;
  createdAt: string;
  updatedAt: string;
}

// 12. Medium-Term Plan (Curriculum Unit, e.g. Weeks 1-3)
export interface MediumTermPlan {
  id: string;
  schemeId: string;
  unitNumber: number;
  title: string;
  weekStart: number;
  weekEnd: number;
  learningFocus?: string | null;
  estimatedPeriods?: number | null;
  displayOrder: number;
  createdAt: string;
}

// 13. Teaching Sequence (Planned Lesson in a Unit)
export interface TeachingSequence {
  id: string;
  mediumTermPlanId: string;
  sequenceNumber: number;
  title: string;
  suggestedActivities?: string | null;
  suggestedResources?: string | null;
  recommendedDurationMins: number;
  displayOrder: number;
}

// 14. Teaching Sequence Objective Link
export interface TeachingSequenceObjective {
  teachingSequenceId: string;
  learningObjectiveId: string;
  isPrimary: boolean;
}

// 15. Lesson to Objectives Relational Link
export interface LessonLearningObjective {
  lessonId: string;
  learningObjectiveId: string;
  teachingSequenceId?: string | null;
  isPrimary: boolean;
  notes?: string | null;
}

// -----------------------------------------------------------------------------
// 12. PHASE 7: SCHOOL FINANCE, PAYROLL, HR & OPERATIONAL MONEY CONTRACTS
// -----------------------------------------------------------------------------

// --- Fee Structure & Student Charges ---
export interface FeeCategory {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  description?: string | null;
  isMandatory: boolean;
  createdAt: string;
}

export interface FeeStructure {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId?: string | null;
  feeCategoryId: string;
  amount: number;
  currency: string;
  categoryName?: string;
  createdAt: string;
}

export interface StudentCharge {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  termId: string;
  feeCategoryId: string;
  feeStructureId?: string | null;
  description: string;
  amount: number;
  currency: string;
  dueDate: string;
  categoryName?: string;
  createdAt: string;
}

export interface FeePayment {
  id: string;
  schoolId: string;
  studentId: string;
  amount: number;
  currency: string;
  paymentDate: string;
  paymentChannel: 'bank_deposit' | 'mobile_money' | 'cash' | 'bank_transfer' | 'cheque' | 'other';
  paymentReference?: string | null;
  payerName?: string | null;
  payerPhone?: string | null;
  unallocatedAmount: number;
  recordedBy?: string | null;
  receiptNumber?: string | null;
  status: 'verified' | 'unallocated' | 'partially_allocated' | 'fully_allocated' | 'reversed';
  notes?: string | null;
  createdAt: string;
}

export interface PaymentAllocation {
  id: string;
  schoolId: string;
  paymentId: string;
  chargeId: string;
  amount: number;
  allocatedAt: string;
  allocatedBy?: string | null;
}

export interface FeeAdjustment {
  id: string;
  schoolId: string;
  studentId: string;
  chargeId: string;
  adjustmentType: 'waiver' | 'scholarship' | 'discount' | 'correction' | 'bad_debt_writeoff';
  amount: number;
  reason: string;
  authorizedBy: string;
  createdAt: string;
}

export interface StudentFeeAccount {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  termId: string;
  assessedAmount: number;
  paidAmount: number;
  balance: number;
  clearanceStatus: 'cleared' | 'partial' | 'overdue';
  updatedAt: string;
}

export interface StudentFeeStatement {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  totalAssessed: number;
  totalPaid: number;
  balance: number;
  clearanceStatus: 'cleared' | 'partial' | 'overdue';
  charges: Array<StudentCharge & { paidAmount: number; balance: number }>;
  payments: FeePayment[];
}

// --- Activities, Clubs & Decoupled Operational Clearance ---
export interface SchoolActivity {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  name: string;
  category: 'sports' | 'arts' | 'academic_club' | 'excursion' | 'special_service';
  isPaid: boolean;
  feeAmount: number;
  leadTeacherId?: string | null;
  leadTeacherName?: string | null;
  capacity?: number | null;
  enrolledCount?: number;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface ActivityEnrolment {
  id: string;
  schoolId: string;
  activityId: string;
  studentId: string;
  studentName?: string;
  className?: string;
  chargeId?: string | null;
  status: 'enrolled' | 'withdrawn' | 'suspended';
  enrolledAt: string;
}

export type ClearanceStatus = 'cleared' | 'not_cleared' | 'pending_review';
export type ClearanceBasis = 'paid' | 'waived' | 'sponsored' | 'promise_to_pay' | 'included' | 'administrative_approval';

export interface ActivityClearance {
  id: string;
  schoolId: string;
  activityId: string;
  studentId: string;
  status: ClearanceStatus;
  basis: ClearanceBasis;
  clearedBy?: string | null;
  clearedAt: string;
  validUntil?: string | null;
  operationalNote?: string | null;
}

// The Teacher Financial Privacy Firewall Projection
// Exposes operational clearance without ANY monetary figures
export interface ActivityParticipantProjection {
  studentId: string;
  studentName: string;
  className: string;
  activityId: string;
  activityName: string;
  clearanceStatus: ClearanceStatus;
  clearanceLabel: string; // e.g. "✓ Cleared • Promise to Pay"
  validUntil?: string | null;
  operationalNote?: string | null;
}

// --- School Expenses (Money Out) ---
export interface SchoolExpenseCategory {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  createdAt: string;
}

export interface SchoolExpense {
  id: string;
  schoolId: string;
  categoryId: string;
  categoryName?: string;
  amount: number;
  currency: string;
  spentOn: string;
  paymentChannel: 'bank_transfer' | 'cash' | 'mobile_money' | 'cheque';
  recipientPayee: string;
  description: string;
  referenceNumber?: string | null;
  receiptAttachmentUrl?: string | null;
  academicYearId?: string | null;
  termId?: string | null;
  recordedBy?: string | null;
  status: 'recorded' | 'approved' | 'reconciled' | 'voided';
  createdAt: string;
}

// --- Native Payroll Domain ---
export type PayBasis = 'salaried' | 'hourly';
export type TaxTreatment = 'local' | 'global' | 'contractor' | 'exempt';
export type PayrollRunStatus = 'draft' | 'calculated' | 'under_review' | 'approved' | 'finalized' | 'trashed';

export interface PayrollTaxBand {
  min: number;
  max: number | null;
  rate: number;
}

export interface PayrollTaxConfiguration {
  id: string;
  schoolId?: string | null;
  name: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  payeBands: PayrollTaxBand[];
  surchargeThreshold: number;
  surchargeRate: number;
  nssfEmployeeRate: number;
  nssfEmployerRate: number;
  overtimeMultiplier: number;
  standardMonthlyHours: number;
  defaultWhtRate: number;
  createdAt: string;
}

export interface EmployeePayrollProfile {
  id: string;
  schoolId: string;
  employeeId: string;
  employeeName?: string;
  jobTitle?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  payBasis: PayBasis;
  taxTreatment: TaxTreatment;
  baseSalary: number;
  hourlyRate?: number | null;
  currency: string;
  nssfApplicable: boolean;
  customWhtRate?: number | null;
  customOvertimeRate?: number | null;
  paymentMethod: 'bank_transfer' | 'mobile_money' | 'cash' | 'cheque';
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  mobileMoneyNumber?: string | null;
  mobileMoneyProvider?: 'mtn' | 'airtel' | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollPeriod {
  id: string;
  schoolId: string;
  periodStart: string;
  periodEnd: string;
  periodMonth: string; // 'YYYY-MM'
  label: string;       // e.g. 'September 2026'
  isClosed: boolean;
  createdAt: string;
}

export interface SchoolPayrollRun {
  id: string;
  schoolId: string;
  periodId: string;
  taxConfigurationId?: string | null;
  periodMonth: string;
  periodLabel: string;
  runNumber: number;
  runType: 'regular' | 'supplemental' | 'correction';
  status: PayrollRunStatus;
  calculationSettings: Record<string, any>;
  totalGross: number;
  totalPaye: number;
  totalNssfEmployee: number;
  totalNssfEmployer: number;
  totalWht: number;
  totalDeductions: number;
  totalNet: number;
  createdBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  finalizedBy?: string | null;
  finalizedAt?: string | null;
  itemsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolPayrollItem {
  id: string;
  schoolId: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  employeeNumber?: string;
  jobTitle?: string;
  grossSalary: number;
  overtimeHours: number;
  overtimeAmount: number;
  allowances: number;
  otherDeductions: number;
  paye: number;
  nssfEmployee: number;
  nssfEmployer: number;
  whtAmount: number;
  advanceDeduction: number;
  unpaidLeaveDeduction: number;
  netPay: number;
  employeeType: TaxTreatment;
  pctMonthWorked: number;
  createdAt: string;
}

// --- Staff HR Domain ---
export interface LeaveType {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  isPaid: boolean;
  defaultEntitlementDays?: number | null;
  requiresEvidence: boolean;
  color: string;
  displayOrder: number;
}

export interface PublicHoliday {
  id: string;
  schoolId?: string | null;
  holidayDate: string;
  name: string;
  isActive: boolean;
}

export interface LeaveEntitlement {
  id: string;
  schoolId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveYear: number;
  entitledDays: number;
  usedDays?: number;
  remainingDays?: number;
}

export type DayPortion = 'full' | 'morning' | 'afternoon';
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled';

export interface LeaveRequest {
  id: string;
  schoolId: string;
  employeeId: string;
  employeeName?: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  dayPortion: DayPortion;
  reason: string;
  status: LeaveRequestStatus;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EffectiveLeaveBalanceItem {
  leaveTypeId: string;
  code: string;
  name: string;
  color: string;
  isPaid: boolean;
  entitledDays: number;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
  isDefault: boolean;
}

export type AdvanceStatus = 'pending' | 'active' | 'paid_off' | 'rejected' | 'flagged' | 'voided';

export interface StaffAdvance {
  id: string;
  schoolId: string;
  employeeId: string;
  employeeName?: string;
  amount: number;
  balanceRemaining: number;
  monthlyDeduction: number;
  numInstalments: number;
  reason: string;
  status: AdvanceStatus;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdvanceRepayment {
  id: string;
  schoolId: string;
  advanceId: string;
  employeeId: string;
  payrollRunId?: string | null;
  payrollPeriodId: string;
  amount: number;
  source: 'payroll' | 'manual' | 'exit';
  notes?: string | null;
  paidAt: string;
}

// --- Institutional Money Movement View Models ---
export interface InstitutionalMoneyPicture {
  academicYearName: string;
  termName: string;
  moneyIn: {
    tuitionFees: number;
    activityFees: number;
    otherIncome: number;
    totalCollected: number;
  };
  moneyOut: {
    staffPayroll: number;
    schoolOperations: number;
    totalExpenditure: number;
  };
  netOperationalMovement: number;
  totalAssessedCharges: number;
  outstandingStudentCharges: number;
  collectionRatePercentage: number;
}

