/**
 * Batch A Task 4 — Student print-all-tabs (TDD).
 *
 * Only the active tab body is rendered, so printing the dossier drops the
 * other six tabs. StaffDetailPage already renders every tab body in the DOM
 * with a `hidden print:block` fallback; StudentDetailPage must do the same.
 *
 * jsdom cannot evaluate print media queries, so this asserts the honest
 * proxy: all 7 tab panels exist in the DOM regardless of activeTab, with
 * inactive panels carrying the `hidden print:block` fallback classes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock('../lib/authContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1' },
    session: null,
    role: 'admin',
    fullName: 'Admin User',
    schoolId: 'school-default',
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchDevRole: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

const dossierMock = {
  studentId: 'stud-1',
  admissionNumber: '2026/0001',
  status: 'active',
  currentClass: 'Primary 5 Blue',
  createdAt: '2026-01-10',
  personal: {
    fullName: 'Print Proxy Pupil',
    firstName: 'Print',
    lastName: 'Pupil',
    dateOfBirth: '2015-01-01',
    gender: 'female',
    nationality: 'Ugandan',
    nationalId: null,
    address: 'Kampala',
    photoUrl: null,
  },
  enrolmentHistory: [
    {
      id: 'e1',
      className: 'Primary 5',
      streamName: 'Blue',
      academicYearName: '2026',
      startDate: '2026-01-01',
      endDate: null,
      status: 'active',
      exitReason: null,
    },
  ],
  guardians: [
    {
      id: 'g1',
      name: 'Guardian One',
      relationship: 'mother',
      phone: '+256700000001',
      email: null,
      isPrimary: true,
      address: null,
    },
  ],
  emergencyContacts: [
    {
      id: 'ec1',
      name: 'Emergency One',
      relationship: 'aunt',
      phone: '+256711111111',
      priority: 1,
      address: null,
    },
  ],
  medical: {
    alertOnly: false,
    allergies: null,
    conditions: null,
    medication: null,
    bloodGroup: 'O+',
    restrictions: null,
    notes: null,
  },
  documents: [],
  finance: { totalBilled: 1000000, totalPaid: 600000, balance: 400000 },
};

const profileMock = {
  fullName: 'Print Proxy Pupil',
  admissionNumber: '2026/0001',
  className: 'Primary 5 Blue',
  academicOverview: {
    attendancePercentage: 96,
    formalAveragePct: 78,
    formalAssessmentsCount: 4,
    diagnosticParticipationPct: 90,
    diagnosticCount: 10,
    observationsCount: 3,
    activeInterventionsCount: 0,
  },
  subjectTrajectories: [],
  emergingPatterns: [],
  activeInterventions: [],
  pastInterventions: [],
  evidenceTimeline: [],
};

vi.mock('../modules/students/studentService', () => ({
  studentService: { getStudentDossier: vi.fn(async () => dossierMock) },
}));

vi.mock('../modules/intelligence/learningIntelligenceService', () => ({
  learningIntelligenceService: {
    getLongitudinalProfile: vi.fn(async () => profileMock),
    recordInterventionOutcome: vi.fn(),
  },
}));

import { StudentDetailPage } from '../modules/students/StudentDetailPage';

const TABS = [
  'personal',
  'enrolment',
  'guardians',
  'health',
  'documents',
  'academics',
  'finance',
] as const;

describe('StudentDetailPage print-all-tabs (Batch A Task 4)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  });

  it('renders all 7 tab panels in the DOM regardless of the active tab', async () => {
    render(
      <MemoryRouter initialEntries={['/students/stud-1']}>
        <Routes>
          <Route path="/students/:studentId" element={<StudentDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Print Proxy Pupil')).toBeInTheDocument();
    });

    // Default activeTab is 'personal' — every other panel must still be in
    // the DOM so print captures all tabs, not just the visible one.
    for (const tab of TABS) {
      expect(
        document.querySelector(`[data-testid="student-tab-panel-${tab}"]`),
        `tab panel "${tab}" missing from DOM`
      ).not.toBeNull();
    }
  });

  it('inactive panels carry the hidden print:block fallback; the active panel does not', async () => {
    render(
      <MemoryRouter initialEntries={['/students/stud-1']}>
        <Routes>
          <Route path="/students/:studentId" element={<StudentDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Print Proxy Pupil')).toBeInTheDocument();
    });

    const active = document.querySelector('[data-testid="student-tab-panel-personal"]')!;
    expect(active.className).not.toMatch(/(^|\s)hidden(\s|$)/);

    for (const tab of TABS.filter((t) => t !== 'personal')) {
      const panel = document.querySelector(
        `[data-testid="student-tab-panel-${tab}"]`
      )!;
      expect(panel.className).toMatch(/(^|\s)hidden(\s|$)/);
      expect(panel.className).toMatch(/print:block/);
    }
  });
});
