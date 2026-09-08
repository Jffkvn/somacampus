/**
 * Core AI Teaching Loop Service — SomaCampus Phase 4/8/10
 *
 * Implements the 5-layer curriculum grounding engine:
 * Layer 1: Authoritative Cambridge Primary objective (Stage 1-6 Math, English, Science)
 * Layer 2: Real timetable & lesson context (class, stream, teacher, scheduled period)
 * Layer 3: Class evidence summary / learner observations (differentiation & scaffolding)
 * Layer 4: School resource library search-before-generate (vetted curriculum materials)
 * Layer 5: Structured JSON schema enforcement with strict human-in-the-loop review guards
 */
import { CAMBRIDGE_PRIMARY_PACK, type PackObjectiveDef } from '../../curriculum/packs/cambridge_primary';
import { SEED_ACADEMIC_RESOURCES } from './academicResources';
import type { SubmissionType, EvidenceTrack } from '../../types/domain';

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
  criterion: string;
  points: number;
  descriptors: string;
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
  // Strict Human-in-the-Loop Safeguards (Agreed Architecture Gate)
  isAiDrafted: true;
  requiresHumanApproval: true;
  status: 'draft';
  approvalState: 'unreviewed' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  generatedAt: string;
}

export interface GenerateDraftRequest {
  objectiveCode: string;
  subjectName?: string;
  stageNumber?: number;
  lessonContext: LessonContextGrounding;
  evidenceContext?: ClassEvidenceGrounding;
  preferredSubmissionType?: SubmissionType;
  preferredEvidenceTrack?: EvidenceTrack;
}

/**
 * Searches the authoritative Cambridge Primary curriculum pack for an objective by code or text.
 */
export function resolveCambridgeObjective(
  codeOrQuery: string,
  preferredSubject?: string,
  preferredStage?: number
): CurriculumObjectiveGrounding {
  const query = codeOrQuery.trim().toLowerCase();
  const allPackSubjects = CAMBRIDGE_PRIMARY_PACK.subjects;

  let candidates: Array<{ obj: PackObjectiveDef; subjectKey: string; subjectName: string }> = [];

  for (const [subjKey, subjDef] of Object.entries(allPackSubjects)) {
    for (const obj of subjDef.objectives) {
      candidates.push({
        obj,
        subjectKey: subjKey,
        subjectName: subjDef.subject.name,
      });
    }
  }

  // Exact code match first
  const exact = candidates.find((c) => c.obj.code.toLowerCase() === query);
  if (exact) {
    return {
      code: exact.obj.code,
      stageNumber: exact.obj.stage_number,
      stageLevel: `Stage ${exact.obj.stage_number}`,
      subjectCode: exact.subjectKey.toUpperCase(),
      subjectName: exact.subjectName,
      strandCode: exact.obj.strand_code,
      subStrandCode: exact.obj.sub_strand_code,
      title: exact.obj.title,
      description: exact.obj.description,
    };
  }

  // Filtered candidate search
  if (preferredSubject) {
    const subjNorm = preferredSubject.toLowerCase();
    candidates = candidates.filter(
      (c) => c.subjectKey.includes(subjNorm) || c.subjectName.toLowerCase().includes(subjNorm)
    );
  }
  if (preferredStage) {
    candidates = candidates.filter((c) => c.obj.stage_number === preferredStage);
  }

  const fuzzy = candidates.find(
    (c) =>
      c.obj.code.toLowerCase().includes(query) ||
      c.obj.title.toLowerCase().includes(query) ||
      c.obj.description.toLowerCase().includes(query)
  );

  if (!fuzzy) {
    throw new Error(
      `Cannot resolve Cambridge Primary objective for query: "${codeOrQuery}". Please select a valid Cambridge objective code (e.g. 5Nn.01, 5Nn.03, 5Bs.01, 6Wn.02).`
    );
  }

  return {
    code: fuzzy.obj.code,
    stageNumber: fuzzy.obj.stage_number,
    stageLevel: `Stage ${fuzzy.obj.stage_number}`,
    subjectCode: fuzzy.subjectKey.toUpperCase(),
    subjectName: fuzzy.subjectName,
    strandCode: fuzzy.obj.strand_code,
    subStrandCode: fuzzy.obj.sub_strand_code,
    title: fuzzy.obj.title,
    description: fuzzy.obj.description,
  };
}

