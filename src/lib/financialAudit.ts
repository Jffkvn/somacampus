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
    // Live paths resolve the actor from the Supabase auth context (best-effort).
    // Explicit row.performedBy always wins; getUser failure yields null (never throws).
    let performedBy: string | null = row.performedBy ?? null;
    if (performedBy == null) {
      try {
        const auth = (supabase as any)?.auth;
        if (auth?.getUser) {
          const res = await auth.getUser();
          performedBy = res?.data?.user?.id ?? (res as any)?.user?.id ?? null;
        }
      } catch {
        performedBy = null;
      }
    }
    await supabase.from('financial_audit_logs').insert({
      school_id: row.schoolId,
      entity_type: row.entityType,
      entity_id: row.entityId,
      action: row.action,
      performed_by: performedBy ?? null,
      performed_at: new Date().toISOString(),
      reason: row.reason,
      previous_data: (row.previousData as any) ?? null,
      new_data: (row.newData as any) ?? null,
    });
  } catch (err) {
    // Best-effort: never fail the primary operation on audit write failure.
    console.warn('[financialAudit] audit write failed (swallowed):', err);
  }
}
