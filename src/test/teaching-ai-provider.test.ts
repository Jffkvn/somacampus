import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}));

import {
  resolveProviderConfig,
  HttpError as ProviderHttpError,
} from '../../supabase/functions/ai-teaching-assistant/provider';
import {
  AssignmentDraftAiSchema,
  ObservationDraftAiSchema,
  InterventionDraftAiSchema,
  FORBIDDEN_GRADING_KEYS,
} from '../modules/teaching/teachingAiSchema';
import {
  teachingAiService,
  AiServiceError,
  __setTeachingAiTestSeamOverride,
} from '../modules/teaching/teachingAiService';

/**
 * Phase B — AI provider integrity + schemas + honesty.
 * RED-first contract tests: provider seam, zod schemas, edge mirror parity,
 * and client throw-in-prod / synthetic-in-test behaviour.
 */

describe('Phase B: Edge provider seam (pure provider module)', () => {
  it('defaults to gemini when AI_PROVIDER is unset', () => {
    const cfg = resolveProviderConfig({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' });
    expect(cfg.provider).toBe('gemini');
    expect(cfg.apiKey).toBe('k');
    expect(cfg.model).toBe('m');
  });

  it('missing GEMINI_API_KEY -> HTTP 503 AI_PROVIDER_UNCONFIGURED', () => {
    const err = (() => {
      try {
        resolveProviderConfig({ GEMINI_MODEL: 'm' });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect((err as any).status).toBe(503);
    expect((err as any).code).toBe('AI_PROVIDER_UNCONFIGURED');
  });

  it('missing GEMINI_MODEL -> clear error naming GEMINI_MODEL (no silent default)', () => {
    const err = (() => {
      try {
        resolveProviderConfig({ GEMINI_API_KEY: 'k' });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect((err as any).message).toMatch(/GEMINI_MODEL/);
  });

  it('unsupported AI_PROVIDER value -> 500 (interface extensible, no new providers)', () => {
    const err = (() => {
      try {
        resolveProviderConfig({ AI_PROVIDER: 'other', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect((err as any).status).toBe(500);
  });
});

describe('Phase B: teaching AI output schemas', () => {
  const validRubric = [{ criteria: 'Conceptual Accuracy', maxPoints: 20, guidance: 'Shows understanding.' }];

  it('accepts the unified prompt shape (criteria/maxPoints/guidance)', () => {
    const res = AssignmentDraftAiSchema.safeParse({
      title: 'T',
      instructions: 'I',
      rubric: validRubric,
      maxScore: 50,
    });
    expect(res.success).toBe(true);
  });

  it('rejects the divergent legacy rubric shape (criterion/points/descriptors)', () => {
    const res = AssignmentDraftAiSchema.safeParse({
      title: 'T',
      instructions: 'I',
      rubric: [{ criterion: 'X', points: 20, descriptors: 'Y' }],
      maxScore: 50,
    });
    expect(res.success).toBe(false);
  });

  it('rejects observation drafts carrying grading keys', () => {
    expect(FORBIDDEN_GRADING_KEYS).toEqual(
      expect.arrayContaining(['score', 'mark', 'percentage', 'grade', 'ranking'])
    );
    for (const key of ['score', 'mark', 'percentage', 'grade', 'ranking']) {
      const res = ObservationDraftAiSchema.safeParse({
        observationType: 'misconception',
        observationText: 'friction with unlike denominators',
        [key]: 5,
      });
      expect(res.success, `expected rejection when key "${key}" present`).toBe(false);
    }
  });

  it('rejects malformed observation drafts', () => {
    expect(
      ObservationDraftAiSchema.safeParse({ observationType: 'misconception' }).success
    ).toBe(false);
    expect(
      ObservationDraftAiSchema.safeParse({
        observationType: 'graded_score',
        observationText: 'x',
      }).success
    ).toBe(false);
  });

  it('forces intervention status to draft', () => {
    const base = {
      learningArea: 'Mathematics',
      topicName: 'Fractions',
      reason: 'r',
      strategyAction: 'a',
      targetOutcome: 'o',
      suggestedDurationDays: 14,
      status: 'active',
    };
    expect(InterventionDraftAiSchema.safeParse(base).success).toBe(false);
    expect(InterventionDraftAiSchema.safeParse({ ...base, status: 'draft' }).success).toBe(true);
  });

  it('status-less intervention payload validates to draft', () => {
    const { status, ...withoutStatus } = {
      learningArea: 'Mathematics',
      topicName: 'Fractions',
      reason: 'r',
      strategyAction: 'a',
      targetOutcome: 'o',
      suggestedDurationDays: 14,
      status: 'draft' as const,
    };
    void status;
    const res = InterventionDraftAiSchema.safeParse(withoutStatus);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.status).toBe('draft');
  });

  it('accepts valid model output echoing the known governance envelope', () => {
    // Assignment: full Edge-decorated shape passes strict validation.
    expect(
      AssignmentDraftAiSchema.safeParse({
        title: 'T',
        instructions: 'I',
        rubric: [{ criteria: 'Conceptual Accuracy', maxPoints: 20, guidance: 'Shows understanding.' }],
        maxScore: 50,
        provider: 'gemini',
        isAiDrafted: true,
        requiresHumanApproval: true,
        status: 'draft',
        approvalState: 'unreviewed',
      }).success
    ).toBe(true);
    // Observation: envelope echo passes; unknown keys still rejected.
    expect(
      ObservationDraftAiSchema.safeParse({
        observationType: 'misconception',
        observationText: 'friction with unlike denominators',
        suggestedFollowupFocus: 'retrieval',
        provider: 'gemini',
        isAiDrafted: true,
        requiresHumanApproval: true,
        isGradingForbidden: true,
      }).success
    ).toBe(true);
    expect(
      ObservationDraftAiSchema.safeParse({
        observationType: 'misconception',
        observationText: 'friction with unlike denominators',
        someUnknownField: 1,
      }).success
    ).toBe(false);
    // Intervention: Edge-decorated shape (status draft + envelope) passes.
    expect(
      InterventionDraftAiSchema.safeParse({
        learningArea: 'Mathematics',
        topicName: 'Fractions',
        reason: 'r',
        strategyAction: 'a',
        targetOutcome: 'o',
        suggestedDurationDays: 14,
        status: 'draft',
        provider: 'gemini',
        studentId: 's-1',
        isAiSuggested: true,
      }).success
    ).toBe(true);
  });

  it('rejects grading prose and accepts legitimate qualitative text', () => {
    const base = { observationType: 'misconception' as const };
    const rejects = [
      'learner score 5 in fractions',
      'scored 8 out of 10',
      'low class ranking overall',
      'ranked second in the stream',
      'lost too many marks',
      'finished with 75% correct',
      '82 percent accuracy',
      'a high percentage of errors',
      'deserves grade B',
      'final grade posted on Friday',
      'earned grade 85 on the test',
      'graded 7/10 for presentation',
      'grading scale shared with parents',
      'per the new grading system',
    ];
    for (const observationText of rejects) {
      expect(
        ObservationDraftAiSchema.safeParse({ ...base, observationText }).success,
        `expected rejection of "${observationText}"`
      ).toBe(false);
    }
    const accepts = [
      'Learner showed friction converting unlike denominators.',
      'Drew clear tape diagrams showing equivalent values.',
      'Successfully demonstrated skill for 5Nn.01 with clear mathematical notation.',
      'Needs guided retrieval on common denominators before extension problems.',
      'Stage 5 pupil working at Grade 5 expectations.',
      'Completed grade-level work with tape diagrams.',
      'Used graded readers for fluency practice.',
      'Graded evidence filed in the learner portfolio.',
    ];
    for (const observationText of accepts) {
      expect(
        ObservationDraftAiSchema.safeParse({ ...base, observationText }).success,
        `expected acceptance of "${observationText}"`
      ).toBe(true);
    }
  });
});

describe('Phase B: Edge schema mirror parity (text-level invariant check)', () => {
  const edgeMirror = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/ai-teaching-assistant/aiSchemas.ts'),
    'utf8'
  );

  it('edge mirror validates via npm:zod and notes the client mirror', () => {
    expect(edgeMirror).toContain('npm:zod');
    expect(edgeMirror).toContain('teachingAiSchema.ts');
  });

  it('edge mirror enforces the same forbidden grading keys', () => {
    for (const key of FORBIDDEN_GRADING_KEYS) {
      expect(edgeMirror, `edge mirror must forbid "${key}"`).toContain(`'${key}'`);
    }
    expect(edgeMirror).toContain('.strict()');
  });

  it('edge mirror unifies on the prompt rubric shape', () => {
    expect(edgeMirror).toContain('criteria');
    expect(edgeMirror).toContain('maxPoints');
    expect(edgeMirror).toContain('guidance');
    expect(edgeMirror).not.toContain('criterion');
  });

  it('edge mirror passes through the known governance envelope (strictness parity)', () => {
    for (const token of [
      'provider',
      'isAiDrafted',
      'requiresHumanApproval',
      'isGradingForbidden',
      'isAiSuggested',
      'approvalState',
      'studentId',
      'status',
    ]) {
      expect(edgeMirror, `edge mirror must passthrough "${token}"`).toContain(token);
    }
  });

  it('edge mirror enforces the same grade-text guard', () => {
    for (const token of ['scored', 'ranked', 'graded', 'grading', 'percentage', 'percent']) {
      expect(edgeMirror, `edge mirror must guard "${token}"`).toContain(token);
    }
  });

  it('edge mirror defaults a missing intervention status to draft', () => {
    expect(edgeMirror).toContain('z.literal("draft").default("draft")');
  });
});

describe('Phase B: client fallback behaviour (throw in prod, synthetic in test)', () => {
  const lessonContext = {
    schoolId: '22222222-2222-2222-2222-222222222222',
    classId: '55555555-5555-5555-5555-555555555551',
    className: 'Stage 5 Blue',
    subjectId: '77777777-7777-7777-7777-777777777771',
    subjectName: 'Mathematics',
    teacherId: '99999999-9999-9999-9999-999999999992',
    teacherName: 'Mr. David Musoke',
  };

  beforeEach(() => {
    mockInvoke.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __setTeachingAiTestSeamOverride(null);
    vi.clearAllMocks();
  });

  it('prod bundle: test-seam override is ignored (synthetic can never be re-enabled)', async () => {
    vi.stubEnv('MODE', 'production');
    // Even an explicit opt-in is a no-op outside test mode.
    __setTeachingAiTestSeamOverride(true);
    mockInvoke.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(
      teachingAiService.generateAssignmentDraft({ objectiveCode: '5Nn.01', lessonContext })
    ).rejects.toBeInstanceOf(AiServiceError);
  });

  it('prod mode: functions.invoke error -> throws AiServiceError (no silent synthetic)', async () => {
    __setTeachingAiTestSeamOverride(false);
    mockInvoke.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(
      teachingAiService.generateAssignmentDraft({ objectiveCode: '5Nn.01', lessonContext })
    ).rejects.toBeInstanceOf(AiServiceError);
  });

  it('prod mode: non-OK / malformed edge payload -> throws AiServiceError with action context', async () => {
    __setTeachingAiTestSeamOverride(false);
    mockInvoke.mockResolvedValue({ data: { bogus: true }, error: null });
    const err = await teachingAiService
      .extractObservationDraftFromWork({
        assignmentTitle: 'T',
        objectiveCode: '5Nn.01',
        objectiveDescription: 'd',
        workType: 'notebook',
        workSummary: 'student struggled with unlike denominators',
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AiServiceError);
    expect((err as AiServiceError).action).toBe('extract_work_observation');
    expect((err as AiServiceError).provider).toBeTruthy();
  });

  it('test mode: invoke failure -> deterministic synthetic labelled provider synthetic-test', async () => {
    __setTeachingAiTestSeamOverride(true);
    mockInvoke.mockResolvedValue({ data: null, error: new Error('boom') });
    const draft = await teachingAiService.generateAssignmentDraft({
      objectiveCode: '5Nn.01',
      lessonContext,
    });
    expect((draft as any).provider).toBe('synthetic-test');
    expect(draft.rubric[0]).toHaveProperty('criteria');
    expect(draft.rubric[0]).toHaveProperty('maxPoints');
    expect(draft.rubric[0]).toHaveProperty('guidance');
  });

  it('test mode: observation + intervention synthetics are labelled too', async () => {
    __setTeachingAiTestSeamOverride(true);
    mockInvoke.mockResolvedValue({ data: null, error: new Error('boom') });
    const obs = await teachingAiService.extractObservationDraftFromWork({
      assignmentTitle: 'T',
      objectiveCode: '5Nn.01',
      objectiveDescription: 'd',
      workType: 'notebook',
      workSummary: 'student struggled',
    });
    expect((obs as any).provider).toBe('synthetic-test');
    const iv = await teachingAiService.suggestInterventionFromEvidence({
      studentId: 's-1',
      curriculumObjective: '5Nn.01',
      approvedObservationSnippets: ['friction'],
    });
    expect((iv as any).provider).toBe('synthetic-test');
    expect(iv.status).toBe('draft');
  });
});
