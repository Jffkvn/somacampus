/**
 * Minimal append-only financial audit writer (D9 hardening).
 *
 * Best-effort fire-and-forget: audit failures must never break the primary
 * money movement. Services call this on live Supabase paths only; mock paths
 * stay in-memory and untouched. No engine redesign, no schema change.
 */
import { supabase } from './supabase';

export interface FinancialAuditRow {
  schoolId: string;
  entityType: string;
  entityId: string;
  action: string;
  performedBy?: string | null;
  reason: string;
  previousData?: unknown;
  newData?: unknown;
}

export async function writeFinancialAudit(row: FinancialAuditRow): Promise<void> {
  try {
    await supabase.from('financial_audit_logs').insert({
      school_id: row.schoolId,
      entity_type: row.entityType,
      entity_id: row.entityId,
      action: row.action,
      performed_by: row.performedBy ?? null,
      performed_at: new Date().toISOString(),
      reason: row.reason,
      previous_data: (row.previousData as any) ?? null,
      new_data: (row.newData as any) ?? null,
    });
  } catch {
    // Best-effort: never fail the primary operation on audit write failure.
  }
}
