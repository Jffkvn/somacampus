/**
 * P2A-4 assessment packs + objective rollup (pure).
 * Chain: Student → Subject → Curriculum → Objectives → Evidence → Result.
 * Rollup is deterministic from scored evidence only — no AI mastery.
 */

export type PackKind =
  | 'baseline'
  | 'diagnostic'
  | 'unit'
  | 'midterm'
  | 'end_of_term'
  | 'project'
  | 'practical'
  | 'oral';

export interface ObjectiveMapEntry {
  objectiveCode: string;
  objectiveTitle?: string | null;
}

export interface PackItemSummary {
  id: string;
  itemTitle: string;
  quizId: string | null;
  learningActivityId: string | null;
  objectiveMap: ObjectiveMapEntry[];
  weight: number;
}

export interface ObjectiveRollupRow {
  objectiveCode: string;
  objectiveTitle: string | null;
  evidenceCount: number;
  scoreSum: number;
  maxSum: number;
  pct: number | null;
  itemIds: string[];
}

export interface PackProgress {
  packId: string;
  packKind: PackKind;
  title: string;
  items: PackItemSummary[];
  /** item id → score/max if the learner has a result */
  resultsByItem: Record<string, { score: number | null; maxScore: number | null; source: string }>;
  objectives: ObjectiveRollupRow[];
  completionPct: number;
}

export function pctOf(score: number, max: number): number | null {
  if (max <= 0) return null;
  return Math.round((score / max) * 1000) / 10;
}

/**
 * Deterministic objective rollup across pack items.
 * Weight scales score/max equally so pct is unchanged (weight affects pack total only).
 */
export function rollupObjectives(
  items: PackItemSummary[],
  resultsByItem: PackProgress['resultsByItem'],
): ObjectiveRollupRow[] {
  const acc = new Map<string, ObjectiveRollupRow>();

  for (const item of items) {
    const result = resultsByItem[item.id];
    if (!result || result.score == null || result.maxScore == null) continue;
    const weight = Number(item.weight) > 0 ? Number(item.weight) : 1;
    for (const om of item.objectiveMap) {
      const code = String(om.objectiveCode);
      const prev =
        acc.get(code) ??
        ({
          objectiveCode: code,
          objectiveTitle: om.objectiveTitle ?? null,
          evidenceCount: 0,
          scoreSum: 0,
          maxSum: 0,
          pct: null,
          itemIds: [],
        } as ObjectiveRollupRow);
      prev.evidenceCount += 1;
      prev.scoreSum += Number(result.score) * weight;
      prev.maxSum += Number(result.maxScore) * weight;
      prev.itemIds.push(item.id);
      if (!prev.objectiveTitle && om.objectiveTitle) prev.objectiveTitle = om.objectiveTitle;
      acc.set(code, prev);
    }
  }

  return [...acc.values()]
    .map((r) => ({ ...r, pct: pctOf(r.scoreSum, r.maxSum) }))
    .sort((a, b) => a.objectiveCode.localeCompare(b.objectiveCode));
}

/** Weighted pack total (sum score*weight / sum max*weight) — deterministic. */
export function packWeightedTotal(
  items: PackItemSummary[],
  resultsByItem: PackProgress['resultsByItem'],
): { score: number; maxScore: number; pct: number | null } {
  let score = 0;
  let maxScore = 0;
  for (const item of items) {
    const result = resultsByItem[item.id];
    if (!result || result.score == null || result.maxScore == null) continue;
    const weight = Number(item.weight) > 0 ? Number(item.weight) : 1;
    score += Number(result.score) * weight;
    maxScore += Number(result.maxScore) * weight;
  }
  return { score, maxScore, pct: pctOf(score, maxScore) };
}

export function buildPackProgress(input: {
  packId: string;
  packKind: PackKind;
  title: string;
  items: PackItemSummary[];
  resultsByItem: PackProgress['resultsByItem'];
}): PackProgress {
  const scored = input.items.filter((i) => {
    const r = input.resultsByItem[i.id];
    return r && r.score != null;
  }).length;
  const completionPct =
    input.items.length === 0 ? 0 : Math.round((scored / input.items.length) * 100);
  return {
    packId: input.packId,
    packKind: input.packKind,
    title: input.title,
    items: input.items,
    resultsByItem: input.resultsByItem,
    objectives: rollupObjectives(input.items, input.resultsByItem),
    completionPct,
  };
}

export function validatePackInput(input: {
  title: string;
  packKind: PackKind;
  teachingSequenceId?: string | null;
  onlineOfferingId?: string | null;
  items: Array<{ itemTitle: string; quizId?: string | null; learningActivityId?: string | null }>;
}): void {
  if (!input.title?.trim()) throw new Error('assessmentPack: title is required');
  if (!input.teachingSequenceId && !input.onlineOfferingId) {
    throw new Error('assessmentPack: teachingSequenceId or onlineOfferingId is required');
  }
  if (!input.items?.length) throw new Error('assessmentPack: at least one item is required');
  for (const it of input.items) {
    if (!it.itemTitle?.trim()) throw new Error('assessmentPack: item title is required');
    if (!it.quizId && !it.learningActivityId) {
      throw new Error('assessmentPack: each item needs a quiz or learning activity');
    }
  }
}
