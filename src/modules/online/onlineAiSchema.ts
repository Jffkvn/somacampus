/**
 * Schema validation and provenance contracts for SomaCampus Advisory AI (Phase 9I).
 *
 * Enforces:
 * 1. Deterministic schema validation via Zod
 * 2. Unambiguous provenance metadata on every output
 * 3. Classification of AI results without deceptive mock fallbacks
 */

import { z } from 'zod';

export const AiResultClassificationSchema = z.enum([
  'SUCCESS',
  'NO_AI_RESULT',
  'AI_PROVIDER_ERROR',
  'INVALID_AI_OUTPUT',
  'INSUFFICIENT_CONTEXT',
]);

export type AiResultClassification = z.infer<typeof AiResultClassificationSchema>;

export const AiProvenanceSchema = z.object({
  generatedBy: z.literal('AI'),
  modelOrEngine: z.string().default('somacampus-deterministic-advisory-v1'),
  generatedAt: z.string(),
  sourceEvidenceIds: z.array(z.string()).default([]),
  status: z.enum(['DRAFT', 'REVIEWED', 'APPROVED', 'DISCARDED']),
  approvedBy: z.string().nullable().default(null),
  approvedAt: z.string().nullable().default(null),
  isAiDrafted: z.literal(true),
  requiresHumanApproval: z.literal(true),
});

export type AiProvenance = z.infer<typeof AiProvenanceSchema>;

// Capability 1: Session Summary
export const SessionSummarySchema = z.object({
  sessionId: z.string(),
  body: z.string(),
  presentCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  curriculumRef: z.string().nullable().default(null),
  keyPoints: z.array(z.string()).default([]),
  provenance: AiProvenanceSchema,
  shareable: z.boolean().default(false),
  isEmpty: z.boolean().default(false),
  isAiDrafted: z.literal(true).default(true),
  requiresHumanApproval: z.literal(true).default(true),
  approvedBy: z.string().nullable().default(null),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

// Capability 2: Teacher Pre-Session Briefing
export const TeacherBriefingSchema = z.object({
  sessionId: z.string(),
  whatHappenedPreviously: z.string(),
  relevantLearnerPatterns: z.array(z.string()),
  suggestedFocus: z.string(),
  suggestedQuestions: z.array(z.string()),
  suggestedNextSteps: z.string(),
  evidenceCitations: z.array(z.string()),
  isEmpty: z.boolean().default(false),
  emptyMessage: z.string().nullable().default(null),
  provenance: AiProvenanceSchema,
});

export type TeacherBriefing = z.infer<typeof TeacherBriefingSchema>;

// Capability 3: Session Follow-up / Next-Step Recommendations
export const NextStepRecommendationSchema = z.object({
  sessionId: z.string(),
  suggestedActivities: z.array(z.string()),
  recommendedRetrievalQuestions: z.array(z.string()),
  pacingAdvice: z.string(),
  provenance: AiProvenanceSchema,
});

export type NextStepRecommendation = z.infer<typeof NextStepRecommendationSchema>;

// Capability 4: Online Scheduling Recommendations
export const SchedulingRecommendationItemSchema = z.object({
  slotTemplateId: z.string(),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string(),
  endTime: z.string(),
  teacherId: z.string(),
  teacherName: z.string().optional(),
  rationale: z.string(),
  conflictFree: z.boolean(),
  withinCapacity: z.boolean(),
});

export const SchedulingRecommendationSchema = z.object({
  enrolmentId: z.string(),
  subjectId: z.string(),
  recommendedSlots: z.array(SchedulingRecommendationItemSchema),
  alternativeTimes: z.array(
    z.object({
      dayOfWeek: z.number().int().min(1).max(7),
      startTime: z.string(),
      endTime: z.string(),
      notes: z.string(),
    }),
  ),
  suggestedFrequencyWeekly: z.number().int().positive(),
  emptyMessage: z.string().optional(),
  provenance: AiProvenanceSchema,
});

export type SchedulingRecommendation = z.infer<typeof SchedulingRecommendationSchema>;

// Capability 5: Teacher Allocation Recommendations (Workload-Aware, Strict Privacy)
export const TeacherAllocationCandidateSchema = z.object({
  teacherId: z.string(),
  displayName: z.string().optional(),
  subjectFit: z.boolean(),
  available: z.boolean(),
  conflictStatus: z.enum(['FREE', 'CONFLICT']),
  activeSessionCount: z.number().int().nonnegative(),
  capacityStatus: z.enum(['AVAILABLE', 'AT_CAPACITY']),
  score: z.number(),
  reasons: z.array(z.string()),
  eligible: z.boolean(),
});

export const TeacherAllocationRecommendationSchema = z.object({
  requiredSubjectId: z.string(),
  suggestions: z.array(TeacherAllocationCandidateSchema),
  emptyMessage: z.string().optional(),
  provenance: AiProvenanceSchema,
});

export type TeacherAllocationRecommendation = z.infer<
  typeof TeacherAllocationRecommendationSchema
>;

// Capability 6: Parent Communication Drafts
export const ParentCommunicationDraftSchema = z.object({
  studentId: z.string(),
  studentName: z.string(),
  draftType: z.enum([
    'SESSION_SUMMARY',
    'LEARNING_UPDATE',
    'REMINDER',
    'PROGRESS_COMMUNICATION',
    'FOLLOW_UP_SUGGESTION',
  ]),
  subject: z.string(),
  body: z.string(),
  sourceCount: z.number().int().nonnegative(),
  provenance: AiProvenanceSchema,
});

export type ParentCommunicationDraft = z.infer<typeof ParentCommunicationDraftSchema>;

// Capability 7: Timetable Scorecard & Conflict Diagnostics
export const TimetableScorecardSchema = z.object({
  hardViolationsCount: z.number().int().nonnegative(),
  hardViolations: z.array(z.string()),
  softPreferenceScore: z.number().min(0).max(100),
  preferenceBreakdown: z.array(
    z.object({
      name: z.string(),
      target: z.string(),
      satisfiedPercentage: z.number().min(0).max(100),
      details: z.string(),
    }),
  ),
  feasible: z.boolean(),
  aiExplanation: z.string(),
});

export type TimetableScorecard = z.infer<typeof TimetableScorecardSchema>;

export const ConstraintConflictReportSchema = z.object({
  status: z.enum(['COMPLIANT', 'PARTIALLY_COMPLIANT', 'INFEASIBLE']),
  unassignedPeriodsCount: z.number().int().nonnegative(),
  bottlenecks: z.array(
    z.object({
      type: z.string(),
      entity: z.string(),
      description: z.string(),
    }),
  ),
  suggestedResolutions: z.array(
    z.object({
      action: z.string(),
      description: z.string(),
      impact: z.string(),
    }),
  ),
});

export type ConstraintConflictReport = z.infer<typeof ConstraintConflictReportSchema>;
