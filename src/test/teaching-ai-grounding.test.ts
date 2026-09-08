import { describe, it, expect } from 'vitest';
import {
  teachingAiService,
  resolveCambridgeObjective,
  searchLibraryBeforeGenerate,
  type GenerateDraftRequest,
} from '../modules/teaching/teachingAiService';

describe('Track A: Core AI Teaching Loop Grounding Engine', () => {
  const sampleLessonContext = {
    schoolId: '22222222-2222-2222-2222-222222222222',
    classId: '55555555-5555-5555-5555-555555555551',
    className: 'Stage 5 Blue',
    streamId: '66666666-6666-6666-6666-666666666661',
    streamName: 'Blue',
    subjectId: '77777777-7777-7777-7777-777777777771',
    subjectName: 'Mathematics',
    teacherId: '99999999-9999-9999-9999-999999999992',
    teacherName: 'Mr. David Musoke',
    scheduledTime: '08:00 - 09:00',
    topic: 'Fractions & Decimals',
  };

  describe('Layer 1: Cambridge Primary Framework Grounding', () => {
    it('resolves real Cambridge Primary mathematics objective (5Nn.01)', () => {
      const obj = resolveCambridgeObjective('5Nn.01');
      expect(obj.code).toBe('5Nn.01');
      expect(obj.stageNumber).toBe(5);
      expect(obj.stageLevel).toBe('Stage 5');
      expect(obj.subjectCode).toBe('MATHEMATICS');
      expect(obj.title).toBeDefined();
      expect(obj.description).toBeDefined();
    });

    it('resolves Cambridge science and english objectives by code', () => {
      const sciObj = resolveCambridgeObjective('5Bp.01');
      expect(sciObj.code).toBe('5Bp.01');
      expect(sciObj.subjectCode).toBe('SCIENCE');

      const engObj = resolveCambridgeObjective('5Ri.01');
      expect(engObj.code).toBe('5Ri.01');
      expect(engObj.stageNumber).toBe(5);
      expect(engObj.subjectCode).toBe('ENGLISH');
    });

    it('fails closed on unknown or invalid curriculum query', () => {
      expect(() => resolveCambridgeObjective('non-existent-xyz-9999')).toThrow(
        /Cannot resolve Cambridge Primary objective/
      );
    });

    it('provides available objectives list for UI selection', () => {
      const mathObjectives = teachingAiService.getAvailableCambridgeObjectives('mathematics', 5);
      expect(mathObjectives.length).toBeGreaterThan(0);
      mathObjectives.forEach((o) => {
        expect(o.stageNumber).toBe(5);
        expect(o.subjectCode).toBe('MATHEMATICS');
      });
    });
  });

  describe('Layer 2 & 4: Lesson Context & Library Search-Before-Generate', () => {
    it('validates required lesson and timetable context', async () => {
      const invalidReq: GenerateDraftRequest = {
        objectiveCode: '5Nn.01',
        lessonContext: {
          schoolId: '',
          teacherId: '',
          className: '',
          subjectId: '',
          subjectName: '',
          teacherName: '',
        },
      };

      await expect(teachingAiService.generateAssignmentDraft(invalidReq)).rejects.toThrow(
        /Valid timetable & lesson context/
      );
    });

    it('searches resource library before generation and matches verified school materials', () => {
      const obj = resolveCambridgeObjective('5Nn.01');
      const matches = searchLibraryBeforeGenerate(obj, 'Fractions & Proportions');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].id).toBe('res-01');
      expect(matches[0].title).toContain('Fractions & Decimals');
      expect(matches[0].relevanceReason).toContain('Exact objective alignment');
    });
  });

  describe('Layer 3: Class Evidence & Scaffolding Adaptation', () => {
    it('embeds scaffolded hints when class evidence indicates student struggle', async () => {
      const requestWithEvidence: GenerateDraftRequest = {
        objectiveCode: '5Nn.01',
        lessonContext: sampleLessonContext,
        evidenceContext: {
          strugglingConcept: 'simplifying improper fractions',
          strugglingStudentCount: 4,
          observations: ['4 students needed assistance with simplified fractions in morning drill.'],
        },
      };

      const draft = await teachingAiService.generateAssignmentDraft(requestWithEvidence);

      expect(draft.instructions).toContain('Scaffolded Support & Hint Box');
      expect(draft.instructions).toContain('tape diagram');
      expect(draft.grounding.classEvidenceSummary).toContain('Scaffolding active');
      expect(draft.grounding.classEvidenceSummary).toContain('4 learners identified');
    });

    it('provides standard pacing when no diagnostic struggle is recorded', async () => {
      const requestClean: GenerateDraftRequest = {
        objectiveCode: '5Nn.01',
        lessonContext: sampleLessonContext,
      };

      const draft = await teachingAiService.generateAssignmentDraft(requestClean);
      expect(draft.instructions).not.toContain('Scaffolded Support & Hint Box');
      expect(draft.grounding.classEvidenceSummary).toBe('Standard cohort pacing. No active diagnostic anomalies recorded.');
    });
  });

  describe('Layer 5 & Human-in-the-Loop Approval Safeguard', () => {
    it('generates strictly structured draft flagged for human approval', async () => {
      const request: GenerateDraftRequest = {
        objectiveCode: '5Nn.01',
        lessonContext: sampleLessonContext,
      };

      const draft = await teachingAiService.generateAssignmentDraft(request);

      // Verify schema compliance
      expect(draft.title).toContain('Stage 5');
      expect(draft.title).toContain('Mathematics');
      expect(draft.instructions).toContain('Part A: Core Concepts');
      expect(draft.instructions).toContain('Part B: Guided Application');
      expect(draft.submissionType).toBe('homework');
      expect(draft.evidenceTrack).toBe('diagnostic_evidence');
      expect(draft.maxScore).toBe(50);
      expect(draft.rubric).toHaveLength(4);

      // Verify strict Human-in-the-Loop flags
      expect(draft.isAiDrafted).toBe(true);
      expect(draft.requiresHumanApproval).toBe(true);
      expect(draft.status).toBe('draft');
      expect(draft.approvalState).toBe('unreviewed');
      expect(draft.approvedBy).toBeUndefined();

      // Verify grounding audit trail
      expect(draft.grounding.curriculumObjective.code).toBe('5Nn.01');
      expect(draft.grounding.lessonContext.className).toBe('Stage 5 Blue');
      expect(draft.grounding.matchedResources.length).toBeGreaterThan(0);
    });

    it('explicitly transitions to approved state when teacher approves', async () => {
      const request: GenerateDraftRequest = {
        objectiveCode: '5Nn.01',
        lessonContext: sampleLessonContext,
      };

      const draft = await teachingAiService.generateAssignmentDraft(request);
      expect(draft.approvalState).toBe('unreviewed');

      const approved = teachingAiService.approveAssignmentDraft(
        draft,
        '99999999-9999-9999-9999-999999999992'
      );

      expect(approved.approvalState).toBe('approved');
      expect(approved.approvedBy).toBe('99999999-9999-9999-9999-999999999992');
      expect(approved.approvedAt).toBeDefined();
    });

    it('rejects approval without a valid teacher ID', async () => {
      const request: GenerateDraftRequest = {
        objectiveCode: '5Nn.01',
        lessonContext: sampleLessonContext,
      };

      const draft = await teachingAiService.generateAssignmentDraft(request);
      expect(() => teachingAiService.approveAssignmentDraft(draft, '')).toThrow(
        /Teacher ID is required/
      );
    });
  });
});
