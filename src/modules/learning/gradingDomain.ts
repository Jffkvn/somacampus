/**
 * P3-A grading & results math (pure).
 * School-configurable scale + formula. Never hard-code one national system
 * as the only path — UG aggregate/division is a preset, not the law.
 */

export type ResultFormula = 'mean' | 'total' | 'aggregate_division';

export interface GradeBand {
  /** Inclusive pct range [minPct, maxPct] */
  minPct: number;
  maxPct: number;
  grade: string;
  /** Aggregate points (UG-style: lower is better). */
  points: number;
}

export interface GradingScale {
  id: string;
  schoolId: string;
  name: string;
  formula: ResultFormula;
  bands: GradeBand[];
  /** Optional subject weights (default 1). */
  subjectWeights?: Record<string, number>;
  /** aggregate_division only: classification labels by aggregate score. */
  divisions?: Array<{ maxAggregate: number; label: string }>;
  rounding?: 'whole' | 'one_decimal';
}

export interface SubjectMark {
  subjectCode: string;
  subjectName: string;
  score: number;
  maxScore: number;
  weight?: number;
}

export interface SubjectResult {
  subjectCode: string;
  subjectName: string;
  score: number;
  maxScore: number;
  pct: number;
  grade: string | null;
  points: number | null;
}

export interface TermOverall {
  formula: ResultFormula;
  /** mean → % · total → raw sum · aggregate_division → aggregate */
  value: number | null;
  label: string | null;
  division: string | null;
  subjects: SubjectResult[];
}

export function roundPct(value: number, mode: 'whole' | 'one_decimal' = 'whole'): number {
  const f = mode === 'one_decimal' ? 10 : 1;
  return Math.round(value * f) / f;
}

export function pctOf(score: number, maxScore: number): number | null {
  if (maxScore <= 0) return null;
  return (score / maxScore) * 100;
}

export function gradeFor(scale: GradingScale, pct: number): GradeBand | null {
  const p = roundPct(pct, scale.rounding ?? 'whole');
  return scale.bands.find((b) => p >= b.minPct && p <= b.maxPct) ?? null;
}

export function divisionFor(
  scale: GradingScale,
  aggregate: number,
): string | null {
  if (!scale.divisions?.length) return null;
  // Prefer school-ordered rules: first match wins (lower bounds are better in UG).
  const hit = scale.divisions.find((d) => aggregate <= d.maxAggregate);
  return hit?.label ?? scale.divisions[scale.divisions.length - 1]?.label ?? null;
}

/** Weighted mean of subject percentages. */
export function computeMean(scale: GradingScale, marks: SubjectMark[]): number | null {
  const usable = marks.filter((m) => pctOf(m.score, m.maxScore) != null);
  if (!usable.length) return null;
  let wSum = 0;
  let acc = 0;
  for (const m of usable) {
    const w = m.weight ?? scale.subjectWeights?.[m.subjectCode] ?? 1;
    const pct = pctOf(m.score, m.maxScore)!;
    acc += pct * w;
    wSum += w;
  }
  if (wSum <= 0) return null;
  return roundPct(acc / wSum, scale.rounding ?? 'whole');
}

/** Raw sum of scores (school total style). */
export function computeTotal(marks: SubjectMark[]): number | null {
  if (!marks.length) return null;
  return marks.reduce((a, m) => a + (Number.isFinite(m.score) ? m.score : 0), 0);
}

/** Aggregate = sum of band points (weighted). Lower is typically better (UG). */
export function computeAggregate(scale: GradingScale, marks: SubjectMark[]): number | null {
  const usable = marks.filter((m) => pctOf(m.score, m.maxScore) != null);
  if (!usable.length) return null;
  let agg = 0;
  for (const m of usable) {
    const band = gradeFor(scale, pctOf(m.score, m.maxScore)!);
    const w = m.weight ?? scale.subjectWeights?.[m.subjectCode] ?? 1;
    agg += (band?.points ?? 0) * w;
  }
  return Math.round(agg * 100) / 100;
}

export function buildSubjectResults(
  scale: GradingScale,
  marks: SubjectMark[],
): SubjectResult[] {
  return marks.map((m) => {
    const pctRaw = pctOf(m.score, m.maxScore);
    const pct = pctRaw == null ? 0 : roundPct(pctRaw, scale.rounding ?? 'whole');
    const band = pctRaw == null ? null : gradeFor(scale, pctRaw);
    return {
      subjectCode: m.subjectCode,
      subjectName: m.subjectName,
      score: m.score,
      maxScore: m.maxScore,
      pct,
      grade: band?.grade ?? null,
      points: band?.points ?? null,
    };
  });
}

export function buildTermOverall(scale: GradingScale, marks: SubjectMark[]): TermOverall {
  const subjects = buildSubjectResults(scale, marks);
  if (scale.formula === 'mean') {
    const mean = computeMean(scale, marks);
    return {
      formula: 'mean',
      value: mean,
      label: mean == null ? null : `${mean}%`,
      division: null,
      subjects,
    };
  }
  if (scale.formula === 'total') {
    const total = computeTotal(marks);
    return {
      formula: 'total',
      value: total,
      label: total == null ? null : `${total}`,
      division: null,
      subjects,
    };
  }
  const aggregate = computeAggregate(scale, marks);
  const division = aggregate == null ? null : divisionFor(scale, aggregate);
  return {
    formula: 'aggregate_division',
    value: aggregate,
    label: aggregate == null ? null : `Aggregate ${aggregate}`,
    division,
    subjects,
  };
}

/** Sensible default bands (schools override). Not a national hard-code. */
export const DEFAULT_BANDS: GradeBand[] = [
  { minPct: 80, maxPct: 100, grade: 'A', points: 1 },
  { minPct: 70, maxPct: 79, grade: 'B', points: 2 },
  { minPct: 60, maxPct: 69, grade: 'C', points: 3 },
  { minPct: 50, maxPct: 59, grade: 'D', points: 4 },
  { minPct: 0, maxPct: 49, grade: 'E', points: 5 },
];

export const UG_DIVISION_PRESET: Array<{ maxAggregate: number; label: string }> = [
  { maxAggregate: 4, label: 'Division 1' },
  { maxAggregate: 9, label: 'Division 2' },
  { maxAggregate: 14, label: 'Division 3' },
  { maxAggregate: 20, label: 'Division 4' },
  { maxAggregate: 999, label: 'Ungraded' },
];

export function validateScale(scale: Pick<GradingScale, 'bands' | 'formula'>): void {
  if (!scale.bands?.length) throw new Error('grading: bands are required');
  for (const b of scale.bands) {
    if (b.minPct > b.maxPct) throw new Error('grading: band minPct > maxPct');
  }
  if (!['mean', 'total', 'aggregate_division'].includes(scale.formula)) {
    throw new Error('grading: unknown formula');
  }
}
