/**
 * School Operating Expenses Service — SomaCampus Phase 7
 *
 * Implements:
 * 1. Categorization of school operations (lunch, utilities, maintenance, stationery)
 * 2. Rapid recording and approval of operational expenditures (Money Out)
 * 3. Aggregation of operating costs for the Institutional Money Picture
 */

import { supabase } from '../../lib/supabase';
import { SchoolExpense, SchoolExpenseCategory } from '../../types/domain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

let mockCategories: SchoolExpenseCategory[] = [
  { id: 'cat-lunch', schoolId: 'school-default', name: 'School Catering & Food', code: 'FOOD_LUNCH', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-elec', schoolId: 'school-default', name: 'Electricity (Umeme / Yaka)', code: 'ELECTRICITY', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-water', schoolId: 'school-default', name: 'Water & Sanitation (NWSC)', code: 'WATER', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-internet', schoolId: 'school-default', name: 'Campus Internet & Connectivity', code: 'INTERNET', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-maint', schoolId: 'school-default', name: 'Facility Repairs & Maintenance', code: 'MAINTENANCE', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-stationery', schoolId: 'school-default', name: 'Classroom Stationery & Supplies', code: 'STATIONERY', createdAt: '2026-01-01T00:00:00Z' },
];

let mockExpenses: SchoolExpense[] = [
  {
    id: 'exp-1',
    schoolId: 'school-default',
    categoryId: 'cat-lunch',
    categoryName: 'School Catering & Food',
    amount: 3200000,
    currency: 'UGX',
    spentOn: '2026-08-25',
    paymentChannel: 'bank_transfer',
    recipientPayee: 'Kampala Fresh Produce Suppliers Ltd',
    description: 'Bulk grain, vegetables, and fruit for Term 1 boarders & day lunch',
    referenceNumber: 'EFT-881290',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    status: 'reconciled',
    createdAt: '2026-08-25T11:00:00Z',
  },
  {
    id: 'exp-2',
    schoolId: 'school-default',
    categoryId: 'cat-elec',
    categoryName: 'Electricity (Umeme / Yaka)',
    amount: 1450000,
    currency: 'UGX',
    spentOn: '2026-08-28',
    paymentChannel: 'mobile_money',
    recipientPayee: 'Umeme Yaka Pre-paid',
    description: 'Main campus administration and classroom power units token purchase',
    referenceNumber: 'MM-9921401',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    status: 'reconciled',
    createdAt: '2026-08-28T09:00:00Z',
  },
  {
    id: 'exp-3',
    schoolId: 'school-default',
    categoryId: 'cat-internet',
    categoryName: 'Campus Internet & Connectivity',
    amount: 850000,
    currency: 'UGX',
    spentOn: '2026-09-01',
    paymentChannel: 'bank_transfer',
    recipientPayee: 'Roke Telkom Uganda',
    description: 'Dedicated fiber internet subscription for September 2026',
    referenceNumber: 'INV-44120',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    status: 'approved',
    createdAt: '2026-09-01T14:00:00Z',
  },
  {
    id: 'exp-4',
    schoolId: 'school-default',
    categoryId: 'cat-maint',
    categoryName: 'Facility Repairs & Maintenance',
    amount: 620000,
    currency: 'UGX',
    spentOn: '2026-09-02',
    paymentChannel: 'cash',
    recipientPayee: 'Kato Plumbing & Electrical Services',
    description: 'Emergency repair of washroom valves and science lab water lines',
    referenceNumber: 'VOUCHER-088',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    status: 'approved',
    createdAt: '2026-09-02T16:00:00Z',
  },
];

export const expenseService = {
  /**
   * Get expense categories
   */
  async getCategories(schoolId: string): Promise<SchoolExpenseCategory[]> {
    if (isMockEnv()) return mockCategories;
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
      let filtered = [...mockExpenses];
      if (termId) filtered = filtered.filter((e) => !e.termId || e.termId === termId);
      return filtered.sort((a, b) => b.spentOn.localeCompare(a.spentOn));
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

      if (termId) query = query.eq('term_id', termId);

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

    const cat = mockCategories.find((c) => c.id === payload.categoryId);

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
      mockExpenses.unshift(newExp);
      return newExp;
    }

    const { data, error } = await supabase
      .from('school_expenses')
      .insert({
        school_id: payload.schoolId,
        category_id: payload.categoryId,
        amount: payload.amount,
        spent_on: payload.spentOn,
        payment_channel: payload.paymentChannel,
        recipient_payee: payload.recipientPayee,
        description: payload.description,
        reference_number: payload.referenceNumber,
        term_id: payload.termId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
