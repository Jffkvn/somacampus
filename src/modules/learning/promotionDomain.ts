/**
 * P3-G promotion record (thin). One decision per learner-year.
 * No fees-clearance or committee engine unless a customer funds it.
 */

export type PromotionDecision = 'promoted' | 'repeating' | 'transferred' | 'other';

export interface PromotionRecord {
  id: string;
  schoolId: string;
  studentId: string;
  academicYear: string;
  fromLabel: string;
  toLabel: string;
  decision: PromotionDecision;
  reason: string | null;
  decidedBy: string;
  decidedOn: string;
}

export function validatePromotion(input: {
  academicYear: string;
  fromLabel: string;
  toLabel: string;
  decision: PromotionDecision;
  reason?: string | null;
}): void {
  if (!input.academicYear?.trim()) throw new Error('promotion: academicYear is required');
  if (!input.fromLabel?.trim()) throw new Error('promotion: fromLabel is required');
  if (!input.toLabel?.trim()) throw new Error('promotion: toLabel is required');
  if (!['promoted', 'repeating', 'transferred', 'other'].includes(input.decision)) {
    throw new Error('promotion: decision must be promoted | repeating | transferred | other');
  }
  if (input.decision === 'other' && !input.reason?.trim()) {
    throw new Error('promotion: reason is required for decision=other');
  }
}

export function formatPromotionLine(r: {
  fromLabel: string;
  toLabel: string;
  decision: PromotionDecision;
  academicYear: string;
}): string {
  const verb =
    r.decision === 'promoted'
      ? '→'
      : r.decision === 'repeating'
        ? 'repeats'
        : r.decision === 'transferred'
          ? 'transfers'
          : 'decided';
  return `${r.academicYear}: ${r.fromLabel} ${verb} ${r.toLabel}`;
}
