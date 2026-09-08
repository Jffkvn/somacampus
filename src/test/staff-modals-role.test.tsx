/**
 * Review blocker — staff modals must thread the viewer's role into the
 * gated payroll upserts (hr.payroll.manage), or every live save throws.
 *
 * - admin role: upsert called WITH actorRole 'admin' (save succeeds).
 * - denied role (teacher): gate error surfaces in the modal, never silent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

const authState = vi.hoisted(() => ({
  role: 'admin' as string,
  schoolId: 'school-default' as string | null,
}));

vi.mock('../lib/authContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: null,
    role: authState.role,
    fullName: 'Test Admin',
    schoolId: authState.schoolId,
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchDevRole: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

import { hrService } from '../modules/hr/hrService';
import { StaffPayrollEditModal } from '../modules/staff/StaffPayrollEditModal';
import { StaffLeaveEntitlementModal } from '../modules/staff/StaffLeaveEntitlementModal';
import type { StaffDossier, LeaveType } from '../types/domain';

const dossier = {
  id: 'emp-1',
  personId: 'person-1',
  schoolId: 'school-default',
  employeeNumber: 'STAFF-001',
  personal: {
    firstName: 'David',
    lastName: 'Otim',
    fullName: 'David Otim',
    email: null,
    phone: null,
    dateOfBirth: null,
    gender: null,
    nationalId: null,
    nationality: null,
    address: null,
    photoUrl: null,
  },
  employment: {
    role: 'teacher',
    department: 'Science',
    isTeacher: true,
    status: 'active',
    hireDate: null,
    exitDate: null,
    exitReason: null,
    contractType: null,
    qualification: null,
    notes: null,
  },
  officialSubjects: [],
  activeAllocations: [],
  leaveBalances: [],
  payrollSummary: {
    canView: true,
    profileConfigured: true,
    baseSalary: 2500000,
    bankName: null,
    accountNumber: null,
    bankAccountName: null,
    payBasis: 'salaried',
    paymentMethod: 'bank_transfer',
    nssfApplicable: true,
    currency: 'UGX',
    recentPayslipsCount: 0,
  },
  documents: [],
} as StaffDossier;

const leaveTypes: LeaveType[] = [
  {
    id: 'lt-annual',
    schoolId: 'school-default',
    code: 'annual',
    name: 'Annual Leave',
    isPaid: true,
    defaultEntitlementDays: 21,
    requiresEvidence: false,
    color: '#059669',
    displayOrder: 1,
  },
];

function submitForm() {
  const form = document.querySelector('form');
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
}

beforeEach(() => {
  vi.resetAllMocks();
  authState.role = 'admin';
  authState.schoolId = 'school-default';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('StaffPayrollEditModal threads actorRole', () => {
  it("calls upsertPayrollProfile WITH the viewer's admin role", async () => {
    const upsertSpy = vi.spyOn(hrService, 'upsertPayrollProfile').mockResolvedValue(undefined);

    render(
      <StaffPayrollEditModal isOpen onClose={vi.fn()} dossier={dossier} onSuccess={vi.fn()} />
    );
    submitForm();

    await waitFor(() => {
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: 'admin', employeeId: 'emp-1', baseSalary: 2500000 })
      );
    });
  });

  it('denied role surfaces the gate error in the modal (not silent)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
    authState.role = 'teacher';

    render(
      <StaffPayrollEditModal isOpen onClose={vi.fn()} dossier={dossier} onSuccess={vi.fn()} />
    );
    submitForm();

    await screen.findByText(/not authorized/i);
  });
});

describe('StaffLeaveEntitlementModal threads actorRole', () => {
  it("calls upsertLeaveEntitlement WITH the viewer's admin role", async () => {
    vi.spyOn(hrService, 'getLeaveTypes').mockResolvedValue(leaveTypes);
    const upsertSpy = vi.spyOn(hrService, 'upsertLeaveEntitlement').mockResolvedValue(undefined);

    render(
      <StaffLeaveEntitlementModal isOpen onClose={vi.fn()} dossier={dossier} onSuccess={vi.fn()} />
    );
    await screen.findByText(/Annual Leave.*Default: 21 days/);
    submitForm();

    await waitFor(() => {
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: 'admin', employeeId: 'emp-1', leaveTypeId: 'lt-annual' })
      );
    });
  });

  it('denied role surfaces the gate error in the modal (not silent)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
    authState.role = 'teacher';
    vi.spyOn(hrService, 'getLeaveTypes').mockResolvedValue(leaveTypes);

    render(
      <StaffLeaveEntitlementModal isOpen onClose={vi.fn()} dossier={dossier} onSuccess={vi.fn()} />
    );
    await screen.findByText(/Annual Leave.*Default: 21 days/);
    submitForm();

    await screen.findByText(/not authorized/i);
  });
});
