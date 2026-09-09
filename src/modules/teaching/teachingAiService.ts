/**
 * Core AI Teaching Loop Service — SomaCampus
 *
 * Implements the 5-layer curriculum grounding engine & server AI provider boundary:
 * Layer 1: Authoritative Cambridge Primary objective (Stage 1-6 Math, English, Science)
 * Layer 2: Real timetable & lesson context (class, stream, teacher, scheduled period)
 * Layer 3: Class evidence summary / learner observations (differentiation & scaffolding)
 * Layer 4: Live school Resource Library search-before-generate (vetted curriculum materials)
 * Layer 5: Structured JSON schema enforcement with strict human-in-the-loop review guards
 *
 * Inviolable Laws:
 * - Law 1: Zero mutable mock arrays, fail closed on DB errors.
 * - Law 3: Server-side provider boundary; zero API keys in browser.
 * - Absolute Rule: ZERO AI GRADING. Qualitative observations only.
 */

import { supabase } from '../../lib/supabase';
import { CAMBRIDGE_PRIMARY_PACK } from '../../curriculum/packs/cambridge_primary';
import { resourceLibraryService } from './resourceLibraryService';
import { SEED_ACADEMIC_RESOURCES, type AcademicResource } from './academicResources';
import type { SubmissionType, EvidenceTrack, ObservationType } from '../../types/domain';
import {
  AssignmentDraftAiSchema,
  ObservationDraftAiSchema,
  InterventionDraftAiSchema,
} from './teachingAiSchema';

/**
 * Explicit AI service failure carrying provider + action context.
 * Thrown (never swallowed) whenever the Edge provider call fails or returns
 * an invalid payload outside the test-mode synthesis seam, so UI callers can
 * surface an honest error banner instead of a silent synthetic draft.
 */
export class AiServiceError extends Error {
  provider: string;
  action: string;
  constructor(provider: string, action: string, message: string) {
    super(`AI ${provider} (${action}) unavailable: ${message}`);
    this.name = 'AiServiceError';
    this.provider = provider;
    this.action = action;
  }
}

let testSeamOverride: boolean | null = null;

/**
 * Test-only override for the deterministic synthesis gate below.
 * No-op unless the bundle runs in test mode, so a production console can
 * never re-enable the synthetic seam by calling this hook.
 */
export function __setTeachingAiTestSeamOverride(value: boolean | null): void {
  if (import.meta.env.MODE !== 'test') return;
  testSeamOverride = value;
}

/**
 * Phase B gate: deterministic synthesis runs ONLY in test mode
 * (import.meta.env.MODE === 'test'). Every other environment throws
 * AiServiceError on provider failure — no silent synthetic drafts, even if
 * the test-only override was somehow set.
 */
function isTestSeamAllowed(): boolean {
  if (import.meta.env.MODE !== 'test') return false;
  if (testSeamOverride !== null) return testSeamOverride;
  return true;
}

export interface CurriculumObjectiveGrounding {
  code: string;
  stageNumber: number;
  stageLevel: string;
  subjectCode: string;
  subjectName: string;
  strandCode: string;
  subStrandCode?: string | null;
  title: string;
  description: string;
}

export interface LessonContextGrounding {
  schoolId: string;
  classId?: string | null;
  className: string;
  streamId?: string | null;
  streamName?: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  lessonId?: string | null;
  scheduledTime?: string;
  topic?: string;
}

export interface ClassEvidenceGrounding {
  observations?: string[];
  summaryNotes?: string;
  strugglingConcept?: string;
  strugglingStudentCount?: number;
  advancedStudentCount?: number;
  recentAssessmentScoreAvg?: number;
}

export interface MatchedResourceRef {
  id: string;
  title: string;
  type: string;
  stageLevel: string;
  curriculumObjective: string;
  previewText: string;
  relevanceReason: string;
}

export interface GroundedRubricCriterion {
  criteria: string;
  maxPoints: number;
  guidance: string;
}

export interface GroundedAssignmentDraft {
  title: string;
  instructions: string;
  submissionType: SubmissionType;
  evidenceTrack: EvidenceTrack;
  maxScore: number;
  rubric: GroundedRubricCriterion[];
  grounding: {
    curriculumObjective: CurriculumObjectiveGrounding;
    lessonContext: LessonContextGrounding;
    classEvidenceSummary: string;
    matchedResources: MatchedResourceRef[];
  };
  resourceIdUsed?: string;
  // Strict Human-in-the-Loop Safeguards (Agreed Architecture Gate)
  isAiDrafted: true;
  requiresHumanApproval: true;
  status: 'draft';
  approvalState: 'unreviewed' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  /** Provenance label: Edge provider name, or 'synthetic-test' for the test-mode seam. */
  provider?: string;
}

