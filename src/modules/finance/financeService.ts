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

const isUUID = (val?: string | null): boolean =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

import { financeFixtureStore } from './fixtures/financeFixtures';

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
    if (isMockEnv()) return financeFixtureStore.feeCategories;
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
    if (isMockEnv() || schoolId === 'school-default') {
      return financeFixtureStore.studentsMetadata.map((stu) => {
        const studentCharges = financeFixtureStore.charges.filter((c) => c.studentId === stu.id);
        const totalAssessed = studentCharges.reduce((sum, c) => sum + c.amount, 0);

        const studentAllocations = financeFixtureStore.allocations.filter((a) =>
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
      let query = supabase
        .from('student_fee_accounts')
        .select('*')
        .eq('school_id', schoolId);
      if (termId && termId.length > 20) {
        query = query.eq('term_id', termId);
      }
      const { data, error } = await query;
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
      const studentCharges = financeFixtureStore.charges
        .filter((c) => c.studentId === payload.studentId)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)); // Oldest first

      let remainingPayment = payload.amount;
      const newAllocations: PaymentAllocation[] = [];
      const paymentId = `pmt-${Date.now()}`;

      // Allocate across unpaid charges
      for (const charge of studentCharges) {
        if (remainingPayment <= 0) break;

        const currentPaid = financeFixtureStore.allocations
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

      financeFixtureStore.payments.unshift(newPayment);
      financeFixtureStore.allocations.push(...newAllocations);
      return newPayment;
    }

    // Live: single atomic RPC (payment -> allocate -> account -> audit in
    // ONE Postgres transaction). Fail-closed on fixture IDs: never send
    // non-UUID school/student identifiers to the database.
    if (!isUUID(payload.schoolId)) {
      throw new Error(
        `financeService.recordPayment: no school selected (got '${payload.schoolId}'). Select a school before recording payments.`
      );
    }
    if (!isUUID(payload.studentId)) {
      throw new Error(
        `financeService.recordPayment: no pupil selected (got '${payload.studentId}'). Select an enrolled pupil before recording payments.`
      );
    }
    const { data, error } = await supabase.rpc('record_fee_payment', {
      p_school_id: payload.schoolId,
      p_student_id: payload.studentId,
      p_amount: payload.amount,
      p_payment_date: payload.paymentDate,
      p_payment_channel: payload.paymentChannel,
      p_payment_reference: payload.paymentReference,
      p_payer_name: payload.payerName ?? null,
      p_payer_phone: payload.payerPhone ?? null,
      p_notes: payload.notes ?? null,
    });
    if (error) throw new Error(`Failed to record payment: ${error.message}`);
    const r = data as any;
    return {
      id: String(r.payment_id),
      schoolId: payload.schoolId,
      studentId: payload.studentId,
      amount: payload.amount,
      currency: 'UGX',
      paymentDate: payload.paymentDate,
      paymentChannel: payload.paymentChannel,
      paymentReference: payload.paymentReference,
      payerName: payload.payerName,
      payerPhone: payload.payerPhone,
      unallocatedAmount: Number(r.unallocated ?? 0),
      receiptNumber: String(r.receipt_number ?? ''),
      status: r.status as FeePayment['status'],
      notes: payload.notes,
      createdAt: new Date().toISOString(),
    } as FeePayment;
  },

  /**
   * Get detailed student fee statement for parent or bursar
   */
  async getStudentFeeStatement(studentId: string): Promise<StudentFeeStatement | null> {
    if (isMockEnv()) {
      const studentMeta = financeFixtureStore.studentsMetadata.find((s) => s.id === studentId) || {
        id: studentId,
        admissionNumber: '2026/0142',
        fullName: 'Amari Kyomugisha',
        className: 'Stage 5 Blue',
      };

      const charges = financeFixtureStore.charges.filter((c) => c.studentId === studentId);
      const payments = financeFixtureStore.payments.filter((p) => p.studentId === studentId);

      let totalAssessed = 0;
      let totalPaid = 0;

      const chargesWithBalance = charges.map((chg) => {
        totalAssessed += chg.amount;
        const allocs = financeFixtureStore.allocations.filter((a) => a.chargeId === chg.id);
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
