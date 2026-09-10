import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import { staffService } from '../modules/staff/staffService';
import { NAVIGATION_CONFIG } from '../config/navigation';
import type { HireStaffPayload } from '../types/domain';

describe('Staff Hire Compensation & Navigation Integrity (Freeze Package Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
  });

  const basePayload: HireStaffPayload = {
    schoolId: 'sch-test-01',
    firstName: 'Sarah',
    lastName: 'Namubiru',
    role: 'Primary Teacher',
    department: 'Academics',
    isTeacher: true,
    hireDate: '2026-09-08',
    contractType: 'permanent',
  };

  it('1. hireStaff with agreed salary creates employee and payroll profile with correct contracts', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'emp-sarah-123', error: null });

    const insertedRows: Record<string, unknown>[] = [];
    const updateCalls: Array<{ table: string; payload: unknown }> = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'employee_payroll_profiles') {
        return {
          update: vi.fn((data: unknown) => {
            updateCalls.push({ table, payload: data });
            return {
              eq: vi.fn(() => ({
                is: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            };
          }),
          insert: vi.fn((data: Record<string, unknown>) => {
            insertedRows.push(data);
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      };
    });

    const payloadWithSalary: HireStaffPayload = {
      ...basePayload,
      baseSalary: 2800000,
      currency: 'UGX',
      paymentMethod: 'bank_transfer',
    };

    const empId = await staffService.hireStaff(payloadWithSalary, 'principal');

    expect(empId).toBe('emp-sarah-123');
    expect(mockRpc).toHaveBeenCalledWith(
      'hire_staff_member',
      expect.objectContaining({
        p_school_id: 'sch-test-01',
        p_first_name: 'Sarah',
        p_last_name: 'Namubiru',
      })
    );

    // Verify payroll profile insertion
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toEqual({
      school_id: 'sch-test-01',
      employee_id: 'emp-sarah-123',
      effective_from: '2026-09-08',
      effective_to: null,
      pay_basis: 'salaried',
      tax_treatment: 'local',
      base_salary: 2800000,
      currency: 'UGX',
      nssf_applicable: true,
      payment_method: 'bank_transfer',
    });
  });

  it('2. hireStaff with zero/blank salary creates employee without creating payroll profile (Pending Setup)', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'emp-volunteer-456', error: null });

    const insertedRows: Record<string, unknown>[] = [];
    mockFrom.mockImplementation(() => ({
      insert: vi.fn((data: Record<string, unknown>) => {
        insertedRows.push(data);
        return Promise.resolve({ data: null, error: null });
      }),
    }));

    const payloadNoSalary: HireStaffPayload = {
      ...basePayload,
      baseSalary: null,
    };

    const empId = await staffService.hireStaff(payloadNoSalary, 'admin');

    expect(empId).toBe('emp-volunteer-456');
    // No employee_payroll_profiles row should be created
    expect(insertedRows).toHaveLength(0);
  });

  it('3. partial-failure resilience: if payroll profile insert fails, hire still succeeds without throwing', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'emp-resilient-789', error: null });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockFrom.mockImplementation((table: string) => {
      if (table === 'employee_payroll_profiles') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
          insert: vi.fn(() =>
            Promise.resolve({
              data: null,
              error: { message: 'DB connection timeout on profiles table' },
            })
          ),
        };
      }
      return {};
    });

    const payloadWithSalary: HireStaffPayload = {
      ...basePayload,
      baseSalary: 1500000,
    };

    // Must NOT throw: employee was created, fail-open on identity to prevent duplicate creation
    const empId = await staffService.hireStaff(payloadWithSalary, 'principal');

    expect(empId).toBe('emp-resilient-789');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('payroll profile creation failed'),
      expect.anything()
    );

    warnSpy.mockRestore();
  });

  it('4. navigation integrity: Online Centre is top-level and removed from Finance', () => {
    const onlineCentreGroup = NAVIGATION_CONFIG.find((g) => g.id === 'online_centre');
    expect(onlineCentreGroup).toBeDefined();
    expect(onlineCentreGroup?.label).toBe('Online Centre');

    const subItemHrefs = (onlineCentreGroup?.subItems || []).map((s) => s.href);
    expect(subItemHrefs).toContain('/online/centre');
    expect(subItemHrefs).toContain('/teaching/online');

    const financeGroup = NAVIGATION_CONFIG.find((g) => g.id === 'finance');
    const financeSubHrefs = (financeGroup?.subItems || []).map((s) => s.href);
    expect(financeSubHrefs).not.toContain('/online/centre');
  });
});
