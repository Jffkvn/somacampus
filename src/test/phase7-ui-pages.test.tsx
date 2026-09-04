import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeesPage } from '../modules/fees/FeesPage';
import { PayrollDashboardPage } from '../modules/payroll/PayrollDashboardPage';
import { MyHRPage } from '../modules/hr/MyHRPage';
import { ActivitiesPage } from '../modules/activities/ActivitiesPage';
import { ExpensesPage } from '../modules/expenses/ExpensesPage';
import { SchoolDashboardPage } from '../modules/leadership/SchoolDashboardPage';

// Mock recharts ResponsiveContainer to avoid jsdom zero-dimension warnings
vi.mock('recharts', async () => {
  const original = await vi.importActual<any>('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div style={{ width: 500, height: 300 }}>{children}</div>,
  };
});

// Mock leadershipService so it doesn't query remote Supabase during headless test
vi.mock('../modules/leadership/leadershipService', () => ({
  leadershipService: {
    getSchoolLeadershipDashboard: vi.fn().mockResolvedValue({
      schoolName: "Grace's Cambridge Centre",
      academicTerm: 'Term 1, 2026-2027',
      stats: {
        enrolledStudents: 342,
        activeTeachers: 28,
        attendanceRate: 94.2,
        lessonsCompleted: 18,
        lessonsExpected: 24,
      },
      attendanceTrend: [
        { day: 'Mon', studentRate: 92, staffRate: 96 },
        { day: 'Tue', studentRate: 95, staffRate: 98 },
      ],
      activeLessons: [],
      alerts: [],
    }),
  },
}));

