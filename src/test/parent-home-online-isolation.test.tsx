/**
 * Phase 9F: ParentHomePage online-fetch isolation.
 *
 * The online-learning fetch must degrade to an empty online card only —
 * an online rejection must NOT blank the main overview.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { mockGetParentChildren, mockGetChildOverview, mockGetChildOnlineOverview } = vi.hoisted(() => ({
  mockGetParentChildren: vi.fn(),
  mockGetChildOverview: vi.fn(),
  mockGetChildOnlineOverview: vi.fn(),
}));

vi.mock('../lib/authContext', () => ({
  useAuth: () => ({
    user: { id: 'user-parent-1' },
    session: null,
    role: 'parent',
    fullName: 'Guardian One',
    schoolId: 'school-1',
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchDevRole: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('../modules/parent/parentService', () => ({
  parentService: {
    getParentChildren: mockGetParentChildren,
    getChildOverview: mockGetChildOverview,
    getChildOnlineOverview: mockGetChildOnlineOverview,
  },
}));

import { ParentHomePage } from '../modules/parent/ParentHomePage';

const CHILD = {
  studentId: 'stu-A',
  name: 'Amina Child',
  admission: '2026/0201',
  class: 'Stage 5 Blue',
};

const OVERVIEW: any = {
  child: CHILD,
  academic: { studentId: 'stu-A', recentLessonNotes: [], observations: [], assignments: [] },
  attendance: {
    studentId: 'stu-A',
    percentage: 100,
    present: 10,
    absent: 0,
    late: 0,
    excused: 0,
    total: 10,
    recentRecords: [],
  },
  finance: null,
  activities: [],
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockGetParentChildren.mockReset();
  mockGetChildOverview.mockReset();
  mockGetChildOnlineOverview.mockReset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('ParentHomePage online-fetch isolation', () => {
  it('renders the main overview with an empty online card when the online fetch rejects', async () => {
    mockGetParentChildren.mockResolvedValue([CHILD]);
    mockGetChildOverview.mockResolvedValue(OVERVIEW);
    mockGetChildOnlineOverview.mockRejectedValue(new Error('Failed to load online learning.'));

    render(<ParentHomePage />);

    // Main overview intact: child header + section cards render.
    await waitFor(() => {
      expect(screen.getAllByText('Amina Child').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Learning')).toBeInTheDocument();
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getByText('Online Learning')).toBeInTheDocument();

    // Online degrades to the empty card — main overview is NOT blanked.
    expect(screen.getByText('No online learning yet')).toBeInTheDocument();
    expect(screen.queryByText('No overview available')).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not load this child/)).not.toBeInTheDocument();
  });

  it('still blanks the overview when the MAIN fetch rejects', async () => {
    mockGetParentChildren.mockResolvedValue([CHILD]);
    mockGetChildOverview.mockRejectedValue(new Error('boom'));
    mockGetChildOnlineOverview.mockResolvedValue(null);

    render(<ParentHomePage />);

    await waitFor(() => {
      expect(screen.getByText('No overview available')).toBeInTheDocument();
    });
  });
});
