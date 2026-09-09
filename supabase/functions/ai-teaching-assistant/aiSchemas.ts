// Phase B: Edge-side mirror of src/modules/teaching/teachingAiSchema.ts.
//
// The Edge function cannot import Vite client sources, so the minimal output
// contracts are DUPLICATED here with npm:zod and validated BEFORE any Gemini
// output is returned. Any change to the canonical client schema must be
// reflected here (and vice versa); parity of the key invariants is asserted by
// src/test/teaching-ai-provider.test.ts ("Edge schema mirror parity").
//
// Unified rubric shape (prompt shape): { criteria, maxPoints, guidance }.
// The legacy divergent shape is intentionally NOT accepted here.

import { z } from "npm:zod";

export const FORBIDDEN_GRADING_KEYS_EDGE = [
  'score',
  'mark',
  'marks',
  'percentage',
  'percent',
  'grade',
  'ranking',
  'rank',
] as const;

export const RubricCriterionEdgeSchema = z
  .object({
    criteria: z.string().min(1),
    maxPoints: z.number().positive(),
    guidance: z.string().min(1),
  })
  .strict();

export const AssignmentDraftEdgeSchema = z
  .object({
    title: z.string().min(1),
    instructions: z.string().min(1),
    rubric: z.array(RubricCriterionEdgeSchema).min(1),
    maxScore: z.number().positive(),
    // Known governance envelope passthroughs (optional): model outputs that
    // echo these fields must still validate; anything else is rejected.
    provider: z.string().optional(),
    isAiDrafted: z.literal(true).optional(),
    requiresHumanApproval: z.literal(true).optional(),
    status: z.literal("draft").optional(),
    approvalState: z.string().optional(),
  })
  .strict();

const gradingKeyRefinement = (obj: Record<string, unknown>, ctx: z.RefinementCtx) => {
  for (const key of Object.keys(obj)) {
    if ((FORBIDDEN_GRADING_KEYS_EDGE as readonly string[]).includes(key.toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Forbidden grading key present: "${key}". AI grading is never permitted.`,
      });
    }
  }
};

const NO_GRADE_TEXT_EDGE =
  /(%|\bpercent(?:age)?s?\b|\bmarks?\b|\bscores?\b|\bscored\b|\brankings?\b|\branked\b|\bgrades?\b|\bgraded\b|\bgrading\b)/i;

export const ObservationDraftEdgeSchema = z
  .object({
    observationType: z.enum(["learning_progress", "misconception"]),
    observationText: z
      .string()
      .min(1)
      .refine((t) => !NO_GRADE_TEXT_EDGE.test(t), {
        message: "Observation text must not contain scores, percentages, marks, or grades.",
      }),
    suggestedFollowupFocus: z.string().min(1).optional(),
    // Known governance envelope passthroughs (optional): model outputs that
    // echo these fields must still validate; anything else is rejected.
    provider: z.string().optional(),
    isAiDrafted: z.literal(true).optional(),
    requiresHumanApproval: z.literal(true).optional(),
    isGradingForbidden: z.literal(true).optional(),
  })
  .strict()
  .superRefine(gradingKeyRefinement);

export const InterventionDraftEdgeSchema = z
  .object({
    learningArea: z.string().min(1),
    topicName: z.string().min(1),
    reason: z.string().min(1),
    strategyAction: z.string().min(1),
    targetOutcome: z.string().min(1),
    suggestedDurationDays: z.number().int().positive(),
    // Status is forced to draft when present (the prompt does not request it,
    // but model outputs that echo status:'draft' must still validate).
    // Anything else is rejected, never coerced.
    status: z.literal("draft").optional(),
    // Known governance envelope passthroughs (optional).
    provider: z.string().optional(),
    studentId: z.string().optional(),
    isAiSuggested: z.literal(true).optional(),
  })
  .strict();
