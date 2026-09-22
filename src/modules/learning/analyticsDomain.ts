/**
 * P2B-1 evidence-cited analytics (pure).
 * Rule: every claim names the rows. If uncitable → "Not enough evidence."
 * No vanity metrics. No AI scores. Progress ≠ completion.
 */

export interface EvidenceRef {
  kind: 'learning_result' | 'learning_submission' | 'learning_activity' | 'quiz_attempt';
  id: string;
  label: string;
  at?: string | null;
}

export interface AnalyticsClaim {
  key: string;
  title: string;
  /** Display value; null means we refuse to guess. */
  value: string | number | null;
  unit?: string;
  evidence: EvidenceRef[];
  /** Always set when evidence is short. */
  note?: string;
}

export interface StudentAnalytics {
  studentId: string;
  claims: AnalyticsClaim[];
  /** Objective-level pct with evidence counts (from rollup-style input). */
  objectives: Array<{
    objectiveCode: string;
    objectiveTitle: string | null;
    pct: number | null;
    evidenceCount: number;
    evidence: EvidenceRef[];
  }>;
}

export const NOT_ENOUGH = 'Not enough evidence';

export function claimOrNotEnough(
  key: string,
  title: string,
  value: string | number | null,
  evidence: EvidenceRef[],
  minEvidence = 1,
): AnalyticsClaim {
  if (evidence.length < minEvidence || value == null) {
    return {
      key,
      title,
      value: null,
      evidence,
      note: NOT_ENOUGH,
    };
  }
  return { key, title, value, evidence };
}

export function completionClaim(evidence: { scored: EvidenceRef[]; expected: number }): AnalyticsClaim {
  if (evidence.expected <= 0 || evidence.scored.length === 0) {
    return claimOrNotEnough('completion', 'Scored work', null, evidence.scored);
  }
  const pct = Math.round((evidence.scored.length / evidence.expected) * 100);
  return claimOrNotEnough('completion', 'Scored work (Progress ≠ completion)', `${pct}%`, evidence.scored);
}

export function averageScoreClaim(
  rows: Array<{ score: number; maxScore: number; ref: EvidenceRef }>,
): AnalyticsClaim {
  const usable = rows.filter((r) => r.maxScore > 0);
  if (usable.length < 2) {
    return claimOrNotEnough(
      'avg',
      'Average score',
      null,
      usable.map((r) => r.ref),
      2,
    );
  }
  const sumScore = usable.reduce((a, r) => a + r.score, 0);
  const sumMax = usable.reduce((a, r) => a + r.maxScore, 0);
  const pct = sumMax > 0 ? Math.round((sumScore / sumMax) * 1000) / 10 : null;
  return claimOrNotEnough('avg', 'Average score', pct == null ? null : `${pct}%`, usable.map((r) => r.ref), 2);
}

export function weakObjectiveClaims(
  objectives: StudentAnalytics['objectives'],
  thresholdPct = 60,
  minEvidence = 2,
): AnalyticsClaim[] {
  return objectives
    .filter((o) => o.pct != null && o.evidenceCount >= minEvidence && o.pct < thresholdPct)
    .map((o) =>
      claimOrNotEnough(
        `obj-${o.objectiveCode}`,
        `Struggling · ${o.objectiveTitle ?? o.objectiveCode}`,
        `${o.pct}%`,
        o.evidence,
        minEvidence,
      ),
    );
}

export function buildStudentAnalytics(input: {
  studentId: string;
  expectedCount: number;
  resultRows: Array<{
    id: string;
    score: number | null;
    maxScore: number | null;
    label: string;
    at?: string | null;
  }>;
  objectives: StudentAnalytics['objectives'];
}): StudentAnalytics {
  const scoredRefs: EvidenceRef[] = input.resultRows
    .filter((r) => r.score != null)
    .map((r) => ({
      kind: 'learning_result' as const,
      id: r.id,
      label: r.label,
      at: r.at ?? null,
    }));

  const scoreRows = input.resultRows
    .filter((r): r is typeof r & { score: number; maxScore: number } => r.score != null && r.maxScore != null)
    .map((r) => ({
      score: r.score,
      maxScore: r.maxScore,
      ref: { kind: 'learning_result' as const, id: r.id, label: r.label, at: r.at ?? null },
    }));

  const claims: AnalyticsClaim[] = [
    completionClaim({ scored: scoredRefs, expected: input.expectedCount }),
    averageScoreClaim(scoreRows),
    ...weakObjectiveClaims(input.objectives),
  ];

  return {
    studentId: input.studentId,
    claims,
    objectives: input.objectives,
  };
}
