import { describe, it, expect } from 'vitest';
import { hrService } from '../modules/hr/hrService';

describe('Staff Payroll & Leave Entitlement Editors (Plan Section 3)', () => {
  const schoolId = 'school-demo-1';
  const employeeId = 'emp-test-editor-1';

  it('allows upserting an employee payroll profile with compensation and banking details', async () => {
    await hrService.upsertPayrollProfile({
      schoolId,
      employeeId,
      baseSalary: 3500000,
      currency: 'UGX',
      payBasis: 'salaried',
      paymentMethod: 'bank_transfer',
      bankName: 'Stanbic Bank',
      bankAccountNumber: '9030012345678',
      bankAccountName: 'David Musoke',
      nssfApplicable: true,
      effectiveFrom: '2026-09-01',
    });

    const profiles = await hrService.getEmployeePayrollProfiles(schoolId);
    const saved = profiles.find((p) => p.employee_id === employeeId);

    expect(saved).toBeDefined();
    expect(saved?.base_salary).toBe(3500000);
    expect(saved?.currency).toBe('UGX');
    expect(saved?.bank_name).toBe('Stanbic Bank');
    expect(saved?.bank_account_number).toBe('9030012345678');
    expect(saved?.nssf_applicable).toBe(true);
  });

  it('allows updating an existing payroll profile with a new salary and closes previous', async () => {
    await hrService.upsertPayrollProfile({
      schoolId,
      employeeId,
      baseSalary: 4200000,
      currency: 'UGX',
      payBasis: 'salaried',
      paymentMethod: 'bank_transfer',
      bankName: 'Stanbic Bank',
      bankAccountNumber: '9030012345678',
      nssfApplicable: true,
      effectiveFrom: '2026-10-01',
    });

    const profiles = await hrService.getEmployeePayrollProfiles(schoolId);
    const active = profiles.filter((p) => p.employee_id === employeeId && !p.effective_to);
    expect(active.length).toBe(1);
    expect(active[0].base_salary).toBe(4200000);
  });

  it('allows assigning custom leave entitlement days and computes effective balances', async () => {
    await hrService.upsertLeaveEntitlement({
      schoolId,
      employeeId,
      leaveTypeId: 'lt-annual',
      leaveYear: 2026,
      entitledDays: 28,
    });

    const balances = await hrService.getEffectiveBalances(schoolId, employeeId);
    const annualBalance = balances.find((b) => b.leaveTypeId === 'lt-annual');

    expect(annualBalance).toBeDefined();
    expect(annualBalance?.entitledDays).toBe(28);
  });
});
