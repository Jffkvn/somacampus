/**
 * Fee Setup service — the school's price list (Phase A).
 *
 * Bursars draft fee_structures (per year + term + class + category); only the
 * Principal/Admin can approve them (enforced by RLS +
 * set_fee_structure_approval, not the UI). Approved structures are applied to
 * enrolled students by generate_charges_from_structures, which is idempotent:
 * one charge per (student, structure), so re-running never double-bills.
 *
 * Mock honesty: no fixtures — without a live Supabase URL the page shows an
 * honest error, never a fake price list.
 */
import { supabase } from '../../lib/supabase';

export interface FeeCategory {
  id: string;
  code: string;
  name: string;
  isMandatory: boolean;
}

export interface FeeClass {
  id: string;
  name: string;
}

export type FeeStructureApproval = 'draft' | 'approved' | 'rejected';

export interface FeeStructureRow {
  id: string;
  classId: string | null;
  categoryId: string | null;
  title: string;
  amount: number;
  approvalStatus: FeeStructureApproval;
  rejectionNote: string | null;
  updatedAt: string;
}

export interface FeeTerm {
  id: string;
  name: string;
  academicYearId: string;
  isCurrent: boolean;
}

const first = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

async function resolveMyPersonId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: person, error } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  const row = first(person);
  return row?.id ?? null;
}

export const feeSetupService = {
  async getTerms(schoolId: string): Promise<FeeTerm[]> {
    const { data, error } = await supabase
      .from('terms')
      .select('id, name, academic_year_id, is_current, academic_years!inner(school_id)')
      .eq('academic_years.school_id', schoolId)
      .order('term_number');
    if (error) throw error;
    return (data ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      academicYearId: t.academic_year_id,
      isCurrent: Boolean(t.is_current),
    }));
  },

  async getFeeSetup(schoolId: string, termId: string): Promise<{
    categories: FeeCategory[];
    classes: FeeClass[];
    structures: FeeStructureRow[];
  }> {
    const [classRes, catRes, structRes] = await Promise.all([
      supabase.from('classes').select('id, name').eq('school_id', schoolId).order('name'),
      supabase
        .from('fee_categories')
        .select('id, code, name, is_mandatory')
        .eq('school_id', schoolId)
        .order('created_at'),
      supabase
        .from('fee_structures')
        .select('id, class_id, fee_category_id, title, amount, approval_status, rejection_note, approved_at')
        .eq('school_id', schoolId)
        .eq('term_id', termId),
    ]);
    if (classRes.error) throw classRes.error;
    if (catRes.error) throw catRes.error;
    if (structRes.error) throw structRes.error;

    return {
      classes: (classRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name })),
      categories: (catRes.data ?? []).map((c: any) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        isMandatory: Boolean(c.is_mandatory),
      })),
      structures: (structRes.data ?? []).map((s: any) => ({
        id: s.id,
        classId: s.class_id,
        categoryId: s.fee_category_id,
        title: s.title ?? '',
        amount: Number(s.amount),
        approvalStatus: (s.approval_status ?? 'draft') as FeeStructureApproval,
        rejectionNote: s.rejection_note ?? null,
        updatedAt: s.approved_at ?? s.id,
      })),
    };
  },

  /**
   * Persist grid edits. Bursars may only touch draft/rejected rows; approved
   * rows are locked for the term (RLS enforces this server-side and the page
   * renders them read-only for bursars; an approver editing an approved row
   * keeps it approved). Rejected rows return to draft on save.
   */
  async saveDrafts(
    schoolId: string,
    termId: string,
    academicYearId: string,
    edits: Array<{
      structureId?: string;
      classId: string | null;
      categoryId: string;
      title: string;
      amount: number;
      resetToDraft?: boolean;
    }>,
  ): Promise<void> {
    const personId = await resolveMyPersonId();
    for (const e of edits) {
      if (e.structureId) {
        const update: Record<string, unknown> = {
          amount: e.amount,
          proposed_by: personId,
        };
        if (e.resetToDraft) {
          update.approval_status = 'draft';
          update.rejection_note = null;
        }
        const { error } = await supabase
          .from('fee_structures')
          .update(update)
          .eq('id', e.structureId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fee_structures').insert({
          school_id: schoolId,
          term_id: termId,
          academic_year_id: academicYearId,
          class_id: e.classId,
          fee_category_id: e.categoryId,
          title: e.title,
          amount: e.amount,
          currency: 'UGX',
          approval_status: 'draft',
          proposed_by: personId,
        });
        if (error) throw error;
      }
    }
  },

  async setApproval(
    schoolId: string,
    structureIds: string[],
    approve: boolean,
    note?: string,
  ): Promise<{ updated: number }> {
    const { data, error } = await supabase.rpc('set_fee_structure_approval', {
      p_school_id: schoolId,
      p_structure_ids: structureIds,
      p_approve: approve,
      p_note: note ?? null,
    });
    if (error) throw error;
    return data as { updated: number };
  },

  async generateCharges(
    schoolId: string,
    termId: string,
    structureIds: string[],
  ): Promise<{ charges_created: number; students: number; structures: number }> {
    const { data, error } = await supabase.rpc('generate_charges_from_structures', {
      p_school_id: schoolId,
      p_term_id: termId,
      p_structure_ids: structureIds,
    });
    if (error) throw error;
    return data as { charges_created: number; students: number; structures: number };
  },

  /**
   * Enrolled-student counts per class for the apply-preview. Best effort:
   * returns null when the caller cannot read enrolments (UI degrades to
   * generic wording — never blocks the action).
   */
  async getEnrolledCountsByClass(
    schoolId: string,
    academicYearId: string,
  ): Promise<Record<string, number> | null> {
    try {
      const { data, error } = await supabase
        .from('student_enrolments')
        .select('class_id')
        .eq('school_id', schoolId)
        .eq('academic_year_id', academicYearId)
        .eq('status', 'active');
      if (error) return null;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        if (row.class_id) counts[row.class_id] = (counts[row.class_id] ?? 0) + 1;
      }
      return counts;
    } catch {
      return null;
    }
  },
};
