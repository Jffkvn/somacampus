/**
 * Schema validation contracts for SomaCampus Teaching AI outputs (Phase B).
 *
 * Conventions mirror src/modules/online/onlineAiSchema.ts:
 * deterministic zod validation, strict objects, explicit provenance flags.
 *
 * Canonical source for the teaching-loop AI DTOs. The Supabase Edge function
 * cannot import Vite sources, so a minimal mirror is duplicated at
 * supabase/functions/ai-teaching-assistant/aiSchemas.ts (validated with
 * npm:zod before any Gemini output is returned); key-invariant parity is
 * asserted in src/test/teaching-ai-provider.test.ts.
 *
 * Inviolable Rule: ABSOLUTELY ZERO AI GRADING — observation schemas reject
 * any score/mark/percentage/grade/ranking keys via .strict() plus an explicit
 * refinement that names the offending key.
 */

import { z } from 'zod';

export const FORBIDDEN_GRADING_KEYS = [
  'score',
  'mark',
  'marks',
  'percentage',
  'percent',
  'grade',
  'ranking',
  'rank',
] as const;

// Unified rubric shape (prompt shape): { criteria, maxPoints, guidance }.
// A previous deterministic seam emitted a divergent shape; that shape is
// rejected here so prompt, edge validation, seam, and readers stay unified.
export const RubricCriterionAiSchema = z
  .object({
    criteria: z.string().min(1),
    maxPoints: z.number().positive(),
    guidance: z.string().min(1),
  })
  .strict();

export type RubricCriterionAi = z.infer<typeof RubricCriterionAiSchema>;

export const AssignmentDraftAiSchema = z
  .object({
    title: z.string().min(1),
    instructions: z.string().min(1),
    rubric: z.array(RubricCriterionAiSchema).min(1),
    maxScore: z.number().positive(),
    provider: z.string().optional(),
    // Known Edge governance envelope (optional; anything else is rejected).
    isAiDrafted: z.literal(true).optional(),
    requiresHumanApproval: z.literal(true).optional(),
    status: z.literal('draft').optional(),
    approvalState: z.string().optional(),
  })
  .strict();

export type AssignmentDraftAi = z.infer<typeof AssignmentDraftAiSchema>;

function rejectGradingKeys(obj: Record<string, unknown>, ctx: z.RefinementCtx) {
  for (const key of Object.keys(obj)) {
    if ((FORBIDDEN_GRADING_KEYS as readonly string[]).includes(key.toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Forbidden grading key present: "${key}". AI grading is never permitted.`,
      });
    }
  }
}

// Explicit grading-prose list: score(s)/scored, ranking/ranked, marks,
// percentage/percent/%, grade(d)/grading. Word-boundaried to stay tight
// (e.g. "classroom" or "disagreement" never match), at the accepted cost that
// phrases like "graded evidence" are rejected — any grading language keeps
// the draft out, by design.
const NO_GRADE_TEXT =
  /(%|\bpercent(?:age)?s?\b|\bmarks?\b|\bscores?\b|\bscored\b|\brankings?\b|\branked\b|\bgrades?\b|\bgraded\b|\bgrading\b)/i;

export const ObservationDraftAiSchema = z
  .object({
    observationType: z.enum(['learning_progress', 'misconception']),
    observationText: z
      .string()
      .min(1)
      .refine((t) => !NO_GRADE_TEXT.test(t), {
        message: 'Observation text must not contain scores, percentages, marks, or grades.',
      }),
    suggestedFollowupFocus: z.string().min(1).optional(),
    provider: z.string().optional(),
    // Known Edge governance envelope (optional; anything else is rejected).
    isAiDrafted: z.literal(true).optional(),
    requiresHumanApproval: z.literal(true).optional(),
    isGradingForbidden: z.literal(true).optional(),
  })
  .strict()
  .superRefine(rejectGradingKeys);

export type ObservationDraftAi = z.infer<typeof ObservationDraftAiSchema>;

export const InterventionDraftAiSchema = z
  .object({
    learningArea: z.string().min(1),
    topicName: z.string().min(1),
    reason: z.string().min(1),
    strategyAction: z.string().min(1),
    targetOutcome: z.string().min(1),
    suggestedDurationDays: z.number().int().positive(),
    // Status is forced to draft: anything else is rejected, never coerced.
    status: z.literal('draft'),
    provider: z.string().optional(),
    // Known Edge governance envelope (optional; anything else is rejected).
    studentId: z.string().optional(),
    isAiSuggested: z.literal(true).optional(),
  })
  .strict();

export type InterventionDraftAi = z.infer<typeof InterventionDraftAiSchema>;
