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

export const ObservationDraftEdgeSchema = z
  .object({
    observationType: z.enum(["learning_progress", "misconception"]),
    observationText: z.string().min(1),
    suggestedFollowupFocus: z.string().min(1).optional(),
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
  })
  .strict();
