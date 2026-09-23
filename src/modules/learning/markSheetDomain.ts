/**
 * P3-E / AI-4 mark-sheet assist (pure). SUGGEST ONLY — teacher confirms.
 * Never writes learning_results without explicit confirm.
 * Tiered: high confidence may bulk-confirm; low MUST be hand-edited.
 */

export interface SuggestedMark {
  studentLabel: string;
  score: number | null;
  confidence: 'high' | 'low';
  sourceLine?: string | null;
}

export interface MarkSheetParseResult {
  suggestions: SuggestedMark[];
  rawLines: number;
}

/** Heuristic extract from OCR/paste text: `Amari 74` · `82, Kyomugisha`. */
export function parseMarkSheetText(text: string): MarkSheetParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const suggestions: SuggestedMark[] = [];
  for (const line of lines) {
    const a = /^([A-Za-z][A-Za-z .'-]{1,40}?)\s*[,|\t]?\s*(\d{1,3})(?:\s*\/\s*\d{1,3})?$/.exec(line);
    const b = /^(\d{1,3})\s*[,|\t]\s*([A-Za-z][A-Za-z .'-]{1,40})$/.exec(line);
    let name: string;
    let score: number;
    if (a) {
      name = a[1]!.trim();
      score = Number(a[2]);
    } else if (b) {
      score = Number(b[1]);
      name = b[2]!.trim();
    } else {
      continue;
    }
    if (Number.isNaN(score)) continue;
    suggestions.push({
      studentLabel: name,
      score,
      confidence: name.split(/\s+/).length >= 2 ? 'high' : 'low',
      sourceLine: line,
    });
  }
  return { suggestions, rawLines: lines.length };
}

/** AI-4 LOCK: high = bulk ok · low = must hand-edit (cannot tick-only). */
export function canBulkConfirm(suggestion: SuggestedMark): boolean {
  return suggestion.confidence === 'high';
}

/**
 * Teacher confirm gate — only confirmed marks may enter learning_results.
 * Low-confidence rows require `editedOverrides` (hand-edited score).
 */
export function confirmMarks(
  suggestions: SuggestedMark[],
  confirmedLabels: string[],
  editedOverrides?: Record<string, number>,
): Array<{ studentLabel: string; score: number }> {
  const set = new Set(confirmedLabels.map((s) => s.trim().toLowerCase()));
  const out: Array<{ studentLabel: string; score: number }> = [];
  for (const s of suggestions) {
    const key = s.studentLabel.trim().toLowerCase();
    const override = editedOverrides?.[key];
    if (!canBulkConfirm(s)) {
      if (override == null) continue;
      out.push({ studentLabel: s.studentLabel, score: override });
      continue;
    }
    if (!set.has(key)) continue;
    const score = override ?? s.score;
    if (score == null) continue;
    out.push({ studentLabel: s.studentLabel, score });
  }
  return out;
}

export function matchesStudent(label: string, studentName: string): boolean {
  const a = label.trim().toLowerCase().replace(/\./g, '');
  const b = studentName.trim().toLowerCase();
  if (a === b) return true;
  const parts = a.split(/\s+/).filter((p) => p.length >= 2);
  return parts.length > 0 && parts.every((p) => b.includes(p));
}