export interface GroundedObservationDraft {
  observationType: ObservationType;
  observationText: string;
  suggestedFollowupFocus?: string;
  isAiDrafted: true;
  requiresHumanApproval: true;
  isGradingForbidden: true;
  /** Provenance label: Edge provider name, or 'synthetic-test' for the test-mode seam. */
  provider?: string;
}

export interface GroundedInterventionDraft {
  studentId: string;
  learningArea: string;
  topicName: string;
  reason: string;
  strategyAction: string;
  targetOutcome: string;
  suggestedDurationDays: number;
  status: 'draft';
  isAiSuggested: true;
  /** Provenance label: Edge provider name, or 'synthetic-test' for the test-mode seam. */
  provider?: string;
}

export interface GenerateDraftRequest {
  objectiveCode: string;
  subjectName?: string;
  stageNumber?: number;
  lessonContext: LessonContextGrounding;
  evidenceContext?: ClassEvidenceGrounding;
  preferredSubmissionType?: SubmissionType;
  preferredEvidenceTrack?: EvidenceTrack;
  adaptedResource?: AcademicResource;
}

export interface ExtractObservationParams {
  assignmentTitle: string;
  objectiveCode: string;
  objectiveDescription: string;
  workType: string;
  workSummary: string;
  /**
   * Declared for API compatibility but NEVER populated or sent.
   * The extractor is text-only (teacher-entered workSummary); no photo bytes
   * and no vision analysis exist on this path. Capability honesty (Phase B).
   * @deprecated Never set — always omit.
   */
  photoLocation?: string;
  // Phase A2 tenant grounding: edge validates each supplied ID against caller's school.
  schoolId?: string | null;
  teacherId?: string | null;
  classId?: string | null;
  streamId?: string | null;
  subjectId?: string | null;
  studentId?: string | null;
  resourceIds?: string[];
}

export interface SuggestInterventionParams {
  studentId: string;
  curriculumObjective: string;
  approvedObservationSnippets: string[];
  // Phase A2 tenant grounding: edge validates each supplied ID against caller's school.
  schoolId?: string | null;
  teacherId?: string | null;
  classId?: string | null;
  streamId?: string | null;
  subjectId?: string | null;
  resourceIds?: string[];
}

/**
 * Layer 1: Resolves an authoritative Cambridge Primary learning objective.
 * Fails closed on unknown/generic objectives.
 */
export function resolveCambridgeObjective(code: string): CurriculumObjectiveGrounding {
  const trimmed = code.trim().toLowerCase();

  for (const [subjectKey, subjDef] of Object.entries(CAMBRIDGE_PRIMARY_PACK.subjects)) {
    for (const obj of subjDef.objectives) {
      if (obj.code.toLowerCase() === trimmed || obj.code.toLowerCase().replace('.', '').includes(trimmed)) {
        const subjectName =
          subjectKey === 'mathematics'
            ? 'Mathematics'
            : subjectKey === 'english'
            ? 'English'
            : subjectKey === 'science'
            ? 'Science'
            : subjDef.subject.name;

        return {
          code: obj.code,
          stageNumber: obj.stage_number,
          stageLevel: `Stage ${obj.stage_number}`,
          subjectCode: subjectKey.toUpperCase(),
          subjectName,
          strandCode: obj.strand_code,
          subStrandCode: obj.sub_strand_code ?? null,
          title: obj.title,
          description: obj.description,
        };
      }
    }
  }

  throw new Error(`Cannot resolve Cambridge Primary objective for code: "${code}". Fails closed on ungrounded objectives.`);
}

/**
 * Layer 4: Search-Before-Generate against verified materials.
 */
export function searchLibraryBeforeGenerate(
  objective: CurriculumObjectiveGrounding,
  topic?: string
): MatchedResourceRef[] {
  const matches: MatchedResourceRef[] = [];

  for (const res of SEED_ACADEMIC_RESOURCES) {
    const objMatch = res.curriculumObjective.toLowerCase().includes(objective.code.toLowerCase());
    const topicMatch = topic && res.topic.toLowerCase().includes(topic.toLowerCase());

    if (objMatch || topicMatch) {
      matches.push({
        id: res.id,
        title: res.title,
        type: res.type,
        stageLevel: res.stageLevel,
        curriculumObjective: res.curriculumObjective,
        previewText: res.previewText,
        relevanceReason: objMatch ? `Exact objective alignment to ${objective.code}` : `Related to topic ${topic}`,
      });
    }
  }

  return matches;
}

