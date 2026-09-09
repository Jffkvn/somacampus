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
    __setTeachingAiTestSeamOverride(null);
    vi.clearAllMocks();
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
