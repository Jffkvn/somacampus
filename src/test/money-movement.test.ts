/**
 * SomaCampus Phase 7: Institutional Money Movement Test Suite
 *
 * Verifies:
 * - Aggregation of Money In (fees, activities) and Money Out (payroll, expenses)
 * - Correct net operational movement calculation
 * - Inclusion of finalized payroll expenditure into institutional money picture
 */

import { describe, it, expect } from 'vitest';
import { moneyMovementService } from '../modules/finance/moneyMovementService';

describe('Institutional Money Movement Suite', () => {
  it('aggregates school money in vs money out and calculates net operational movement', async () => {
    const picture = await moneyMovementService.getInstitutionalMoneyPicture('school-default', 'term-1');

    expect(picture).toBeDefined();
    expect(picture.moneyIn.totalCollected).toBeGreaterThan(0);
    expect(picture.moneyOut.staffPayroll).toBeGreaterThan(0);
    expect(picture.moneyOut.schoolOperations).toBeGreaterThan(0);
    expect(picture.moneyOut.totalExpenditure).toBe(
      picture.moneyOut.staffPayroll + picture.moneyOut.schoolOperations
    );

    // Net operational movement must equal total collected - total expenditure
    expect(picture.netOperationalMovement).toBe(
      picture.moneyIn.totalCollected - picture.moneyOut.totalExpenditure
    );

    expect(picture.collectionRatePercentage).toBeGreaterThanOrEqual(0);
    expect(picture.collectionRatePercentage).toBeLessThanOrEqual(100);
  });
});
