import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hrService } from '../modules/hr/hrService';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('../lib/financialAudit', () => ({
  writeFinancialAudit: vi.fn().mockResolvedValue({ id: 'audit-1' }),
}));

const LIVE_URL = 'https://test.supabase.co';
let tableResponses: Record<string, unknown> = {};

const builderFor = (table: string) => {
  const respond = () => {
    const r = tableResponses[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: null, error: null });
  };
  const b: Record<string, unknown> = {};
  b.select = vi.fn(() => b);
  b.eq = vi.fn(() => b);
  b.is = vi.fn(() => b);
  b.or = vi.fn(() => b);
  b.order = vi.fn(() => b);
  b.insert = vi.fn(() => b);
  b.update = vi.fn(() => b);
  b.upsert = vi.fn(() => b);
  b.single = vi.fn(() => respond());
  b.maybeSingle = vi.fn(() => (b.single as ReturnType<typeof vi.fn>)());
  (b as { then: unknown }).then = (res: unknown, rej: unknown) =>
    respond().then(res as never, rej as never);
  return b;
};

beforeEach(() => {
  mockFrom.mockImplementation((table: string) => builderFor(table));
  tableResponses = {};
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Staff Payroll & Leave Entitlement Editors (Plan Section 3)', () => {
  const schoolId = 'school-demo-1';
  const employeeId = 'emp-test-editor-1';

  describe('mock env honesty (no in-memory fakes)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://mock.supabase.co');
    });

    it('reads resolve to empty and writes throw', async () => {
      await expect(hrService.getEmployeePayrollProfiles(schoolId)).resolves.toEqual([]);
      await expect(
        hrService.upsertPayrollProfile({
          schoolId,
          employeeId,
          baseSalary: 3500000,
          effectiveFrom: '2026-09-01',
          actorRole: 'admin',
        })
      ).rejects.toThrow(/mock environment/);
      await expect(
        hrService.upsertLeaveEntitlement({
          schoolId,
          employeeId,
          leaveTypeId: 'lt-annual',
          leaveYear: 2026,
          entitledDays: 28,
        })
      ).rejects.toThrow(/mock environment/);
      await expect(hrService.getEffectiveBalances(schoolId, employeeId)).resolves.toEqual([]);
    });
  });

  describe('payroll write gates (hr.payroll.manage — admin only)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_SUPABASE_URL', LIVE_URL);
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
    });

    it.each(['teacher', 'principal', 'bursar'] as const)(
      'upsertPayrollProfile rejects %s (no hr.payroll.manage)',
      async (actorRole) => {
        await expect(
          hrService.upsertPayrollProfile({
            schoolId,
            employeeId,
            baseSalary: 3500000,
            effectiveFrom: '2026-09-01',
            actorRole,
          })
        ).rejects.toThrow(/hr\.payroll\.manage|not authorized|permission/i);
      }
    );

    it('upsertPayrollProfile rejects a missing actorRole', async () => {
      await expect(
        hrService.upsertPayrollProfile({ schoolId, employeeId, baseSalary: 3500000 })
      ).rejects.toThrow(/actorRole.*required|hr\.payroll\.manage|not authorized/i);
    });

    it.each(['teacher', 'principal', 'bursar'] as const)(
      'upsertLeaveEntitlement rejects %s (no hr.payroll.manage)',
      async (actorRole) => {
        await expect(
          hrService.upsertLeaveEntitlement({
            schoolId,
            employeeId,
            leaveTypeId: 'lt-annual',
            leaveYear: 2026,
            entitledDays: 28,
            actorRole,
          })
        ).rejects.toThrow(/hr\.payroll\.manage|not authorized|permission/i);
      }
    );

    it('upsertLeaveEntitlement rejects a missing actorRole', async () => {
      await expect(
        hrService.upsertLeaveEntitlement({
          schoolId,
          employeeId,
          leaveTypeId: 'lt-annual',
          entitledDays: 5,
        })
      ).rejects.toThrow(/actorRole.*required|hr\.payroll\.manage|not authorized/i);
    });
  });

  describe('live path (mocked supabase)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_SUPABASE_URL', LIVE_URL);
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
    });

    it('allows upserting an employee payroll profile with compensation and banking details', async () => {
      tableResponses.employee_payroll_profiles = {
        data: [
          {
            id: 'pay-1',
            school_id: schoolId,
            employee_id: employeeId,
            effective_from: '2026-09-01',
            effective_to: null,
            base_salary: 3500000,
            currency: 'UGX',
            pay_basis: 'salaried',
            payment_method: 'bank_transfer',
            bank_name: 'Stanbic Bank',
            bank_account_number: '9030012345678',
            bank_account_name: 'David Musoke',
            nssf_applicable: true,
          },
        ],
        error: null,
      };

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
        actorRole: 'admin',
      });

      const profiles = await hrService.getEmployeePayrollProfiles(schoolId);
      const saved = profiles.find((p) => p.employee_id === employeeId);

      expect(saved).toBeDefined();
      expect(saved?.base_salary).toBe(3500000);
      expect(saved?.currency).toBe('UGX');
      expect(saved?.bank_name).toBe('Stanbic Bank');
      expect(saved?.bank_account_number).toBe('9030012345678');
      expect(saved?.nssf_applicable).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('employee_payroll_profiles');
    });

    it('closes the previous profile on update so exactly one active row remains', async () => {
      tableResponses.employee_payroll_profiles = {
        data: [
          {
            id: 'pay-2',
            school_id: schoolId,
            employee_id: employeeId,
            effective_from: '2026-10-01',
            effective_to: null,
            base_salary: 4200000,
            currency: 'UGX',
            nssf_applicable: true,
          },
        ],
        error: null,
      };

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
        actorRole: 'admin',
      });

      const profiles = await hrService.getEmployeePayrollProfiles(schoolId);
      const active = profiles.filter((p) => p.employee_id === employeeId && !p.effective_to);
      expect(active.length).toBe(1);
      expect(active[0].base_salary).toBe(4200000);
    });

    it('allows assigning custom leave entitlement days and computes effective balances', async () => {
      tableResponses.leave_types = {
        data: [
          {
            id: 'lt-annual',
            school_id: schoolId,
            code: 'annual',
            name: 'Annual Leave',
            is_paid: true,
            default_entitlement_days: 21,
            requires_evidence: false,
            color: '#059669',
            display_order: 1,
          },
        ],
        error: null,
      };
      tableResponses.leave_requests = { data: [], error: null };
      tableResponses.leave_entitlements = {
        data: [
          {
            id: 'ent-1',
            school_id: schoolId,
            employee_id: employeeId,
            leave_type_id: 'lt-annual',
            leave_year: 2026,
            entitled_days: 28,
          },
        ],
        error: null,
      };

      await hrService.upsertLeaveEntitlement({
        schoolId,
        employeeId,
        leaveTypeId: 'lt-annual',
        leaveYear: 2026,
        entitledDays: 28,
        actorRole: 'admin',
      });

      const balances = await hrService.getEffectiveBalances(schoolId, employeeId);
      const annualBalance = balances.find((b) => b.leaveTypeId === 'lt-annual');

      expect(annualBalance).toBeDefined();
      expect(annualBalance?.entitledDays).toBe(28);
    });

    it('leave-entitlement DB failure throws (never mock-shaped)', async () => {
      tableResponses.leave_types = { data: [], error: null };
      tableResponses.leave_requests = { data: [], error: null };
      tableResponses.leave_entitlements = { data: null, error: new Error('DB down') };
      await expect(hrService.getEffectiveBalances(schoolId, employeeId)).rejects.toThrow(
        /Failed to fetch leave entitlements/
      );
    });
  });
});
