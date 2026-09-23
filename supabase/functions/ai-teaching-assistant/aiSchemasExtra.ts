// AI-2…AI-7 edge schemas (fail closed). Used by ai-teaching-assistant.
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

/** AI-4: mark-sheet suggestions (teacher confirms; never auto-write). */
export const ExtractMarksEdgeSchema = z.object({
  suggestions: z
    .array(
      z.object({
        studentLabel: z.string().min(1),
        score: z.number().nullable().default(null),
        confidence: z.enum(['high', 'low']).default('low'),
        sourceLine: z.string().default(''),
      }),
    )
    .default([]),
});

/** AI-5: evidence-cited analysis (no invented facts). */
export const ExplainResultsEdgeSchema = z.object({
  claims: z
    .array(
      z.object({
        title: z.string().min(1),
        value: z.union([z.string(), z.number()]).nullable().default(null),
        note: z.string().default(''),
        evidence: z
          .array(z.object({ kind: z.string(), id: z.string(), label: z.string() }))
          .default([]),
      }),
    )
    .default([]),
  summary: z.string().default(''),
});

/** AI-6: report comment draft (evidence-cited; teacher edits + Issues). */
export const ReportCommentEdgeSchema = z.object({
  comment: z.string().min(1),
  commentRefs: z
    .array(z.object({ kind: z.string(), id: z.string(), label: z.string() }))
    .default([]),
});

/** AI-7: timetable explain / propose swap (scorecard authoritative). */
export const TimetableExplainEdgeSchema = z.object({
  explanation: z.string().min(1),
  swaps: z
    .array(z.object({ summary: z.string(), scorecardDelta: z.string() }))
    .default([]),
});
