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

export const feesService = {
  async getFeesDashboard(_schoolId: string): Promise<FeesDashboardViewModel> {
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
  },
};
