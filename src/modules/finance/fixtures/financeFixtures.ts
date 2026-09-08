import {
  FeeCategory,
  FeePayment,
  PaymentAllocation,
  StudentCharge,
} from '../../../types/domain';

export const INITIAL_FEE_CATEGORIES: FeeCategory[] = [
  { id: 'fc-tuition', schoolId: 'school-default', code: 'TUITION', name: 'Tuition & Academic Instruction', isMandatory: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'fc-dev', schoolId: 'school-default', code: 'DEVELOPMENT', name: 'Campus Development Levy', isMandatory: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'fc-lunch', schoolId: 'school-default', code: 'LUNCH', name: 'School Lunch & Catering', isMandatory: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'fc-transport', schoolId: 'school-default', code: 'TRANSPORT', name: 'School Bus Transport', isMandatory: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'fc-activity', schoolId: 'school-default', code: 'ACTIVITY', name: 'Club & Special Activity Fee', isMandatory: false, createdAt: '2026-01-01T00:00:00Z' },
];

export const INITIAL_CHARGES: StudentCharge[] = [
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

export const INITIAL_PAYMENTS: FeePayment[] = [
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

export const INITIAL_ALLOCATIONS: PaymentAllocation[] = [
  { id: 'alloc-1', schoolId: 'school-default', paymentId: 'pmt-amari-1', chargeId: 'chg-amari-tuition', amount: 2000000, allocatedAt: '2026-08-28T14:05:00Z' },
  { id: 'alloc-2', schoolId: 'school-default', paymentId: 'pmt-amari-1', chargeId: 'chg-amari-lunch', amount: 500000, allocatedAt: '2026-08-28T14:05:00Z' },
  { id: 'alloc-3', schoolId: 'school-default', paymentId: 'pmt-aurora-1', chargeId: 'chg-aurora-tuition', amount: 2000000, allocatedAt: '2026-09-01T09:35:00Z' },
];

export const INITIAL_STUDENTS_METADATA = [
  { id: 'stud-amari', admissionNumber: '2026/0142', fullName: 'Amari Kyomugisha', className: 'Stage 5 Blue' },
  { id: 'stud-aurora', admissionNumber: '2026/0143', fullName: 'Aurora Namukasa', className: 'Stage 7 Red' },
  { id: 'stud-brian', admissionNumber: '2026/0098', fullName: 'Brian Musoke', className: 'Stage 5 Blue' },
  { id: 'stud-claire', admissionNumber: '2026/0115', fullName: 'Claire Nabatanzi', className: 'Stage 6 Yellow' },
];

export const financeFixtureStore = {
  feeCategories: [...INITIAL_FEE_CATEGORIES],
  charges: [...INITIAL_CHARGES],
  payments: [...INITIAL_PAYMENTS],
  allocations: [...INITIAL_ALLOCATIONS],
  studentsMetadata: [...INITIAL_STUDENTS_METADATA],
  reset() {
    this.feeCategories = [...INITIAL_FEE_CATEGORIES];
    this.charges = [...INITIAL_CHARGES];
    this.payments = [...INITIAL_PAYMENTS];
    this.allocations = [...INITIAL_ALLOCATIONS];
    this.studentsMetadata = [...INITIAL_STUDENTS_METADATA];
  },
};
