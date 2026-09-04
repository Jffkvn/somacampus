/**
 * Native School Finance Service — SomaCampus Phase 7
 *
 * Implements:
 * 1. Fee structures and student debit charges
 * 2. Rapid intake recording of bank deposits, mobile money, and cash payments
 * 3. Multi-target payment allocation engine with overpayment credit retention
 * 4. Derived student fee account summaries (never an independently mutable source of truth)
 * 5. Comprehensive student fee statements for bursars and parents
 */

import { supabase } from '../../lib/supabase';
import {
  FeeCategory,
  StudentCharge,
  FeePayment,
  PaymentAllocation,
  StudentFeeAccount,
  StudentFeeStatement,
} from '../../types/domain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

// Mock in-memory state
let mockFeeCategories: FeeCategory[] = [
  { id: 'fc-tuition', schoolId: 'school-default', code: 'TUITION', name: 'Tuition & Academic Instruction', isMandatory: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'fc-dev', schoolId: 'school-default', code: 'DEVELOPMENT', name: 'Campus Development Levy', isMandatory: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'fc-lunch', schoolId: 'school-default', code: 'LUNCH', name: 'School Lunch & Catering', isMandatory: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'fc-transport', schoolId: 'school-default', code: 'TRANSPORT', name: 'School Bus Transport', isMandatory: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'fc-activity', schoolId: 'school-default', code: 'ACTIVITY', name: 'Club & Special Activity Fee', isMandatory: false, createdAt: '2026-01-01T00:00:00Z' },
];

let mockCharges: StudentCharge[] = [
  {
    id: 'chg-amari-tuition',
    schoolId: 'school-default',
    studentId: 'stud-amari',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    feeCategoryId: 'fc-tuition',
    description: 'Term 1 Tuition — Stage 5',
    amount: 2000000,
    currency: 'UGX',
    dueDate: '2026-09-15',
    categoryName: 'Tuition',
    createdAt: '2026-08-20T00:00:00Z',
  },
  {
    id: 'chg-amari-lunch',
    schoolId: 'school-default',
    studentId: 'stud-amari',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    feeCategoryId: 'fc-lunch',
    description: 'Term 1 Lunch & Refreshments',
    amount: 500000,
    currency: 'UGX',
    dueDate: '2026-09-15',
    categoryName: 'Lunch',
    createdAt: '2026-08-20T00:00:00Z',
  },
  {
    id: 'chg-aurora-tuition',
    schoolId: 'school-default',
    studentId: 'stud-aurora',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    feeCategoryId: 'fc-tuition',
    description: 'Term 1 Tuition — Stage 7',
    amount: 2300000,
    currency: 'UGX',
    dueDate: '2026-09-15',
    categoryName: 'Tuition',
    createdAt: '2026-08-20T00:00:00Z',
  },
  {
    id: 'chg-aurora-lunch',
    schoolId: 'school-default',
    studentId: 'stud-aurora',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    feeCategoryId: 'fc-lunch',
    description: 'Term 1 Lunch & Refreshments',
    amount: 500000,
    currency: 'UGX',
    dueDate: '2026-09-15',
    categoryName: 'Lunch',
    createdAt: '2026-08-20T00:00:00Z',
  },
];

let mockPayments: FeePayment[] = [
  {
    id: 'pmt-amari-1',
    schoolId: 'school-default',
    studentId: 'stud-amari',
    amount: 2500000,
    currency: 'UGX',
    paymentDate: '2026-08-28',
    paymentChannel: 'bank_deposit',
    paymentReference: 'BNK-982141',
    payerName: 'Grace Kyomugisha',
    payerPhone: '+256772998811',
    unallocatedAmount: 0,
    receiptNumber: 'REC-202608-0014',
    status: 'fully_allocated',
    notes: 'Direct Stanbic Bank deposit',
    createdAt: '2026-08-28T14:00:00Z',
  },
  {
    id: 'pmt-aurora-1',
    schoolId: 'school-default',
    studentId: 'stud-aurora',
    amount: 2000000,
    currency: 'UGX',
    paymentDate: '2026-09-01',
    paymentChannel: 'mobile_money',
    paymentReference: 'MM-88192039',
    payerName: 'Joseph Namukasa',
    payerPhone: '+256782334455',
    unallocatedAmount: 0,
    receiptNumber: 'REC-202609-0003',
    status: 'partially_allocated',
    notes: 'MTN Mobile Money transfer',
    createdAt: '2026-09-01T09:30:00Z',
  },
];

