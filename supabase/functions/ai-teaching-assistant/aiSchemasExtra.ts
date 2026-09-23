// AI-2 / AI-3 edge schemas (fail closed). Used by ai-teaching-assistant.
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/** AI-2: narrate deterministic payroll flags only. */
export const PayrollBriefEdgeSchema = z.object({
  brief: z.string().min(1),
  highlights: z.array(z.string()).default([]),
});

/** AI-3: exam paper draft (teacher must approve). */
export const ExamPaperQuestionEdgeSchema = z.object({
  n: z.number().int().positive(),
  text: z.string().min(1),
  marks: z.number().positive(),
  topic: z.string().min(1),
});

export const ExamPaperSectionEdgeSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  questions: z.array(ExamPaperQuestionEdgeSchema).min(1),
});

export const ExamPaperDraftEdgeSchema = z.object({
  header: z.object({
    title: z.string().min(1),
    termLabel: z.string().min(1),
    timeMinutes: z.number().nullable().default(null),
    totalMarks: z.number().positive(),
    instructions: z.string().nullable().default(null),
    isDraft: z.literal(true),
    origin: z.literal('ai_draft'),
  }),
  sections: z.array(ExamPaperSectionEdgeSchema).min(1),
});
