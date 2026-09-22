/**
 * P2B-2 / P2B-3 suggestion service — persist recommend-only suggestions.
 * decide() is the only status write (human accept/dismiss).
 */
import { supabase } from '../../lib/supabase';
import type { EvidenceRef } from './analyticsDomain';
import {
  suggestGaps,
  suggestPacing,
  validateDecision,
  type LearningSuggestion,
  type SuggestionKind,
} from './suggestionDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapSuggestion(r: any): LearningSuggestion {
  return {
    id: r.id,
    studentId: r.student_id,
    kind: r.suggestion_kind,
    title: r.title,
    rationale: r.rationale,
    evidenceLinks: Array.isArray(r.evidence_links) ? r.evidence_links : [],
    suggestedActivityId: r.suggested_activity_id ?? null,
    suggestedActivityLabel: r.suggested_activity_label ?? null,
    status: r.status,
    decidedAt: r.decided_at ?? null,
    decisionNote: r.decision_note ?? null,
  };
}

export const suggestionService = {
  async record(input: {
    schoolId: string;
    studentId: string;
    kind: SuggestionKind;
    title: string;
    rationale: string;
    evidenceLinks: EvidenceRef[];
    suggestedActivityId?: string | null;
    suggestedActivityLabel?: string | null;
  }): Promise<LearningSuggestion> {
    if (!input.rationale?.trim()) throw new Error('suggestion.record: rationale is required');
    if (!input.evidenceLinks?.length) {
      throw new Error('suggestion.record: evidenceLinks are required (no uncitable suggestions)');
    }
    if (isMockEnv()) throw new Error('suggestion.record: unavailable without live database');
    const { data, error } = await supabase
      .from('learning_suggestions')
      .insert({
        school_id: input.schoolId,
        student_id: input.studentId,
        suggestion_kind: input.kind,
        title: input.title,
        rationale: input.rationale.trim(),
        evidence_links: input.evidenceLinks,
        suggested_activity_id: input.suggestedActivityId ?? null,
        suggested_activity_label: input.suggestedActivityLabel ?? null,
        status: 'suggested',
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`suggestion.record: ${error?.message ?? 'no row'}`);
    return mapSuggestion(data);
  },

  async listForStudent(studentId: string): Promise<LearningSuggestion[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('learning_suggestions')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`suggestion.listForStudent: ${error.message}`);
    return (data ?? []).map(mapSuggestion);
  },

  /** Human decide — the only way a suggestion leaves `suggested`. */
  async decide(
    suggestionId: string,
    status: 'accepted' | 'dismissed',
    note?: string | null,
  ): Promise<void> {
    validateDecision(status);
    if (isMockEnv()) throw new Error('suggestion.decide: unavailable without live database');
    const { error } = await supabase.rpc('decide_learning_suggestion', {
      p_suggestion_id: suggestionId,
      p_status: status,
      p_note: note ?? null,
    });
    if (error) throw new Error(`suggestion.decide: ${error.message}`);
  },

  /** Pure helpers re-export for UI / tests. */
  suggestGaps,
  suggestPacing,
};
