/**
 * School Operating Expenses Service — SomaCampus Phase 7
 *
 * Implements:
 * 1. Categorization of school operations (lunch, utilities, maintenance, stationery)
 * 2. Rapid recording and approval of operational expenditures (Money Out)
 * 3. Aggregation of operating costs for the Institutional Money Picture
 */

import { supabase } from '../../lib/supabase';
import { writeFinancialAudit } from '../../lib/financialAudit';
import { SchoolExpense, SchoolExpenseCategory } from '../../types/domain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

export const isUUID = (val?: string | null): boolean =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

import {
  DEFAULT_EXPENSE_CATEGORIES,
  expenseFixtureStore,
} from './fixtures/expenseFixtures';
export { DEFAULT_EXPENSE_CATEGORIES };

export const expenseService = {
  /**
   * Get expense categories — empty stays empty (never fixture-substituted).
   */
  async getCategories(schoolId: string): Promise<SchoolExpenseCategory[]> {
    if (isMockEnv()) return expenseFixtureStore.categories;
    if (!isUUID(schoolId)) {
      throw new Error('expenseService.getCategories: no school selected.');
    }
    try {
      const { data, error } = await supabase
        .from('school_expense_categories')
        .select('*')
        .eq('school_id', schoolId);
      if (error) throw error;
      return (data || []).map((c: any) => ({
        id: c.id,
        schoolId: c.school_id,
        name: c.name,
        code: c.code,
        createdAt: c.created_at,
      }));
    } catch (err) {
      throw new Error('Failed to fetch expense categories', { cause: err });
    }
  },

  /**
   * Get school operating expenses
   */
  async getExpenses(schoolId: string, termId?: string): Promise<SchoolExpense[]> {
    if (isMockEnv()) {
      let filtered = [...expenseFixtureStore.expenses];
      if (termId && isUUID(termId)) filtered = filtered.filter((e) => !e.termId || e.termId === termId);
      return filtered.sort((a, b) => b.spentOn.localeCompare(a.spentOn));
    }
    if (!isUUID(schoolId)) {
      throw new Error('expenseService.getExpenses: no school selected.');
    }
    try {
      let query = supabase
        .from('school_expenses')
        .select(`
          *,
          category:school_expense_categories(name)
        `)
        .eq('school_id', schoolId)
        .order('spent_on', { ascending: false });

      if (termId && isUUID(termId)) query = query.eq('term_id', termId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((e: any) => ({
        id: e.id,
        schoolId: e.school_id,
        categoryId: e.category_id,
        categoryName: e.category?.name,
        amount: Number(e.amount),
        currency: e.currency,
        spentOn: e.spent_on,
        paymentChannel: e.payment_channel,
        recipientPayee: e.recipient_payee,
        description: e.description,
        referenceNumber: e.reference_number,
        receiptAttachmentUrl: e.receipt_attachment_url,
        academicYearId: e.academic_year_id,
        termId: e.term_id,
        status: e.status,
        createdAt: e.created_at,
      }));
    } catch (err) {
      throw new Error('Failed to fetch school expenses', { cause: err });
    }
  },

  /**
   * Record a new operating expense
   */
  async recordExpense(payload: {
    schoolId: string;
    categoryId: string;
    amount: number;
    spentOn: string;
    paymentChannel: SchoolExpense['paymentChannel'];
    recipientPayee: string;
    description: string;
    referenceNumber?: string;
    termId?: string;
  }): Promise<SchoolExpense> {
    if (payload.amount <= 0) {
      throw new Error('Expense amount must be positive.');
    }
    if (!isUUID(payload.schoolId)) {
      throw new Error('expenseService.recordExpense: no school selected.');
    }
    // No fixture fallback: a missing category is a configuration error the
    // user must fix (create the category), never a silent substitution.
    if (!isUUID(payload.categoryId)) {
      throw new Error(
        'expenseService.recordExpense: no expense category selected. Create an expense category first.'
      );
    }

    const cat = expenseFixtureStore.categories.find((c) => c.id === payload.categoryId);

    if (isMockEnv()) {
      const newExp: SchoolExpense = {
        id: `exp-${Date.now()}`,
        schoolId: payload.schoolId,
        categoryId: payload.categoryId,
        categoryName: cat?.name || 'General Operations',
        amount: payload.amount,
        currency: 'UGX',
        spentOn: payload.spentOn,
        paymentChannel: payload.paymentChannel,
        recipientPayee: payload.recipientPayee,
        description: payload.description,
        referenceNumber: payload.referenceNumber,
        termId: payload.termId || 'term-1',
        status: 'recorded',
        createdAt: new Date().toISOString(),
      };
      expenseFixtureStore.expenses.unshift(newExp);

      await writeFinancialAudit({
        schoolId: payload.schoolId,
        entityType: 'expense',
        entityId: newExp.id,
        action: 'create',
        reason: `recordExpense ${payload.description}`,
        previousData: null,
        newData: newExp,
      });
      return newExp;
    }

    const insertRow: any = {
      school_id: payload.schoolId,
      category_id: payload.categoryId,
      amount: payload.amount,
      spent_on: payload.spentOn,
      payment_channel: payload.paymentChannel,
      recipient_payee: payload.recipientPayee,
      description: payload.description,
      reference_number: payload.referenceNumber || null,
      term_id: isUUID(payload.termId) ? payload.termId : null,
    };

    const res = await supabase
      .from('school_expenses')
      .insert(insertRow)
      .select()
      .single();
    if (res.error) throw res.error;
    const data = res.data;

    await writeFinancialAudit({
      schoolId: payload.schoolId,
      entityType: 'expense',
      entityId: (data as any)?.id ?? payload.referenceNumber ?? payload.description,
      action: 'create',
      reason: `recordExpense ${payload.description}`,
      previousData: null,
      newData: data,
    });
    return data;
  },

  /**
   * Create an expense category for a school. Fail-closed on identity.
   */
  async createCategory(payload: {
    schoolId: string;
    name: string;
    code?: string;
  }): Promise<SchoolExpenseCategory> {
    const name = payload.name.trim();
    if (!isUUID(payload.schoolId)) {
      throw new Error('expenseService.createCategory: no school selected.');
    }
    if (!name) {
      throw new Error('expenseService.createCategory: category name is required.');
    }
    const code =
      payload.code?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_') ||
      name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24);
    if (isMockEnv()) {
      const created: SchoolExpenseCategory = {
        id: `cat-${Date.now()}`,
        schoolId: payload.schoolId,
        name,
        code,
        createdAt: new Date().toISOString(),
      };
      expenseFixtureStore.categories.unshift(created);
      return created;
    }
    const { data, error } = await supabase
      .from('school_expense_categories')
      .insert({ school_id: payload.schoolId, name, code })
      .select()
      .single();
    if (error) throw error;
    return {
      id: (data as any).id,
      schoolId: (data as any).school_id,
      name: (data as any).name,
      code: (data as any).code,
      createdAt: (data as any).created_at,
    };
  },
};
