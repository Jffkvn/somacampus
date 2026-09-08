/**
 * Batch B Task 2 — HR trust UI tests (RED→GREEN).
 *
 * 1. MyHRPage must surface a "could not load holidays" notice when the
 *    school-holiday fetch fails, instead of silently computing weekends-only.
 * 2. HRApprovalsPage must surface an error when decideLeaveRequest /
 *    decideAdvanceRequest resolves false (boolean contract kept), instead of
 *    going silent with a fake success.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

const authState = vi.hoisted(() => ({
  role: 'teacher' as string,
  schoolId: 'school-default' as string | null,
  fullName: 'Sarah Nabwire',
  userId: 'user-1' as string | undefined,
}));

vi.mock('../lib/authContext', () => ({
  useAuth: () => ({
    user: authState.userId ? { id: authState.userId } : null,
    session: null,
    role: authState.role,
    fullName: authState.fullName,
    schoolId: authState.schoolId,
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchDevRole: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

import { hrService } from '../modules/hr/hrService';
import { payrollService } from '../modules/payroll/payrollService';
import { MyHRPage } from '../modules/hr/MyHRPage';
import { HRApprovalsPage } from '../modules/hr/HRApprovalsPage';

beforeEach(() => {
  vi.resetAllMocks();
  authState.role = 'teacher';
  authState.schoolId = 'school-default';
  authState.fullName = 'Sarah Nabwire';
  authState.userId = 'user-1';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MyHRPage holiday-load failure surfaces (no silent weekends-only)', () => {
  it('shows a "could not load holidays" notice when getSchoolHolidays rejects', async () => {
    vi.spyOn(hrService, 'getEffectiveBalances').mockResolvedValue([]);
    vi.spyOn(hrService, 'getMyLeaveRequests').mockResolvedValue([]);
    vi.spyOn(hrService, 'getMyAdvances').mockResolvedValue([]);
    vi.spyOn(payrollService, 'getMyPayslips').mockResolvedValue([]);
    vi.spyOn(payrollService, 'getPayrollProfile').mockResolvedValue(null);
    vi.spyOn(hrService, 'getSchoolHolidays').mockRejectedValue(new Error('DB down'));

    render(
      <MemoryRouter initialEntries={['/people/hr/leave']}>
        <MyHRPage section="leave" />
      </MemoryRouter>
    );

    await screen.findByText(/could not load holidays/i);
  });
});

describe('HRApprovalsPage surfaces decide-false instead of fake success', () => {
  function mockQueue() {
    vi.spyOn(hrService, 'getPendingApprovals').mockResolvedValue({
      leaveRequests: [
        {
          id: 'req-1',
          schoolId: 'school-default',
          employeeId: 'emp-1',
          employeeName: 'David Otim',
          leaveTypeId: 'lt-sick',
          leaveTypeName: 'Sick Leave',
          startDate: '2026-10-01',
          endDate: '2026-10-02',
          workingDays: 2,
          dayPortion: 'full',
          reason: 'Doctor appointment',
          status: 'pending',
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      ],
      advances: [
        {
          id: 'adv-1',
          schoolId: 'school-default',
          employeeId: 'emp-1',
          employeeName: 'David Otim',
          amount: 400000,
          balanceRemaining: 400000,
          monthlyDeduction: 200000,
          numInstalments: 2,
          reason: 'Emergency repair',
          status: 'pending',
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      ],
    } as any);
    vi.spyOn(hrService, 'getLeaveTypes').mockResolvedValue([]);
    vi.spyOn(hrService, 'getEmployeePayrollProfiles').mockResolvedValue([]);
  }

  it('leave approve resolving false shows an error (no success message)', async () => {
    authState.role = 'admin';
    mockQueue();
    vi.spyOn(hrService, 'decideLeaveRequest').mockResolvedValue(false);

    render(<HRApprovalsPage />);
    const approveBtn = await screen.findByRole('button', { name: /^approve$/i });
    fireEvent.click(approveBtn);

    await screen.findByText(/not updated|failed to approve/i);
    expect(screen.queryByText(/approved and balance deducted/i)).not.toBeInTheDocument();
  });

  it('advance approve resolving false shows an error (no success message)', async () => {
    authState.role = 'admin';
    mockQueue();
    vi.spyOn(hrService, 'decideAdvanceRequest').mockResolvedValue(false);

    render(<HRApprovalsPage />);
    const advancesTab = await screen.findByRole('button', { name: /salary advances/i });
    fireEvent.click(advancesTab);
    const approveBtn = await screen.findByRole('button', { name: /approve advance/i });
    fireEvent.click(approveBtn);

    await screen.findByText(/not updated|failed to approve/i);
    expect(screen.queryByText(/scheduled for payroll deductions/i)).not.toBeInTheDocument();
  });
});
