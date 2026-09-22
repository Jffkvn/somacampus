/**
 * P3-E mark-sheet assist (pure). SUGGEST ONLY — teacher confirms.
 * Never writes learning_results without explicit confirm.
 */

export interface SuggestedMark {
  studentLabel: string;
  score: number | null;
  confidence: 'high' | 'low';
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
    });
  }
  return { suggestions, rawLines: lines.length };
}

/** Only teacher-confirmed suggestions may enter the gradebook. */
export function confirmMarks(
  suggestions: SuggestedMark[],
  confirmedLabels: string[],
): Array<{ studentLabel: string; score: number }> {
  const set = new Set(confirmedLabels.map((s) => s.trim().toLowerCase()));
  return suggestions
    .filter((s) => s.score != null && set.has(s.studentLabel.trim().toLowerCase()))
    .map((s) => ({ studentLabel: s.studentLabel, score: s.score as number }));
}

export function matchesStudent(label: string, studentName: string): boolean {
  const a = label.trim().toLowerCase().replace(/\./g, '');
  const b = studentName.trim().toLowerCase();
  if (a === b) return true;
  const parts = a.split(/\s+/).filter((p) => p.length >= 2);
  return parts.length > 0 && parts.every((p) => b.includes(p));
}