let mockAllocations: PaymentAllocation[] = [
  { id: 'alloc-1', schoolId: 'school-default', paymentId: 'pmt-amari-1', chargeId: 'chg-amari-tuition', amount: 2000000, allocatedAt: '2026-08-28T14:05:00Z' },
  { id: 'alloc-2', schoolId: 'school-default', paymentId: 'pmt-amari-1', chargeId: 'chg-amari-lunch', amount: 500000, allocatedAt: '2026-08-28T14:05:00Z' },
  { id: 'alloc-3', schoolId: 'school-default', paymentId: 'pmt-aurora-1', chargeId: 'chg-aurora-tuition', amount: 2000000, allocatedAt: '2026-09-01T09:35:00Z' },
];

let mockStudentsMetadata = [
  { id: 'stud-amari', admissionNumber: '2026/0142', fullName: 'Amari Kyomugisha', className: 'Stage 5 Blue' },
  { id: 'stud-aurora', admissionNumber: '2026/0143', fullName: 'Aurora Namukasa', className: 'Stage 7 Red' },
  { id: 'stud-brian', admissionNumber: '2026/0098', fullName: 'Brian Musoke', className: 'Stage 5 Blue' },
  { id: 'stud-claire', admissionNumber: '2026/0115', fullName: 'Claire Nabatanzi', className: 'Stage 6 Yellow' },
];

export interface RecordFeePaymentPayload {
  schoolId: string;
  studentId: string;
  amount: number;
  paymentDate: string;
  paymentChannel: FeePayment['paymentChannel'];
  paymentReference: string;
  payerName?: string;
  payerPhone?: string;
  notes?: string;
  allocatedChargeIds?: string[]; // Optional specific charges to allocate first
}

