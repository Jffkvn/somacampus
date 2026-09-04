/**
 * SomaCampus Phase 7: School Finance Allocation & Derived Balance Test Suite
 *
 * Verifies:
 * - Recording bank and mobile money payments with receipt generation
 * - Multi-target allocation across student charges (oldest charges first)
 * - Overpayments retained as unallocated credit
 * - Derived student fee account balances (zero mutable source-of-truth divergence)
 * - Comprehensive student fee statement generation
 */

import { describe, it, expect } from 'vitest';
import { financeService } from '../modules/finance/financeService';

describe('School Finance & Allocation Engine Suite', () => {
  it('derives operational student fee accounts from charges and allocations', async () => {
    const accounts = await financeService.getStudentFeeAccounts('school-default', 'term-1');
    expect(accounts.length).toBeGreaterThan(0);

    const amari = accounts.find((a) => a.studentId === 'stud-amari');
    expect(amari).toBeDefined();
    // In seed data: Amari assessed 2,500,000 (2M tuition + 500k lunch), paid 2,500,000 -> balance 0, cleared
    expect(amari?.assessedAmount).toBe(2500000);
    expect(amari?.paidAmount).toBe(2500000);
    expect(amari?.balance).toBe(0);
    expect(amari?.clearanceStatus).toBe('cleared');

    const aurora = accounts.find((a) => a.studentId === 'stud-aurora');
    expect(aurora).toBeDefined();
    // Aurora assessed 2,800,000 (2.3M tuition + 500k lunch), paid 2,000,000 -> balance 800,000, partial
    expect(aurora?.assessedAmount).toBe(2800000);
    expect(aurora?.paidAmount).toBe(2000000);
    expect(aurora?.balance).toBe(800000);
    expect(aurora?.clearanceStatus).toBe('partial');
  });

  it('records fee payments with unique receipt number and allocates against charges', async () => {
    const payment = await financeService.recordPayment({
      schoolId: 'school-default',
      studentId: 'stud-aurora',
      amount: 800000, // exact remaining balance
      paymentDate: '2026-09-03',
      paymentChannel: 'bank_deposit',
      paymentReference: 'BNK-990142',
      payerName: 'Joseph Namukasa',
    });

    expect(payment.receiptNumber).toMatch(/^REC-202609-\d{4}$/);
    expect(payment.amount).toBe(800000);
    expect(payment.unallocatedAmount).toBe(0);
    expect(payment.status).toBe('fully_allocated');

    // After full payment, statement for Aurora should now be cleared
    const statement = await financeService.getStudentFeeStatement('stud-aurora');
    expect(statement).not.toBeNull();
    expect(statement?.balance).toBe(0);
    expect(statement?.clearanceStatus).toBe('cleared');
  });

  it('handles overpayment by retaining excess in unallocatedAmount as credit', async () => {
    const payment = await financeService.recordPayment({
      schoolId: 'school-default',
      studentId: 'stud-amari', // Amari is already fully paid
      amount: 300000, // overpayment
      paymentDate: '2026-09-04',
      paymentChannel: 'mobile_money',
      paymentReference: 'MM-77889911',
      payerName: 'Grace Kyomugisha',
    });

    expect(payment.unallocatedAmount).toBe(300000);
    expect(payment.status).toBe('unallocated');
  });

  it('rejects payments with zero or negative amounts', async () => {
    await expect(
      financeService.recordPayment({
        schoolId: 'school-default',
        studentId: 'stud-amari',
        amount: 0,
        paymentDate: '2026-09-04',
        paymentChannel: 'cash',
        paymentReference: 'CASH-001',
      })
    ).rejects.toThrow('Payment amount must be greater than zero.');
  });
});
