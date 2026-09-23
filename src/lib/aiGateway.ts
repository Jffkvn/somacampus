/**
 * AI Gateway client (browser → supabase/functions/ai-teaching-assistant).
 * Never holds API keys. Fail closed: caller falls back to deterministic paths.
 */
import { supabase } from '../lib/supabase';

export type AiAction =
  | 'generate_assignment'
  | 'extract_work_observation'
  | 'suggest_intervention'
  | 'payroll_run_brief'
  | 'draft_exam_paper';

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
