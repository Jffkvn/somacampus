/**
 * P2B-2 / P2B-3 — gap & pacing suggestions (deterministic, RECOMMEND ONLY).
 * AI never writes grades. Every suggestion carries evidence + rationale.
 * Humans accept or dismiss; nothing auto-assigns.
 */
import type { EvidenceRef } from './analyticsDomain';

export type SuggestionKind = 'gap' | 'pacing' | 'intervention';
export type SuggestionStatus = 'suggested' | 'accepted' | 'dismissed';

export interface LearningSuggestion {
  id: string;
  studentId: string;
  kind: SuggestionKind;
  title: string;
  rationale: string;
  evidenceLinks: EvidenceRef[];
  suggestedActivityId: string | null;
  suggestedActivityLabel: string | null;
  status: SuggestionStatus;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface GapSeed {
  objectiveCode: string;
  objectiveTitle: string | null;
  pct: number;
  evidenceCount: number;
  evidence: EvidenceRef[];
}

export interface PaceSeed {
  expectedSoFar: number;
  completedSoFar: number;
  daysSinceLastWork: number | null;
  evidence: EvidenceRef[];
  deliveryPace: 'term_paced' | 'self_paced' | 'sessional';
}

/** P2B-2: weak objective (pct < threshold, ≥ minEvidence) → gap suggestion. */
export function suggestGaps(
  gaps: GapSeed[],
  opts: { thresholdPct?: number; minEvidence?: number } = {},
): Array<Pick<LearningSuggestion, 'kind' | 'title' | 'rationale' | 'evidenceLinks'>> {
  const thresholdPct = opts.thresholdPct ?? 60;
  const minEvidence = opts.minEvidence ?? 2;
  return gaps
    .filter((g) => g.pct < thresholdPct && g.evidenceCount >= minEvidence)
    .map((g) => ({
      kind: 'gap' as const,
      title: `Gap · ${g.objectiveTitle ?? g.objectiveCode}`,
      rationale: `Recent evidence averages ${g.pct}% on ${g.objectiveTitle ?? g.objectiveCode} across ${g.evidenceCount} scored items. Suggest targeted practice — human decides.`,
      evidenceLinks: g.evidence,
    }));
}

/** P2B-3: term_paced lag (≥2 pieces) or idle ≥ 10 days → pacing suggestion. */
export function suggestPacing(
  pace: PaceSeed,
  opts: { lagThreshold?: number; idleDays?: number } = {},
): Array<Pick<LearningSuggestion, 'kind' | 'title' | 'rationale' | 'evidenceLinks'>> {
  const lagThreshold = opts.lagThreshold ?? 2;
  const idleDays = opts.idleDays ?? 10;
  const out: Array<Pick<LearningSuggestion, 'kind' | 'title' | 'rationale' | 'evidenceLinks'>> = [];

  if (pace.deliveryPace === 'term_paced' && pace.expectedSoFar - pace.completedSoFar >= lagThreshold) {
    out.push({
      kind: 'pacing',
      title: 'Behind term pace',
      rationale: `${pace.completedSoFar} of ${pace.expectedSoFar} expected items scored (term_paced). Suggest a catch-up plan — human decides.`,
      evidenceLinks: pace.evidence,
    });
  }
  if (pace.daysSinceLastWork != null && pace.daysSinceLastWork >= idleDays) {
    out.push({
      kind: 'pacing',
      title: `No work for ${pace.daysSinceLastWork} days`,
      rationale: `Idle ${pace.daysSinceLastWork} days since last scored work. Suggest a check-in — human decides.`,
      evidenceLinks: pace.evidence,
    });
  }
  return out;
}

export function validateDecision(status: string): asserts status is 'accepted' | 'dismissed' {
  if (status !== 'accepted' && status !== 'dismissed') {
    throw new Error('suggestion: status must be accepted or dismissed');
  }
}
