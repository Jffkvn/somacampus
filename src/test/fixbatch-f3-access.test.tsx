/**
 * Fixbatch F3 — access decisions (timetable gate, matching panel, student codes).
 *
 * 1. Canonical /timetable mount gated to teacher/admin/principal via
 *    RequireAccess + ROUTE_ROLE_ALLOWLIST; nav item roles match; teachers
 *    keep their operational schedule (no legit flow breaks).
 * 2. MatchingPanel hides entirely when the candidates list is empty;
 *    renders only when candidates exist.
 * 3. Parent Online nav SKIPPED by decision — online content lives as a card
 *    in /parent/home (pinned: no separate nav item; 1-line code comment).
 * 4. Student role mirrors the parent portal set where applicable:
 *    portal.learning.view + announcements.view (calendar.view retained).
 *    Excluded by design: portal.children/fees (parent-side),
 *    portal.attendance (online-only learners see no attendance artifacts),
 *    messages.view (no student messaging surface).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { NAVIGATION_CONFIG } from '../config/navigation';
import { hasPermission, type UserRole } from '../config/permissions';
import { canAccessPath } from '../lib/teacherPrivacy';
import { MatchingPanel } from '../modules/online/OnlineAiPanels';

const authState = vi.hoisted(() => ({
  role: 'teacher' as UserRole,
}));

vi.mock('../lib/authContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: null,
    role: authState.role,
    fullName: 'Test User',
    schoolId: 'school-default',
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchDevRole: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { RequireAccess } from '../App';

/** All hrefs a role can reach through the sidebar (group + subitem role filters). */
function visibleHrefsFor(role: UserRole): string[] {
  const hrefs: string[] = [];
  for (const group of NAVIGATION_CONFIG) {
    if (group.roles && !group.roles.includes(role)) continue;
    if (group.href) hrefs.push(group.href);
    for (const sub of group.subItems ?? []) {
      if (sub.roles && !sub.roles.includes(role)) continue;
      hrefs.push(sub.href);
    }
  }
  return hrefs;
}

describe('F3.1: /timetable gate — teacher/admin/principal only', () => {
  it('allows teacher, admin, principal; denies parent, student, bursar', () => {
    expect(canAccessPath('teacher', '/timetable')).toBe(true);
    expect(canAccessPath('admin', '/timetable')).toBe(true);
    expect(canAccessPath('principal', '/timetable')).toBe(true);
    expect(canAccessPath('parent', '/timetable')).toBe(false);
    expect(canAccessPath('student', '/timetable')).toBe(false);
    expect(canAccessPath('bursar', '/timetable')).toBe(false);
  });

  it('teachers keep access (operational schedule — no legit flow breaks)', () => {
    expect(canAccessPath('teacher', '/timetable')).toBe(true);
    expect(visibleHrefsFor('teacher')).toContain('/timetable');
  });

  it('builder mount stays leadership-only (untouched)', () => {
    expect(canAccessPath('admin', '/planning/timetable/builder')).toBe(true);
    expect(canAccessPath('principal', '/planning/timetable/builder')).toBe(true);
    expect(canAccessPath('teacher', '/planning/timetable/builder')).toBe(false);
  });

  it('nav Master Timetable item roles match the gate; parent/student see no /timetable', () => {
    const academics = NAVIGATION_CONFIG.find((g) => g.id === 'academics');
    const master = academics?.subItems?.find((s) => s.href === '/timetable');
    expect(master?.roles?.sort()).toEqual(['admin', 'principal', 'teacher']);
    expect(visibleHrefsFor('parent')).not.toContain('/timetable');
    expect(visibleHrefsFor('student')).not.toContain('/timetable');
  });

  it('RequireAccess redirects a parent on /timetable to /parent/home; teacher renders', async () => {
    authState.role = 'parent';
    const first = render(
      <MemoryRouter initialEntries={['/timetable']}>
        <Routes>
          <Route
            path="/timetable"
            element={
              <RequireAccess path="/timetable">
                <div>ALLOWED:/timetable</div>
              </RequireAccess>
            }
          />
          <Route path="/parent/home" element={<div>LANDING:/parent/home</div>} />
          <Route path="/teacher/today" element={<div>LANDING:/teacher/today</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('LANDING:/parent/home')).toBeInTheDocument();
    expect(screen.queryByText('ALLOWED:/timetable')).not.toBeInTheDocument();
    first.unmount();

    authState.role = 'teacher';
    render(
      <MemoryRouter initialEntries={['/timetable']}>
        <Routes>
          <Route
            path="/timetable"
            element={
              <RequireAccess path="/timetable">
                <div>ALLOWED:/timetable</div>
              </RequireAccess>
            }
          />
          <Route path="/parent/home" element={<div>LANDING:/parent/home</div>} />
          <Route path="/teacher/today" element={<div>LANDING:/teacher/today</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('ALLOWED:/timetable')).toBeInTheDocument();
  });
});

describe('F3.2: MatchingPanel hides when candidates list is empty', () => {
  it('renders nothing when candidates is empty (no dead empty-state UI)', () => {
    const { container } = render(
      <MemoryRouter>
        <MatchingPanel requiredSubjectId="subj-math" candidates={[]} onApprove={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
    expect(document.body.textContent ?? '').not.toMatch(/No teacher candidates/i);
  });

  it('renders suggestions when candidates exist', () => {
    render(
      <MemoryRouter>
        <MatchingPanel
          requiredSubjectId="subj-math"
          candidates={[
            {
              id: 't-1',
              displayName: 'Sarah Namukasa',
              subjectIds: ['subj-math'],
              available: true,
              hasConflict: false,
            },
          ]}
          onApprove={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sarah Namukasa')).toBeInTheDocument();
    expect(screen.getByText('Select candidate')).toBeInTheDocument();
  });
});

describe('F3.3: parent Online nav skipped — online content lives in /parent/home', () => {
  it('family portal exposes home + calendar only (no redundant online item)', () => {
    const family = NAVIGATION_CONFIG.find((g) => g.id === 'family_portal');
    const hrefs = (family?.subItems ?? []).map((s) => s.href);
    expect(hrefs).toEqual(['/parent/home', '/calendar']);
  });
});

describe('F3.4: student portal/learning view codes mirror parent set', () => {
  it('student has portal.learning.view + announcements.view; calendar retained', () => {
    expect(hasPermission('student', 'portal.learning.view')).toBe(true);
    expect(hasPermission('student', 'announcements.view')).toBe(true);
    expect(hasPermission('student', 'calendar.view')).toBe(true);
  });

  it('student excluded from parent-side / staff-only codes (minimal)', () => {
    expect(hasPermission('student', 'portal.children.view')).toBe(false);
    expect(hasPermission('student', 'portal.fees.view')).toBe(false);
    expect(hasPermission('student', 'portal.attendance.view')).toBe(false);
    expect(hasPermission('student', 'messages.view')).toBe(false);
    expect(hasPermission('student', 'fees.view_accounts')).toBe(false);
  });
});
