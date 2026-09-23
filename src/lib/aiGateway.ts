/**
 * AI Gateway client (browser → supabase/functions/ai-teaching-assistant).
 * Never holds API keys. Fail closed: caller falls back to deterministic paths.
 */
import { supabase } from './supabase';

export type AiAction =
  | 'generate_assignment'
  | 'extract_work_observation'
  | 'suggest_intervention'
  | 'payroll_run_brief'
  | 'draft_exam_paper'
  | 'extract_marks'
  | 'explain_results';

export async function callAiGateway<T = unknown>(
  action: AiAction,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-teaching-assistant', {
    body: { action, payload },
  });
  if (error) throw new Error(`aiGateway: ${error.message}`);
  if ((data as any)?.error) {
    throw new Error(`aiGateway: ${(data as any).message || (data as any).error}`);
  }
  return data as T;
}

/** AI-2: narrate rule flags only. */
export async function payrollRunBrief(
  flags: Array<{ code: string; employeeName?: string | null; employeeId: string; detail: string }>,
): Promise<{ brief: string; highlights: string[] }> {
  return callAiGateway('payroll_run_brief', { flags });
}

/** AI-3: backend AI drafts paper (teacher still approves). */
export async function draftExamPaper(input: {
  structure: unknown;
  title: string;
  termLabel: string;
  topics: string[];
  instructions?: string | null;
  difficulty?: string | null;
}): Promise<{ paper: Record<string, unknown> }> {
  return callAiGateway('draft_exam_paper', input);
}

/** AI-4: extract marks (tiered confirm required; never auto-write). */
export async function extractMarks(input: {
  sheetText: string;
  rosterNames?: string[];
}): Promise<{
  suggestions: Array<{
    studentLabel: string;
    score: number | null;
    confidence: 'high' | 'low';
    sourceLine?: string;
  }>;
}> {
  return callAiGateway('extract_marks', input);
}

/** AI-5: evidence-cited analysis (claims must carry evidence refs). */
export async function explainResults(input: {
  evidence: Array<{ kind: string; id: string; label: string }>;
  context?: string;
}): Promise<{
  claims: Array<{
    title: string;
    value: string | number | null;
    note: string;
    evidence: Array<{ kind: string; id: string; label: string }>;
  }>;
  summary: string;
}> {
  return callAiGateway('explain_results', input);
}
