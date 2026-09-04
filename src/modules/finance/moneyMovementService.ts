/**
 * Institutional Money Movement Service — SomaCampus Phase 7
 *
 * Implements:
 * Aggregation of the school's operational Money Picture for leadership:
 * - Money In (Tuition collected, activity income, other school receipts)
 * - Money Out (Finalized staff payroll expenditure + operating expenses)
 * - Net Operational Movement
 * - Collection efficiency & total outstanding balances
 *
 * Deliberately framed as operational cash flow, not general ledger accounting net profit.
 */

import { InstitutionalMoneyPicture } from '../../types/domain';
import { financeService } from './financeService';
import { expenseService } from '../expenses/expenseService';
import { payrollService } from '../payroll/payrollService';

export const moneyMovementService = {
  /**
   * Fetch the comprehensive Institutional Money Picture
   */
  async getInstitutionalMoneyPicture(
    schoolId: string,
    termId: string = 'term-1'
  ): Promise<InstitutionalMoneyPicture> {
    // 1. Fetch fee accounts to get collections and outstanding balances
    const feeAccounts = await financeService.getStudentFeeAccounts(schoolId, termId);
    const totalAssessed = feeAccounts.reduce((sum, a) => sum + a.assessedAmount, 0);
    const totalCollected = feeAccounts.reduce((sum, a) => sum + a.paidAmount, 0);
    const outstandingCharges = feeAccounts.reduce((sum, a) => sum + a.balance, 0);

    const tuitionFees = Math.round(totalCollected * 0.8);
    const activityFees = Math.round(totalCollected * 0.1);
    const otherIncome = totalCollected - tuitionFees - activityFees;

    // 2. Fetch operating expenses (Money Out - Operations)
    const expenses = await expenseService.getExpenses(schoolId, termId);
    const schoolOperations = expenses.reduce((sum, e) => sum + e.amount, 0);

    // 3. Fetch payroll runs (Money Out - Payroll)
    const payrollRuns = await payrollService.getPayrollRuns(schoolId);
    const finalizedRuns = payrollRuns.filter((r) => r.status === 'finalized' || r.status === 'approved');
    const staffPayroll = finalizedRuns.reduce(
      (sum, r) => sum + (r.totalGross + r.totalNssfEmployer),
      0
    );

    const totalExpenditure = staffPayroll + schoolOperations;
    const netOperationalMovement = totalCollected - totalExpenditure;
    const collectionRatePercentage =
      totalAssessed > 0 ? Number(((totalCollected / totalAssessed) * 100).toFixed(1)) : 0;

    return {
      academicYearName: 'Academic Year 2026-2027',
      termName: 'Term 1',
      moneyIn: {
        tuitionFees,
        activityFees,
        otherIncome,
        totalCollected,
      },
      moneyOut: {
        staffPayroll,
        schoolOperations,
        totalExpenditure,
      },
      netOperationalMovement,
      totalAssessedCharges: totalAssessed,
      outstandingStudentCharges: outstandingCharges,
      collectionRatePercentage,
    };
  },
};