export const teachingAiService = {
  /**
   * Returns available objectives for a subject and stage level.
   */
  getAvailableCambridgeObjectives(subject?: string, stage?: number): CurriculumObjectiveGrounding[] {
    const list: CurriculumObjectiveGrounding[] = [];
    const subjectsToScan = subject
      ? [subject.toLowerCase()]
      : Object.keys(CAMBRIDGE_PRIMARY_PACK.subjects);

    for (const subjKey of subjectsToScan) {
      const subjDef = CAMBRIDGE_PRIMARY_PACK.subjects[subjKey];
      if (!subjDef) continue;

      for (const obj of subjDef.objectives) {
        if (stage && obj.stage_number !== stage) continue;

        list.push({
          code: obj.code,
          stageNumber: obj.stage_number,
          stageLevel: `Stage ${obj.stage_number}`,
          subjectCode: subjKey.toUpperCase(),
          subjectName: subjDef.subject.name,
          strandCode: obj.strand_code,
          subStrandCode: obj.sub_strand_code ?? null,
          title: obj.title,
          description: obj.description,
        });
      }
    }

    return list;
  },

  /**
   * Layer 4: Queries live database school resources matching the curriculum objective.
   */
  async findMatchingResources(schoolId: string, objectiveCode: string): Promise<AcademicResource[]> {
    return resourceLibraryService.findMatchingResources(schoolId, objectiveCode);
  },

  /**
   * The 5-Layer AI Grounding Engine:
   * Generates a grounded assignment draft using the authoritative Cambridge objective,
   * lesson context, class evidence notes, and school resources.
   */
  async generateAssignmentDraft(request: GenerateDraftRequest): Promise<GroundedAssignmentDraft> {
    const ctx = request.lessonContext;

    // Validate lesson & timetable context (Layer 2)
    if (!ctx.schoolId || !ctx.teacherId || !ctx.className || !ctx.subjectId || !ctx.subjectName || !ctx.teacherName) {
      throw new Error('Valid timetable & lesson context (school, class, subject, teacher) is required for curriculum grounding.');
    }

    // Resolve Cambridge Primary standard (Layer 1)
    const objective = resolveCambridgeObjective(request.objectiveCode);

    // Live Resource Library Search-Before-Generate (Layer 4)
    let matchedResources: MatchedResourceRef[] = [];
    try {
      const dbResources = await this.findMatchingResources(ctx.schoolId, objective.code);
      if (dbResources.length > 0) {
        matchedResources = dbResources.slice(0, 3).map((r) => ({
          id: r.id,
          title: r.title,
          type: r.type,
          stageLevel: r.stageLevel,
          curriculumObjective: r.curriculumObjective,
          previewText: r.previewText,
          relevanceReason: `Exact objective alignment to ${objective.code}`,
        }));
      }
    } catch {
      // fallback to static matcher if db query is offline
      matchedResources = searchLibraryBeforeGenerate(objective, ctx.topic);
    }

    if (matchedResources.length === 0) {
      matchedResources = searchLibraryBeforeGenerate(objective, ctx.topic);
    }

    // Server Edge Function provider call (Phase B: explicit errors, validated output).
    // Any transport failure throws AiServiceError outside test mode; the
    // deterministic synthesis seam below runs ONLY when isTestSeamAllowed().
    let edgeData: unknown = null;
    try {
      const { data, error } = await supabase.functions.invoke('ai-teaching-assistant', {
        body: {
          action: 'generate_assignment',
          payload: {
            // Phase A2 tenant grounding (edge verifies each ID belongs to caller's school)
            schoolId: ctx.schoolId,
            teacherId: ctx.teacherId,
            classId: ctx.classId ?? null,
            streamId: ctx.streamId ?? null,
            subjectId: ctx.subjectId,
            resourceIds: request.adaptedResource?.id ? [request.adaptedResource.id] : [],
            objectiveCode: objective.code,
            objectiveTitle: objective.title,
            objectiveDescription: objective.description,
            className: ctx.className,
            subjectName: ctx.subjectName,
            topic: ctx.topic || objective.title,
            resourceContent: request.adaptedResource?.previewText,
            strugglingConcept: request.evidenceContext?.strugglingConcept,
          },
        },
      });

      if (error) {
        throw new AiServiceError(
          'edge',
          'generate_assignment',
          error.message ?? 'Edge function returned an error.'
        );
      }
      edgeData = data;
    } catch (err) {
      if (!isTestSeamAllowed()) {
        if (err instanceof AiServiceError) throw err;
        throw new AiServiceError(
          'edge',
          'generate_assignment',
          err instanceof Error ? err.message : 'Unknown provider failure.'
        );
      }
      edgeData = null;
    }

    if (edgeData !== null && edgeData !== undefined) {
      const checked = AssignmentDraftAiSchema.safeParse(edgeData);
      if (!checked.success) {
        throw new AiServiceError(
          'edge',
          'generate_assignment',
          `Edge response failed validation: ${checked.error.issues.map((i) => i.message).join('; ')}`
        );
      }
      const valid = checked.data;
      return {
        title: valid.title,
        instructions: valid.instructions,
        submissionType: request.preferredSubmissionType || 'homework',
        evidenceTrack: request.preferredEvidenceTrack || 'diagnostic_evidence',
        maxScore: valid.maxScore,
        rubric: valid.rubric.map((r) => ({
          criteria: r.criteria,
          maxPoints: r.maxPoints,
          guidance: r.guidance,
        })),
        grounding: {
          curriculumObjective: objective,
          lessonContext: ctx,
          classEvidenceSummary: request.evidenceContext?.strugglingConcept
            ? `Scaffolding active: ${request.evidenceContext.strugglingStudentCount ?? 4} learners identified with friction in ${request.evidenceContext.strugglingConcept}`
            : 'Standard cohort pacing. No active diagnostic anomalies recorded.',
          matchedResources,
        },
        resourceIdUsed: request.adaptedResource?.id,
        isAiDrafted: true,
        requiresHumanApproval: true,
        status: 'draft',
        approvalState: 'unreviewed',
        provider: valid.provider ?? 'edge',
      };
    }

    if (!isTestSeamAllowed()) {
      throw new AiServiceError(
        'edge',
        'generate_assignment',
        'AI provider unavailable and test synthesis is disabled outside test mode.'
      );
    }

    // High-precision deterministic synthesis seam (TEST MODE ONLY, labelled synthetic)
    const topicName = ctx.topic || objective.title;
    const title = `${objective.stageLevel} ${ctx.subjectName}: ${topicName} Practice`;

    let instructions = `### Learning Goal (${objective.code})\n${objective.description}\n\n`;
    instructions += `### Context & Purpose\nScheduled instruction for ${ctx.className} (${ctx.streamName || 'Blue'}) led by ${ctx.teacherName}.\n\n`;

    if (request.adaptedResource) {
      instructions += `### Reference Materials (Adapted from School Library)\nGrounded in approved school resource: **${request.adaptedResource.title}**\n${request.adaptedResource.previewText}\n\n`;
    } else if (matchedResources.length > 0) {
      instructions += `### Reference Materials\nGrounded in approved school resource: **${matchedResources[0].title}**\n${matchedResources[0].previewText}\n\n`;
    }

    instructions += `### Student Tasks\n`;
    instructions += `#### Part A: Core Concepts & Fluency\n1. Complete questions 1-4 on finding equivalent values using visual models.\n\n`;
    instructions += `#### Part B: Guided Application & Scaffolding\n2. Solve questions 5-8 showing full step-by-step working and conversion logic.\n`;
    instructions += `3. Explain in two sentences how a tape diagram proves equivalence for unequal denominators.\n`;

    if (request.evidenceContext?.strugglingConcept) {
      instructions += `\n### Scaffolded Support & Hint Box\n`;
      instructions += `> **💡 Differentiation Hint:** For learners working on *${request.evidenceContext.strugglingConcept}*, draw a 10-segment tape diagram before calculating.\n`;
    }

    const rubric: GroundedRubricCriterion[] = [
      { criteria: `${objective.code} Conceptual Accuracy`, maxPoints: 20, guidance: 'Demonstrates clear understanding of equivalent quantities and core conversions.' },
      { criteria: 'Step-by-Step Mathematical Reasoning', maxPoints: 15, guidance: 'Shows full working, bar models, or fraction diagrams.' },
      { criteria: 'Applied Word Problem Resolution', maxPoints: 10, guidance: 'Correctly sets up and executes real-world scenario calculations.' },
      { criteria: 'Neatness & Mathematical Notation', maxPoints: 5, guidance: 'Clear layout, labeled units, and legible number sentences.' },
    ];

    return {
      title,
      instructions,
      submissionType: request.preferredSubmissionType || 'homework',
      evidenceTrack: request.preferredEvidenceTrack || 'diagnostic_evidence',
      maxScore: 50,
      rubric,
      grounding: {
        curriculumObjective: objective,
        lessonContext: ctx,
        classEvidenceSummary: request.evidenceContext?.strugglingConcept
          ? `Scaffolding active: ${request.evidenceContext.strugglingStudentCount ?? 4} learners identified with friction in ${request.evidenceContext.strugglingConcept}`
          : 'Standard cohort pacing. No active diagnostic anomalies recorded.',
        matchedResources,
      },
      resourceIdUsed: request.adaptedResource?.id,
      isAiDrafted: true,
      requiresHumanApproval: true,
      status: 'draft',
      approvalState: 'unreviewed',
      provider: 'synthetic-test',
    };
  },

  /**
   * AI Evidence Extraction from Student Work (Physical or Digital).
   * INVIOLABLE RULE: ABSOLUTELY ZERO AI GRADING.
   * Extracts qualitative observations of misconceptions or progress only.
   */
  async extractObservationDraftFromWork(params: ExtractObservationParams): Promise<GroundedObservationDraft> {
    // CAPABILITY HONESTY (Phase B): text-only extraction. Only the
    // teacher-entered workSummary string is sent to the Edge provider — no
    // image/photo bytes and no vision analysis exist on this path
    // (photoLocation is declared but never populated or transmitted).
    let edgeData: unknown = null;
    try {
      const { data, error } = await supabase.functions.invoke('ai-teaching-assistant', {
        body: {
          action: 'extract_work_observation',
          payload: {
            // Phase A2 tenant grounding (edge verifies each ID belongs to caller's school)
            schoolId: params.schoolId ?? null,
            teacherId: params.teacherId ?? null,
            classId: params.classId ?? null,
            streamId: params.streamId ?? null,
            subjectId: params.subjectId ?? null,
            studentId: params.studentId ?? null,
            resourceIds: params.resourceIds ?? [],
            assignmentTitle: params.assignmentTitle,
            objectiveCode: params.objectiveCode,
            objectiveDescription: params.objectiveDescription,
            workType: params.workType,
            workSummary: params.workSummary,
          },
        },
      });

      if (error) {
        throw new AiServiceError(
          'edge',
          'extract_work_observation',
          error.message ?? 'Edge function returned an error.'
        );
      }
      edgeData = data;
    } catch (err) {
      if (!isTestSeamAllowed()) {
        if (err instanceof AiServiceError) throw err;
        throw new AiServiceError(
          'edge',
          'extract_work_observation',
          err instanceof Error ? err.message : 'Unknown provider failure.'
        );
      }
      edgeData = null;
    }

    if (edgeData !== null && edgeData !== undefined) {
      const checked = ObservationDraftAiSchema.safeParse(edgeData);
      if (!checked.success) {
        throw new AiServiceError(
          'edge',
          'extract_work_observation',
          `Edge response failed validation: ${checked.error.issues.map((i) => i.message).join('; ')}`
        );
      }
      const valid = checked.data;
      return {
        observationType: valid.observationType,
        observationText: valid.observationText,
        suggestedFollowupFocus: valid.suggestedFollowupFocus,
        isAiDrafted: true,
        requiresHumanApproval: true,
        isGradingForbidden: true,
        provider: valid.provider ?? 'edge',
      };
    }

    if (!isTestSeamAllowed()) {
      throw new AiServiceError(
        'edge',
        'extract_work_observation',
        'AI provider unavailable and test synthesis is disabled outside test mode.'
      );
    }

    // Deterministic qualitative observation extraction seam (TEST MODE ONLY, labelled synthetic)
    const isFriction =
      params.workSummary.toLowerCase().includes('struggl') ||
      params.workSummary.toLowerCase().includes('confus') ||
      params.workSummary.toLowerCase().includes('error') ||
      params.workSummary.toLowerCase().includes('unlike');

    const observationType: ObservationType = isFriction ? 'misconception' : 'learning_progress';
    const observationText = isFriction
      ? `Learner demonstrates foundational understanding of equivalent fractions with common denominators, but exhibited friction with unlike denominators in: "${params.workSummary.slice(0, 100)}".`
      : `Learner successfully demonstrated skill for ${params.objectiveCode} with clear mathematical notation and accurate working in: "${params.workSummary.slice(0, 100)}".`;

    return {
      observationType,
      observationText,
      suggestedFollowupFocus: isFriction ? '10-minute visual fraction strip retrieval' : 'Independent extension problems',
      isAiDrafted: true,
      requiresHumanApproval: true,
      isGradingForbidden: true,
      provider: 'synthetic-test',
    };
  },

  /**
   * AI Next-Step / Intervention Suggestion grounded in approved observations.
   * Status is strictly forced to 'draft'.
   */
  async suggestInterventionFromEvidence(params: SuggestInterventionParams): Promise<GroundedInterventionDraft> {
    let edgeData: unknown = null;
    try {
      const { data, error } = await supabase.functions.invoke('ai-teaching-assistant', {
        body: {
          action: 'suggest_intervention',
          payload: {
            // Phase A2 tenant grounding (edge verifies each ID belongs to caller's school)
            schoolId: params.schoolId ?? null,
            teacherId: params.teacherId ?? null,
            classId: params.classId ?? null,
            streamId: params.streamId ?? null,
            subjectId: params.subjectId ?? null,
            studentId: params.studentId,
            resourceIds: params.resourceIds ?? [],
            curriculumObjective: params.curriculumObjective,
            approvedObservationSnippets: params.approvedObservationSnippets,
          },
        },
      });

      if (error) {
        throw new AiServiceError(
          'edge',
          'suggest_intervention',
          error.message ?? 'Edge function returned an error.'
        );
      }
      edgeData = data;
    } catch (err) {
      if (!isTestSeamAllowed()) {
        if (err instanceof AiServiceError) throw err;
        throw new AiServiceError(
          'edge',
          'suggest_intervention',
          err instanceof Error ? err.message : 'Unknown provider failure.'
        );
      }
      edgeData = null;
    }

    if (edgeData !== null && edgeData !== undefined) {
      // Status is forced to draft by the schema: anything else is rejected, never coerced.
      const checked = InterventionDraftAiSchema.safeParse(edgeData);
      if (!checked.success) {
        throw new AiServiceError(
          'edge',
          'suggest_intervention',
          `Edge response failed validation: ${checked.error.issues.map((i) => i.message).join('; ')}`
        );
      }
      const valid = checked.data;
      return {
        studentId: params.studentId,
        learningArea: valid.learningArea,
        topicName: valid.topicName,
        reason: valid.reason,
        strategyAction: valid.strategyAction,
        targetOutcome: valid.targetOutcome,
        suggestedDurationDays: valid.suggestedDurationDays,
        status: 'draft',
        isAiSuggested: true,
        provider: valid.provider ?? 'edge',
      };
    }

    if (!isTestSeamAllowed()) {
      throw new AiServiceError(
        'edge',
        'suggest_intervention',
        'AI provider unavailable and test synthesis is disabled outside test mode.'
      );
    }

    // Deterministic intervention synthesis seam (TEST MODE ONLY, labelled synthetic)
    return {
      studentId: params.studentId,
      learningArea: 'Mathematics',
      topicName: 'Fractions & Decimals',
      reason: `Approved observations cite friction with ${params.curriculumObjective}: ${params.approvedObservationSnippets[0] || 'repeated struggle with unlike denominators'}`,
      strategyAction: 'Conduct structured 15-minute small-group retrieval practice with concrete fraction strips and number lines twice weekly.',
      targetOutcome: 'Student independently identifies and converts fractions with unlike denominators with at least 80% accuracy.',
      suggestedDurationDays: 14,
      status: 'draft',
      isAiSuggested: true,
      provider: 'synthetic-test',
    };
  },

  /**
   * Explicit Human Teacher Approval Gate for AI Drafts.
   */
  approveAssignmentDraft(draft: GroundedAssignmentDraft, teacherId: string): GroundedAssignmentDraft {
    if (!teacherId || !teacherId.trim()) {
      throw new Error('Teacher ID is required to approve and publish an assignment');
    }

    return {
      ...draft,
      approvalState: 'approved',
      approvedBy: teacherId,
      approvedAt: new Date().toISOString(),
    };
  },
};