export const financeService = {
  /**
   * Fetch all fee categories
   */
  async getFeeCategories(schoolId: string): Promise<FeeCategory[]> {
    if (isMockEnv()) return mockFeeCategories;
    try {
      const { data, error } = await supabase.from('fee_categories').select('*').eq('school_id', schoolId);
      if (error) throw error;
      return (data || []).map((c: any) => ({
        id: c.id,
        schoolId: c.school_id,
        code: c.code,
        name: c.name,
        description: c.description,
        isMandatory: c.is_mandatory,
        createdAt: c.created_at,
      }));
    } catch (err) {
      throw new Error('Failed to fetch fee categories', { cause: err });
    }
  },

  /**
   * Derive operational student fee accounts from the underlying charges, allocations, and adjustments.
   * Invariant: student_fee_accounts is a derived summary, never the mutable primary authority.
   */
  async getStudentFeeAccounts(schoolId: string, termId: string = 'term-1'): Promise<StudentFeeAccount[]> {
    if (isMockEnv()) {
      return mockStudentsMetadata.map((stu) => {
        const studentCharges = mockCharges.filter((c) => c.studentId === stu.id);
        const totalAssessed = studentCharges.reduce((sum, c) => sum + c.amount, 0);

        const studentAllocations = mockAllocations.filter((a) =>
          studentCharges.some((c) => c.id === a.chargeId)
        );
        const totalPaid = studentAllocations.reduce((sum, a) => sum + a.amount, 0);
        const balance = Math.max(0, totalAssessed - totalPaid);

        let clearanceStatus: 'cleared' | 'partial' | 'overdue' = 'overdue';
        if (balance === 0 && totalAssessed > 0) clearanceStatus = 'cleared';
        else if (totalPaid > 0) clearanceStatus = 'partial';

        return {
          id: `acc-${stu.id}`,
          schoolId,
          studentId: stu.id,
          academicYearId: 'ay-2026-2027',
          termId,
          assessedAmount: totalAssessed,
          paidAmount: totalPaid,
          balance,
          clearanceStatus,
          updatedAt: new Date().toISOString(),
        };
      });
    }

    try {
      const { data, error } = await supabase
        .from('student_fee_accounts')
        .select('*')
        .eq('school_id', schoolId)
        .eq('term_id', termId);
      if (error) throw error;
      return (data || []).map((a: any) => ({
        id: a.id,
        schoolId: a.school_id,
        studentId: a.student_id,
        academicYearId: a.academic_year_id,
        termId: a.term_id,
        assessedAmount: Number(a.assessed_amount),
        paidAmount: Number(a.paid_amount),
        balance: Number(a.balance),
        clearanceStatus: a.clearance_status,
        updatedAt: a.updated_at,
      }));
    } catch (err) {
      throw new Error('Failed to fetch student fee accounts', { cause: err });
    }
  },

  /**
   * Fast intake recording of a real-world payment (bank deposit, mobile money, cash)
   * Automatically executes the multi-target allocation engine.
   */
  async recordPayment(payload: RecordFeePaymentPayload): Promise<FeePayment> {
    if (payload.amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const yearMonth = payload.paymentDate.slice(0, 7).replace('-', '');
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    const receiptNumber = `REC-${yearMonth}-${randomSeq}`;

    if (isMockEnv()) {
      // Find open charges for this student
      const studentCharges = mockCharges
        .filter((c) => c.studentId === payload.studentId)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)); // Oldest first

      let remainingPayment = payload.amount;
      const newAllocations: PaymentAllocation[] = [];
      const paymentId = `pmt-${Date.now()}`;

      // Allocate across unpaid charges
      for (const charge of studentCharges) {
        if (remainingPayment <= 0) break;

        const currentPaid = mockAllocations
          .filter((a) => a.chargeId === charge.id)
          .reduce((sum, a) => sum + a.amount, 0);

        const outstanding = Math.max(0, charge.amount - currentPaid);
        if (outstanding > 0) {
          const allocAmount = Math.min(remainingPayment, outstanding);
          newAllocations.push({
            id: `alloc-${Date.now()}-${charge.id}`,
            schoolId: payload.schoolId,
            paymentId,
            chargeId: charge.id,
            amount: allocAmount,
            allocatedAt: new Date().toISOString(),
          });
          remainingPayment -= allocAmount;
        }
      }

      const unallocatedAmount = remainingPayment; // Retained as overpayment credit
      const status: FeePayment['status'] =
        unallocatedAmount === payload.amount
          ? 'unallocated'
          : unallocatedAmount > 0
          ? 'partially_allocated'
          : 'fully_allocated';

      const newPayment: FeePayment = {
        id: paymentId,
        schoolId: payload.schoolId,
        studentId: payload.studentId,
        amount: payload.amount,
        currency: 'UGX',
        paymentDate: payload.paymentDate,
        paymentChannel: payload.paymentChannel,
        paymentReference: payload.paymentReference,
        payerName: payload.payerName,
        payerPhone: payload.payerPhone,
        unallocatedAmount,
        receiptNumber,
        status,
        notes: payload.notes,
        createdAt: new Date().toISOString(),
      };

      mockPayments.unshift(newPayment);
      mockAllocations.push(...newAllocations);
      return newPayment;
    }

    // Live Supabase implementation
    const { data: pmtData, error: pmtError } = await supabase
      .from('fee_payments')
      .insert({
        school_id: payload.schoolId,
        student_id: payload.studentId,
        amount: payload.amount,
        payment_date: payload.paymentDate,
        payment_channel: payload.paymentChannel,
        payment_reference: payload.paymentReference,
        payer_name: payload.payerName,
        payer_phone: payload.payerPhone,
        receipt_number: receiptNumber,
        notes: payload.notes,
      })
      .select()
      .single();

    if (pmtError) throw pmtError;
    return pmtData;
  },

  /**
   * Get detailed student fee statement for parent or bursar
   */
  async getStudentFeeStatement(studentId: string): Promise<StudentFeeStatement | null> {
    if (isMockEnv()) {
      const studentMeta = mockStudentsMetadata.find((s) => s.id === studentId) || {
        id: studentId,
        admissionNumber: '2026/0142',
        fullName: 'Amari Kyomugisha',
        className: 'Stage 5 Blue',
      };

      const charges = mockCharges.filter((c) => c.studentId === studentId);
      const payments = mockPayments.filter((p) => p.studentId === studentId);

      let totalAssessed = 0;
      let totalPaid = 0;

      const chargesWithBalance = charges.map((chg) => {
        totalAssessed += chg.amount;
        const allocs = mockAllocations.filter((a) => a.chargeId === chg.id);
        const paidAmount = allocs.reduce((sum, a) => sum + a.amount, 0);
        totalPaid += paidAmount;
        return {
          ...chg,
          paidAmount,
          balance: Math.max(0, chg.amount - paidAmount),
        };
      });

      const balance = Math.max(0, totalAssessed - totalPaid);
      let clearanceStatus: 'cleared' | 'partial' | 'overdue' = 'overdue';
      if (balance === 0 && totalAssessed > 0) clearanceStatus = 'cleared';
      else if (totalPaid > 0) clearanceStatus = 'partial';

      return {
        studentId,
        studentName: studentMeta.fullName,
        admissionNumber: studentMeta.admissionNumber,
        className: studentMeta.className,
        totalAssessed,
        totalPaid,
        balance,
        clearanceStatus,
        charges: chargesWithBalance,
        payments,
      };
    }

    // Live Supabase implementation: derive the statement from authoritative rows.
    try {
      const { data: chargeRows, error: chargesError } = await supabase
        .from('student_charges')
        .select('*')
        .eq('student_id', studentId);
      if (chargesError) throw chargesError;

      const { data: paymentRows, error: paymentsError } = await supabase
        .from('fee_payments')
        .select('*')
        .eq('student_id', studentId);
      if (paymentsError) throw paymentsError;

      const chargeIds = (chargeRows || []).map((c: any) => c.id);
      let allocationRows: any[] = [];
      if (chargeIds.length > 0) {
        const { data: allocData, error: allocError } = await supabase
          .from('payment_allocations')
          .select('*')
          .in('charge_id', chargeIds);
        if (allocError) throw allocError;
        allocationRows = allocData || [];
      }

      const charges: StudentCharge[] = (chargeRows || []).map((c: any) => ({
        id: c.id,
        schoolId: c.school_id,
        studentId: c.student_id,
        academicYearId: c.academic_year_id,
        termId: c.term_id,
        feeCategoryId: c.fee_category_id,
        description: c.description,
        amount: Number(c.amount),
        currency: c.currency ?? 'UGX',
        dueDate: c.due_date,
        createdAt: c.created_at,
      }));

      const payments: FeePayment[] = (paymentRows || []).map((p: any) => ({
        id: p.id,
        schoolId: p.school_id,
        studentId: p.student_id,
        amount: Number(p.amount),
        // fee_payments has no currency column: PostgREST returns undefined.
        currency: p.currency ?? 'UGX',
        paymentDate: p.payment_date,
        paymentChannel: p.payment_channel,
        paymentReference: p.payment_reference,
        payerName: p.payer_name,
        payerPhone: p.payer_phone,
        unallocatedAmount: Number(p.unallocated_amount || 0),
        receiptNumber: p.receipt_number,
        status: p.status,
        notes: p.notes,
        createdAt: p.created_at,
      }));

      let totalAssessed = 0;
      let totalPaid = 0;
      const chargesWithBalance = charges.map((chg) => {
        totalAssessed += chg.amount;
        const paidAmount = allocationRows
          .filter((a: any) => a.charge_id === chg.id)
          .reduce((sum: number, a: any) => sum + Number(a.amount), 0);
        totalPaid += paidAmount;
        return { ...chg, paidAmount, balance: Math.max(0, chg.amount - paidAmount) };
      });

      const balance = Math.max(0, totalAssessed - totalPaid);
      let clearanceStatus: 'cleared' | 'partial' | 'overdue' = 'overdue';
      if (balance === 0 && totalAssessed > 0) clearanceStatus = 'cleared';
      else if (totalPaid > 0) clearanceStatus = 'partial';

      // Live student identity: join students -> people for the display name
      // and student_enrolments -> classes for the class name. Query errors
      // still throw; only absent join rows fall back to placeholders.
      const { data: studentRow, error: studentError } = await supabase
        .from('students')
        .select('admission_number, person:people(first_name, last_name)')
        .eq('id', studentId)
        .maybeSingle();
      if (studentError) throw studentError;

      const { data: enrolRow, error: enrolError } = await supabase
        .from('student_enrolments')
        .select('class:classes(name)')
        .eq('student_id', studentId)
        .limit(1)
        .maybeSingle();
      if (enrolError) throw enrolError;

      const person = Array.isArray((studentRow as any)?.person)
        ? (studentRow as any).person[0]
        : (studentRow as any)?.person;
      const personName = [person?.first_name, person?.last_name]
        .filter(Boolean)
        .join(' ');
      const cls = Array.isArray((enrolRow as any)?.class)
        ? (enrolRow as any).class[0]
        : (enrolRow as any)?.class;

      return {
        studentId,
        studentName: personName || studentId,
        admissionNumber: (studentRow as any)?.admission_number ?? studentId,
        className: cls?.name ?? '',
        totalAssessed,
        totalPaid,
        balance,
        clearanceStatus,
        charges: chargesWithBalance,
        payments,
      };
    } catch (err) {
      throw new Error('Failed to fetch student fee statement', { cause: err });
    }
  },
};
