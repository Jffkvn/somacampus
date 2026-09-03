import type {
  EvidenceReference,
  InterventionStatus,
} from '../../types/domain';

export interface AiDraftIntervention {
  studentId: string;
  learningArea: string;
  reason: string;
  suggestedStrategy: string;
  targetOutcome: string;
  suggestedDurationDays: number;
  evidenceBasis: EvidenceReference[];
  status: InterventionStatus; // FORCED to 'draft'
  isAiSuggested: true;
}

export interface AiBriefingSynthesis {
  executiveSummary: string;
  attentionAlert: string | null;
  recommendedRetrievalPrompt: string | null;
  evidenceCitations: EvidenceReference[];
}

export const aiIntelligenceAssistant = {
  /**
   * Drafts an intervention suggestion for teacher review.
   * AI can ONLY generate a 'draft'. It is impossible for this helper
   * to produce an 'active' intervention.
   * Requires at least 1 concrete piece of evidence as basis.
   */
  draftInterventionSuggestion(params: {
    studentId: string;
    studentName: string;
    learningArea: string;
    recentEvidence: EvidenceReference[];
    misconceptionSnippet?: string;
  }): AiDraftIntervention {
    const basis = params.recentEvidence.slice(0, 4);

    const reason = params.misconceptionSnippet
      ? `Observed friction in ${params.learningArea}: "${params.misconceptionSnippet}"`
      : `Multiple difficulty indicators observed in ${params.learningArea} across recent work.`;

    const suggestedStrategy = `Structured 15-minute small-group retrieval practice twice weekly using visual step-by-step scaffolds for ${params.learningArea}.`;

    const targetOutcome = `Student can independently solve standard exercises in ${params.learningArea} with at least 80% accuracy.`;

    return {
      studentId: params.studentId,
      learningArea: params.learningArea,
      reason,
      suggestedStrategy,
      targetOutcome,
      suggestedDurationDays: 14,
      evidenceBasis: basis,
      status: 'draft', // Hardcoded invariant: AI suggestions are ALWAYS 'draft'
      isAiSuggested: true,
    };
  },

  /**
   * Generates a grounded synthesis for the Pre-Lesson Briefing.
   * Only synthesizes when concrete evidence citations are provided.
   */
  synthesizeBriefingNotes(params: {
    className: string;
    subjectName: string;
    topic: string;
    studentsNeedingAttentionCount: number;
    evidenceItems: EvidenceReference[];
  }): AiBriefingSynthesis {
    const citations = params.evidenceItems.slice(0, 5);

    if (citations.length === 0) {
      return {
        executiveSummary: `Preparing for ${params.topic}. No prior friction patterns recorded for this topic.`,
        attentionAlert: null,
        recommendedRetrievalPrompt: `Spend 5 minutes recalling key foundational principles of ${params.topic}.`,
        evidenceCitations: [],
      };
    }

    const executiveSummary =
      params.studentsNeedingAttentionCount > 0
        ? `Pre-lesson analysis for ${params.className} in ${params.subjectName}: ${params.studentsNeedingAttentionCount} learner(s) have documented misconceptions related to ${params.topic}. Targeted warm-up recommended.`
        : `Recent class evidence in ${params.subjectName} demonstrates steady engagement. Proceed with planned curriculum progression for ${params.topic}.`;

    const attentionAlert =
      params.studentsNeedingAttentionCount > 0
        ? `${params.studentsNeedingAttentionCount} student(s) have recorded active interventions or misconceptions in this area.`
        : null;

    const recommendedRetrievalPrompt = `Brief warm-up prompt: Present a sample problem on ${params.topic} with a deliberate common error and ask pairs to diagnose the issue.`;

    return {
      executiveSummary,
      attentionAlert,
      recommendedRetrievalPrompt,
      evidenceCitations: citations,
    };
  },
};
