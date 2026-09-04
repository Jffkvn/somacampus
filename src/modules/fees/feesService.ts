import { supabase } from '../../lib/supabase';

export interface FeeAccountSummaryItem {
  id: string;
  studentId: string;
  admissionNumber: string;
  studentName: string;
  className: string;
  assessedAmount: number;
  paidAmount: number;
  balance: number;
  clearanceStatus: 'cleared' | 'partial' | 'overdue';
  lastPaymentDate?: string;
}

export interface FeesDashboardViewModel {
  totalAssessed: number;
  totalCollected: number;
  totalOutstanding: number;
  clearancePercentage: number;
  accounts: FeeAccountSummaryItem[];
}

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

export const feesService = {
  async getFeesDashboard(schoolId: string, termId: string = 'term-1'): Promise<FeesDashboardViewModel> {
    if (isMockEnv()) {
      const mockAccounts: FeeAccountSummaryItem[] = [
        {
          id: 'fee-001',
          studentId: 'stud-amari',
          admissionNumber: '2026/0142',
          studentName: 'Amari Kyomugisha',
          className: 'Stage 5 Blue',
          assessedAmount: 2500000,
          paidAmount: 2500000,
          balance: 0,
          clearanceStatus: 'cleared',
          lastPaymentDate: '2026-08-28',
        },
        {
          id: 'fee-002',
          studentId: 'stud-aurora',
          admissionNumber: '2026/0143',
          studentName: 'Aurora Namukasa',
          className: 'Stage 7 Red',
          assessedAmount: 2800000,
          paidAmount: 2000000,
          balance: 800000,
          clearanceStatus: 'partial',
          lastPaymentDate: '2026-09-01',
        },
        {
          id: 'fee-003',
          studentId: 'stud-brian',
          admissionNumber: '2026/0098',
          studentName: 'Brian Musoke',
          className: 'Stage 5 Blue',
          assessedAmount: 2500000,
          paidAmount: 500000,
          balance: 2000000,
          clearanceStatus: 'overdue',
          lastPaymentDate: '2026-08-15',
        },
        {
          id: 'fee-004',
          studentId: 'stud-claire',
          admissionNumber: '2026/0115',
          studentName: 'Claire Nabatanzi',
          className: 'Stage 6 Yellow',
          assessedAmount: 2600000,
          paidAmount: 2600000,
          balance: 0,
          clearanceStatus: 'cleared',
          lastPaymentDate: '2026-08-30',
        },
      ];

      return {
        totalAssessed: 10400000,
        totalCollected: 7600000,
        totalOutstanding: 2800000,
        clearancePercentage: 73.1,
        accounts: mockAccounts,
      };
    }

    // Live Supabase implementation: derive the dashboard from authoritative
    // student_fee_accounts rows. Empty table -> zeroed dashboard (NO_DATA,
    // success). Query failure -> throw (DATABASE_ERROR, never mock data).
    try {
      const { data, error } = await supabase
        .from('student_fee_accounts')
        .select('*, student:students(admission_number, person:people(first_name, last_name))')
        .eq('school_id', schoolId)
        .eq('term_id', termId);
      if (error) throw error;

      // Resolve class names via enrolments. Lookup errors still throw;
      // only absent rows fall back to ''.
      const studentIds = [...new Set((data || []).map((a: any) => a.student_id))];
      const classByStudent = new Map<string, string>();
      if (studentIds.length > 0) {
        const { data: enrolRows, error: enrolError } = await supabase
          .from('student_enrolments')
          .select('student_id, class:classes(name)')
          .in('student_id', studentIds);
        if (enrolError) throw enrolError;
        for (const e of (enrolRows || []) as any[]) {
          const cls = Array.isArray(e.class) ? e.class[0] : e.class;
          if (cls?.name) classByStudent.set(e.student_id, cls.name);
        }
      }

      const accounts: FeeAccountSummaryItem[] = (data || []).map((a: any) => {
        const assessed = Number(a.assessed_amount || 0);
        const paid = Number(a.paid_amount || 0);
        const balance = Number(a.balance ?? Math.max(0, assessed - paid));
        const student = Array.isArray(a.student) ? a.student[0] : a.student;
        const person = Array.isArray(student?.person) ? student.person[0] : student?.person;
        const fullName = [person?.first_name, person?.last_name].filter(Boolean).join(' ');
        return {
          id: a.id,
          studentId: a.student_id,
          admissionNumber: student?.admission_number ?? a.student_id,
          studentName: fullName || a.student_id,
          className: classByStudent.get(a.student_id) ?? '',
          assessedAmount: assessed,
          paidAmount: paid,
          balance,
          clearanceStatus: a.clearance_status,
        };
      });

      const totalAssessed = accounts.reduce((sum, a) => sum + a.assessedAmount, 0);
      const totalCollected = accounts.reduce((sum, a) => sum + a.paidAmount, 0);
      const totalOutstanding = accounts.reduce((sum, a) => sum + a.balance, 0);
      const clearancePercentage =
        totalAssessed > 0 ? Number(((totalCollected / totalAssessed) * 100).toFixed(1)) : 0;

      return {
        totalAssessed,
        totalCollected,
        totalOutstanding,
        clearancePercentage,
        accounts,
      };
    } catch (err) {
      throw new Error('Failed to fetch fees dashboard', { cause: err });
    }
  },
};