/**
 * Searches school resource library for approved materials matching the curriculum topic/objective.
 */
export function searchLibraryBeforeGenerate(
  objective: CurriculumObjectiveGrounding,
  queryTopic?: string
): MatchedResourceRef[] {
  const code = objective.code.toLowerCase();
  const titleWords = objective.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const topicWords = (queryTopic || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  const matched = SEED_ACADEMIC_RESOURCES.filter((res) => {
    const resObj = res.curriculumObjective.toLowerCase();
    const resTitle = res.title.toLowerCase();
    const resTopic = res.topic.toLowerCase();
    const resTags = res.tags.map((t) => t.toLowerCase());

    const hasCode = resObj.includes(code);
    const hasStage = res.stageLevel.toLowerCase() === objective.stageLevel.toLowerCase();
    const hasWordMatch = titleWords.some((w) => resTitle.includes(w) || resTopic.includes(w) || resTags.includes(w));
    const hasTopicMatch = topicWords.some((w) => resTitle.includes(w) || resTopic.includes(w));

    return hasCode || (hasStage && (hasWordMatch || hasTopicMatch));
  });

  return matched.slice(0, 3).map((res) => ({
    id: res.id,
    title: res.title,
    type: res.type,
    stageLevel: res.stageLevel,
    curriculumObjective: res.curriculumObjective,
    previewText: res.previewText,
    relevanceReason: res.curriculumObjective.includes(objective.code)
      ? `Exact objective alignment with ${objective.code}`
      : `Pedagogical scaffolding reference for ${objective.stageLevel} ${objective.subjectName}`,
  }));
}

/**
 * Core 5-Layer AI Grounding Engine
 */
export const teachingAiService = {
  /**
   * Generates a fully grounded assignment draft based on the 5-layer framework.
   */
  async generateAssignmentDraft(request: GenerateDraftRequest): Promise<GroundedAssignmentDraft> {
    // 1. Layer 1: Authoritative Cambridge Primary Objective Resolution
    if (!request.objectiveCode || !request.objectiveCode.trim()) {
      throw new Error('Curriculum objective code is required for grounded generation (Layer 1).');
    }
    const objective = resolveCambridgeObjective(
      request.objectiveCode,
      request.subjectName || request.lessonContext.subjectName,
      request.stageNumber
    );

    // 2. Layer 2: Timetable and Lesson Context Validation
    const ctx = request.lessonContext;
    if (!ctx.schoolId || !ctx.teacherId || !ctx.className) {
      throw new Error('Valid timetable & lesson context (schoolId, teacherId, className) is required (Layer 2).');
    }

    // 3. Layer 3: Class Evidence & Learner Observations
    const evidence = request.evidenceContext || {};
    const observations = evidence.observations || [];
    const struggleNote = evidence.strugglingConcept || evidence.summaryNotes || '';
    const hasStruggles = Boolean(
      struggleNote ||
      (evidence.strugglingStudentCount && evidence.strugglingStudentCount > 0) ||
      observations.length > 0
    );

    let evidenceSummary = 'Standard cohort pacing. No active diagnostic anomalies recorded.';
    if (hasStruggles) {
      const studentCountStr = evidence.strugglingStudentCount
        ? ` (${evidence.strugglingStudentCount} learners identified)`
        : '';
      evidenceSummary = `Scaffolding active: Addressing ${struggleNote || 'recent misconceptions'}${studentCountStr}. Scaffolded step-by-step visual hints embedded.`;
    }

    // 4. Layer 4: Search-Before-Generate Library Query
    const matchedResources = searchLibraryBeforeGenerate(objective, ctx.topic || objective.title);

    // 5. Layer 5: Structured Schema Synthesis with Human Review Enforcement
    const topicName = ctx.topic || objective.title;
    const title = `${objective.stageLevel} ${ctx.subjectName}: ${topicName} Practice`;

    // Construct differentiated instructions referencing real Cambridge standards and library materials
    const instructionsLines: string[] = [
      `### Learning Goal (Cambridge Primary ${objective.code})`,
      `${objective.description}`,
      '',
      `### Context & Purpose`,
      `Scheduled instruction for ${ctx.className}${ctx.streamName ? ` (${ctx.streamName})` : ''} led by ${ctx.teacherName}.`,
    ];

    if (matchedResources.length > 0) {
      const topRes = matchedResources[0];
      instructionsLines.push(
        '',
        `### Reference Materials`,
        `Grounded in approved school resource **${topRes.title}** (${topRes.type.replace('_', ' ')}). Students should utilize the visual bar representations and practice frameworks established in class.`
      );
    }

    instructionsLines.push(
      '',
      '### Student Tasks & Instructions',
      '1. **Part A: Core Concepts (15 mins)**',
      `   Complete Exercises 1 to 4 demonstrating direct mastery of ${objective.title}. Show all working steps clearly in your exercise book.`,
      '2. **Part B: Guided Application (15 mins)**',
      '   Solve the 3 contextual word problems. Underline key mathematical numbers and state the unit of measurement in your final answer.'
    );

    if (hasStruggles) {
      instructionsLines.push(
        '3. **Scaffolded Support & Hint Box**',
        `   *Teacher Note for ${ctx.className}:* If you find conversion tricky, draw a visual strip or tape diagram first (as practiced in our briefing). Remember that 1 whole equals the denominator over itself (e.g. 5/5 = 1).`
      );
    }

    instructionsLines.push(
      '4. **Extension Challenge (Optional for Fast Finishers)**',
      '   Create a real-world word problem of your own involving these concepts and challenge a study partner to solve it.'
    );

    const instructions = instructionsLines.join('\n');

    // Rubric synthesis
    const rubric: GroundedRubricCriterion[] = [
      {
        criterion: 'Conceptual Understanding & Conversion',
        points: 20,
        descriptors: `Accurately solves problems meeting Cambridge standard ${objective.code} with sound conceptual logic.`,
      },
      {
        criterion: 'Mathematical Working & Representation',
        points: 15,
        descriptors: 'Shows clean step-by-step calculations or visual bar models as instructed.',
      },
      {
        criterion: 'Word Problem Application & Units',
        points: 10,
        descriptors: 'Correctly interprets word problems, extracts quantities, and provides proper units.',
      },
      {
        criterion: 'Precision & Self-Verification',
        points: 5,
        descriptors: 'Solutions are checked for reasonableness and free of simple calculation slips.',
      },
    ];

    const draft: GroundedAssignmentDraft = {
      title,
      instructions,
      submissionType: request.preferredSubmissionType || 'homework',
      evidenceTrack: request.preferredEvidenceTrack || 'diagnostic_evidence',
      maxScore: 50,
      rubric,
      grounding: {
        curriculumObjective: objective,
        lessonContext: ctx,
        classEvidenceSummary: evidenceSummary,
        matchedResources,
      },
      isAiDrafted: true,
      requiresHumanApproval: true,
      status: 'draft',
      approvalState: 'unreviewed',
      generatedAt: new Date().toISOString(),
    };

    return draft;
  },

  /**
   * Explicit Human-in-the-Loop Approval Action
   * Transitions draft from 'unreviewed' to 'approved'.
   */
  approveAssignmentDraft(
    draft: GroundedAssignmentDraft,
    approvingTeacherId: string
  ): GroundedAssignmentDraft {
    if (!approvingTeacherId) {
      throw new Error('Teacher ID is required to approve an AI-generated assignment draft.');
    }
    return {
      ...draft,
      approvalState: 'approved',
      approvedBy: approvingTeacherId,
      approvedAt: new Date().toISOString(),
    };
  },

  /**
   * List available Cambridge objectives by subject and stage for UI dropdowns.
   */
  getAvailableCambridgeObjectives(
    subjectKey?: string,
    stageNumber?: number
  ): CurriculumObjectiveGrounding[] {
    const allPackSubjects = CAMBRIDGE_PRIMARY_PACK.subjects;
    const results: CurriculumObjectiveGrounding[] = [];

    for (const [sKey, sDef] of Object.entries(allPackSubjects)) {
      if (subjectKey && !sKey.toLowerCase().includes(subjectKey.toLowerCase())) {
        continue;
      }
      for (const obj of sDef.objectives) {
        if (stageNumber && obj.stage_number !== stageNumber) {
          continue;
        }
        results.push({
          code: obj.code,
          stageNumber: obj.stage_number,
          stageLevel: `Stage ${obj.stage_number}`,
          subjectCode: sKey.toUpperCase(),
          subjectName: sDef.subject.name,
          strandCode: obj.strand_code,
          subStrandCode: obj.sub_strand_code,
          title: obj.title,
          description: obj.description,
        });
      }
    }

    return results;
  },
};
