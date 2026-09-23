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
  | 'explain_results'
  | 'draft_report_comment'
  | 'timetable_explain'
  | 'regenerate_exam_question';

/** AI-8: every gateway call is audited (who signed this?). */
async function auditAiCall(action: AiAction, payload: Record<string, unknown>): Promise<void> {
  try {
    const inputRefs = Object.values(payload)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((v): v is { id?: string; kind?: string; label?: string; employeeId?: string } => !!v && typeof v === 'object')
      .map((v: any) => ({ kind: v.kind ?? 'input', id: String(v.id ?? v.employeeId ?? ''), label: String(v.label ?? v.detail ?? '') }))
      .filter((r) => r.id);
    await supabase.from('ai_gateway_audit').insert({
      task: action,
      input_refs: inputRefs,
      model: null,
      output_hash: null,
    });
  } catch {
    // audit must never block the teacher
  }
}

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
  void auditAiCall(action, payload);
  return data as T;
}

export async function payrollRunBrief(
  flags: Array<{ code: string; employeeName?: string | null; employeeId: string; detail: string }>,
): Promise<{ brief: string; highlights: string[] }> {
  return callAiGateway('payroll_run_brief', { flags });
}

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

/** AI-6: evidence-cited report/parent comment draft (teacher edits + Issues). */
export async function draftReportComment(input: {
  learnerName: string;
  evidence: Array<{ kind: string; id: string; label: string }>;
  tone?: string;
}): Promise<{ comment: string; commentRefs: Array<{ kind: string; id: string; label: string }> }> {
  return callAiGateway('draft_report_comment', input);
}

/** AI-7: timetable explain / propose swaps (Principal still attests). */
export async function timetableExplain(input: {
  scorecard: unknown;
  constraints?: unknown;
}): Promise<{
  explanation: string;
  swaps: Array<{ summary: string; scorecardDelta: string }>;
}> {
  return callAiGateway('timetable_explain', input);
}

/** Per-question regenerate (teacher edit aid — not a grade). */
export async function regenerateExamQuestion(input: {
  n: number;
  questionText: string;
  topic: string;
  marks: number;
}): Promise<{ question: { n: number; text: string; marks: number; topic: string } }> {
  return callAiGateway('regenerate_exam_question', input);
}