describe('Phase 7 UI Pages & Components Suite', () => {
  describe('FeesPage (School Finance & Student Accounts)', () => {
    it('renders KPI stat cards and student fee accounts ledger', async () => {
      render(
        <MemoryRouter>
          <FeesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Fee Accounts & Clearance')).toBeInTheDocument();
      });

      expect(screen.getByText('Total Assessed')).toBeInTheDocument();
      expect(screen.getByText('Collected Payments')).toBeInTheDocument();
      expect(screen.getByText('Outstanding Balance')).toBeInTheDocument();
      expect(screen.getByText('Student Accounts Ledger')).toBeInTheDocument();

      // Verify Rapid Intake Modal opens
      const recordBtn = screen.getByRole('button', { name: /record payment/i });
      fireEvent.click(recordBtn);
      expect(screen.getByText('Record Fee Payment')).toBeInTheDocument();
      expect(screen.getByText(/Automated Allocation:/i)).toBeInTheDocument();
    });
  });

  describe('PayrollDashboardPage (Native Uganda Payroll Engine)', () => {
    it('renders period selector, 5-state lifecycle stepper, export buttons, and payroll lines', async () => {
      render(
        <MemoryRouter>
          <PayrollDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Staff Payroll & Statutory Remittances')).toBeInTheDocument();
      });

      // Period selector
      expect(screen.getAllByText(/September 2026/i).length).toBeGreaterThan(0);

      // Statutory exports
      expect(screen.getByRole('button', { name: /ura paye/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /nssf schedule/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /bank eft/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /mtn momo/i })).toBeInTheDocument();

      // Payroll lines table
      expect(screen.getByText('Employee')).toBeInTheDocument();
      expect(screen.getByText('Worker Class')).toBeInTheDocument();
      expect(screen.getByText('Gross Salary')).toBeInTheDocument();
      expect(screen.getByText('Net Pay')).toBeInTheDocument();

      // Verify staff lines exist
      expect(screen.getByText('David Kato')).toBeInTheDocument();
      expect(screen.getByText('Sarah Nabwire')).toBeInTheDocument();
    });
  });

  describe('MyHRPage (Staff Submenu Views: Leave, Advances, Payslips)', () => {
    it('renders leave management with effective balances and apply for leave modal', async () => {
      render(
        <MemoryRouter>
          <MyHRPage section="leave" />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Leave & Balances' })).toBeInTheDocument();
      });

      // Effective balances
      expect(screen.getAllByText('Annual Leave').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Sick Leave').length).toBeGreaterThan(0);

      // Apply for Leave modal
      const applyLeaveBtn = screen.getByRole('button', { name: /apply for leave/i });
      fireEvent.click(applyLeaveBtn);
      expect(screen.getByRole('heading', { level: 3, name: 'Apply for Leave' })).toBeInTheDocument();
      expect(screen.getByText('Day Portion')).toBeInTheDocument();
    });

    it('renders salary advances submenu view without tabs', async () => {
      render(
        <MemoryRouter>
          <MyHRPage section="advances" />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Salary Advances' })).toBeInTheDocument();
      });

      expect(screen.getByText('Salary Advance Policy Guidelines')).toBeInTheDocument();
      expect(screen.getByText('Salary Advance History & Repayments')).toBeInTheDocument();
    });

    it('renders my payslips submenu view with verified records', async () => {
      render(
        <MemoryRouter>
          <MyHRPage section="payslips" />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'My Payslips' })).toBeInTheDocument();
      });

      expect(screen.getByText('My Official Salary Payslips')).toBeInTheDocument();
      expect(screen.getByText('Net Take-Home')).toBeInTheDocument();
    });
  });

  describe('ActivitiesPage (Co-Curricular & Teacher Financial Firewall)', () => {
    it('renders activity selector and enforces teacher financial privacy firewall on roster', async () => {
      render(
        <MemoryRouter>
          <ActivitiesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('School Activities & Co-Curricular Roster')).toBeInTheDocument();
      });

      // Teacher Financial Firewall banner
      expect(
        screen.getByText(/Teacher & Coach Financial Privacy Firewall Active/i)
      ).toBeInTheDocument();

      // Activities list (using getAllByText since name appears in selector card and active header)
      expect(screen.getAllByText('Competitive Swimming Squad').length).toBeGreaterThan(0);
      expect(screen.getByText('Junior Robotics & STEM Club')).toBeInTheDocument();

      // Operational clearances on roster
      expect(screen.getByText('Operational Status')).toBeInTheDocument();
      expect(screen.getByText('Clearance Basis')).toBeInTheDocument();

      // Verify ZERO fee balances or currency symbols in the participant table
      const participantRosterTable = screen.getByRole('table');
      expect(participantRosterTable.textContent).not.toContain('UGX');
      expect(participantRosterTable.textContent).not.toContain('arrears');
      expect(participantRosterTable.textContent).not.toContain('balance');
    });
  });

  describe('ExpensesPage (School Operating Expenses)', () => {
    it('renders operating expenditure KPI cards, category filters, and record expense modal', async () => {
      render(
        <MemoryRouter>
          <ExpensesPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('School Operating Expenses')).toBeInTheDocument();
      });

      expect(screen.getByText('Total Term Expenditure')).toBeInTheDocument();
      expect(screen.getByText('Food & Catering')).toBeInTheDocument();
      expect(screen.getByText('Campus Utilities')).toBeInTheDocument();
      expect(screen.getByText('Operating Expenses Ledger')).toBeInTheDocument();

      // Record Expense Modal
      const recordBtn = screen.getByRole('button', { name: /record expense/i });
      fireEvent.click(recordBtn);
      expect(screen.getByText('Record Operating Expense')).toBeInTheDocument();
    });
  });

  describe('SchoolDashboardPage (Institutional Cash Movement Integration)', () => {
    it('renders Institutional Cash Movement card with Money In vs Money Out in leadership dashboard', async () => {
      render(
        <MemoryRouter>
          <SchoolDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Executive Leadership Cockpit')).toBeInTheDocument();
      });

      // Cash Flow card
      expect(screen.getByText(/Money In vs. Money Out/i)).toBeInTheDocument();
      expect(screen.getByText('Net Cash Movement')).toBeInTheDocument();
      expect(screen.getByText('Money In')).toBeInTheDocument();
      expect(screen.getByText('Money Out')).toBeInTheDocument();
      expect(screen.getByText('Staff Payroll Disbursed')).toBeInTheDocument();
      expect(screen.getByText('Operating Expenses (Lunch/Bills)')).toBeInTheDocument();
    });
  });
});
