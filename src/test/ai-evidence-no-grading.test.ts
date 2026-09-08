import { describe, it, expect } from 'vitest';
import { teachingAiService } from '../modules/teaching/teachingAiService';

describe('Inviolable Governance Law: Zero AI Grading', () => {
  it('extracts qualitative observation of student friction without assigning scores or grades', async () => {
    const draft = await teachingAiService.extractObservationDraftFromWork({
      assignmentTitle: 'Stage 5 Mathematics: Fractions Practice',
      objectiveCode: '5Nn.01',
      objectiveDescription: 'Understand place value and equivalences in fractions and decimals',
      workType: 'notebook',
      workSummary: 'Student struggled with finding common denominator for 2/3 and 3/5, wrote confused fraction diagrams in notebook.',
    });

    // Governance Invariants
    expect(draft.isGradingForbidden).toBe(true);
    expect(draft.requiresHumanApproval).toBe(true);
    expect(draft.isAiDrafted).toBe(true);
    expect(draft.observationType).toBe('misconception');
    expect(draft.observationText).toContain('friction');
    expect(draft.suggestedFollowupFocus).toBeDefined();

    // STRICT CHECK: No numeric grades or marks
    expect(draft.observationText).not.toMatch(/\b\d+%\b/);
    expect(draft.observationText).not.toMatch(/\bgrade [A-F]\b/i);
    expect(draft.observationText).not.toMatch(/\bfailed\b/i);
    expect(draft.observationText).not.toMatch(/\bpassed\b/i);
  });

  it('extracts qualitative learning progress when student demonstrates mastery', async () => {
    const draft = await teachingAiService.extractObservationDraftFromWork({
      assignmentTitle: 'Stage 5 Mathematics: Fractions Practice',
      objectiveCode: '5Nn.01',
      objectiveDescription: 'Understand place value and equivalences in fractions and decimals',
      workType: 'notebook',
      workSummary: 'Student accurately converted all fractions and drew clean tape diagrams showing equivalent values.',
    });

    expect(draft.isGradingForbidden).toBe(true);
    expect(draft.observationType).toBe('learning_progress');
    expect(draft.observationText).toContain('successfully demonstrated skill for 5Nn.01');
    expect(draft.suggestedFollowupFocus).toContain('extension');
  });

  it('drafts targeted intervention strictly with status = draft and human teacher gate', async () => {
    const interventionDraft = await teachingAiService.suggestInterventionFromEvidence({
      studentId: '33333333-3333-3333-3333-333333333331',
      curriculumObjective: '5Nn.01',
      approvedObservationSnippets: [
        'Learner exhibited friction converting fractions with unlike denominators using visual models.',
      ],
    });

    // Governance Invariants: AI suggestions are NEVER auto-activated
    expect(interventionDraft.status).toBe('draft');
    expect(interventionDraft.isAiSuggested).toBe(true);
    expect(interventionDraft.learningArea).toBe('Mathematics');
    expect(interventionDraft.strategyAction).toContain('retrieval practice');
    expect(interventionDraft.reason).toContain('5Nn.01');
    expect(interventionDraft.suggestedDurationDays).toBeGreaterThan(0);
  });
});
