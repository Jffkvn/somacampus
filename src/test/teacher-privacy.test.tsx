/**
 * D10+D11 hardening (RED→GREEN): teacher financial-blindness matrix.
 *
 * Teacher MUST NOT see: student fee balances / payment history / amounts,
 * parent financial info, payroll (other staff), expenses, cash position.
 * Teacher MAY see: own payslip/HR/leave/advances, operational activity
 * clearance labels, authorized academics.
 *
 * Scope: teacher-blindness ONLY. No academic logic touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';

import { NAVIGATION_CONFIG } from '../config/navigation';
import { ROLE_PERMISSIONS, hasPermission, getRoleLandingRoute, type UserRole } from '../config/permissions';
import {
  canAccessPath,
  canViewStudentFees,
  shouldShowStudentFeeRow,
} from '../lib/teacherPrivacy';
import { toParticipantProjection } from '../modules/activities/activityService';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// Controllable auth identity for router-gate + MyHRPage tests. Default is a
// teacher; each test sets the role it needs before render.
const authState = vi.hoisted(() => ({
  role: 'teacher' as UserRole,
  schoolId: 'school-default' as string | null,
  fullName: 'Test Teacher',
}));

vi.mock('../lib/authContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
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

vi.mock('../modules/auth/identity', () => ({
  resolveMyEmployeeId: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { payrollService } from '../modules/payroll/payrollService';
import { hrService } from '../modules/hr/hrService';
import { resolveMyEmployeeId } from '../modules/auth/identity';
import { MyHRPage } from '../modules/hr/MyHRPage';
import { RequireAccess } from '../App';
import { StudentDetailPage } from '../modules/students/StudentDetailPage';
import { learningIntelligenceService } from '../modules/intelligence/learningIntelligenceService';

vi.mock('../modules/intelligence/learningIntelligenceService', () => ({
  learningIntelligenceService: {
    getLongitudinalProfile: vi.fn(),
    recordInterventionOutcome: vi.fn(),
  },
}));

const REAL_URL = 'https://prod-real-db.supabase.co';
const RLS_DENY = { code: '42501', message: 'permission denied for table (RLS)' };
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;

function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}

function restoreMockEnv() {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
}

function mockQuery(result: { data: any; error: any }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function mockFrom(resultByTable: Record<string, { data: any; error: any }>) {
  (supabase.from as any).mockImplementation((table: string) => {
    const result = resultByTable[table] ?? resultByTable['*'] ?? { data: [], error: null };
    return mockQuery(result);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  authState.role = 'teacher';
  authState.schoolId = 'school-default';
  authState.fullName = 'Test Teacher';
});

afterEach(() => {
  restoreMockEnv();
});

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

describe('D10(a): teacher navigation contains zero finance/payroll/expenses routes', () => {
  const MONEY_HREFS = ['/fees', '/fees/import', '/expenses', '/payroll', '/administration/payroll'];

  it('teacher sidebar exposes no money route', () => {
    const hrefs = visibleHrefsFor('teacher');
    for (const money of MONEY_HREFS) {
      expect(hrefs).not.toContain(money);
    }
  });

  it('teacher keeps own HR self-service + operational routes', () => {
    const hrefs = visibleHrefsFor('teacher');
    expect(hrefs).toContain('/people/hr/payslips');
    expect(hrefs).toContain('/people/hr/leave');
    expect(hrefs).toContain('/people/hr/advances');
    expect(hrefs).toContain('/activities');
  });

  it('authorized roles keep finance routes (bursar/admin/principal)', () => {
    expect(visibleHrefsFor('bursar')).toContain('/fees');
    expect(visibleHrefsFor('admin')).toContain('/payroll');
    expect(visibleHrefsFor('principal')).toContain('/expenses');
  });
});

describe('D10(b): teacher role lacks finance permission codes', () => {
  const FINANCE_CODES = [
    'fees.view_accounts',
    'fees.import_reconcile',
    'expenses.view',
    'hr.staff.view',
    'hr.payroll.view',
    'hr.payroll.manage',
  ] as const;

  it('teacher has none of the finance codes', () => {
    for (const code of FINANCE_CODES) {
      expect(ROLE_PERMISSIONS.teacher).not.toContain(code);
      expect(hasPermission('teacher', code)).toBe(false);
    }
  });

  it('teacher keeps academic + self-service codes', () => {
    expect(hasPermission('teacher', 'student.profile.view')).toBe(true);
    expect(hasPermission('teacher', 'teacher.reflection.view_own')).toBe(true);
    expect(hasPermission('teacher', 'attendance.student.record')).toBe(true);
  });

  it('finance codes remain with authorized roles', () => {
    expect(hasPermission('bursar', 'fees.view_accounts')).toBe(true);
    expect(hasPermission('admin', 'hr.payroll.manage')).toBe(true);
    expect(hasPermission('principal', 'fees.view_accounts')).toBe(true);
  });

  it('canViewStudentFees mirrors fees.view_accounts', () => {
    expect(canViewStudentFees('teacher')).toBe(false);
    expect(canViewStudentFees('bursar')).toBe(true);
    expect(canViewStudentFees('principal')).toBe(true);
    expect(canViewStudentFees('admin')).toBe(true);
  });

  it('route grants pin matching feature codes (Issue 2 alignment)', () => {
    // /fees <-> fees.view_accounts (bursar, admin, principal)
    for (const r of ['bursar', 'admin', 'principal'] as const) {
      expect(hasPermission(r, 'fees.view_accounts')).toBe(true);
    }
    // /fees/import <-> fees.import_reconcile (bursar, admin; principal denied)
    expect(hasPermission('bursar', 'fees.import_reconcile')).toBe(true);
    expect(hasPermission('admin', 'fees.import_reconcile')).toBe(true);
    expect(hasPermission('principal', 'fees.import_reconcile')).toBe(false);
    // /expenses <-> expenses.view (bursar, admin, principal; teacher denied)
    for (const r of ['bursar', 'admin', 'principal'] as const) {
      expect(hasPermission(r, 'expenses.view')).toBe(true);
    }
    expect(hasPermission('teacher', 'expenses.view')).toBe(false);
    // /payroll + /administration/payroll <-> hr.payroll.view (same grants)
    for (const r of ['bursar', 'admin', 'principal'] as const) {
      expect(hasPermission(r, 'hr.payroll.view')).toBe(true);
    }
    expect(hasPermission('teacher', 'hr.payroll.view')).toBe(false);
    // /dashboard/school <-> school.dashboard.view; /admin/overview <-> school.settings.manage
    expect(hasPermission('principal', 'school.dashboard.view')).toBe(true);
    expect(hasPermission('teacher', 'school.dashboard.view')).toBe(false);
    expect(hasPermission('admin', 'school.settings.manage')).toBe(true);
    expect(hasPermission('teacher', 'school.settings.manage')).toBe(false);
  });
});

describe('D10(c): StudentDetail fee row stays hidden without readable clearance', () => {
  it('gate hides the row when clearance is undefined or null', () => {
    expect(shouldShowStudentFeeRow(undefined)).toBe(false);
    expect(shouldShowStudentFeeRow(null)).toBe(false);
  });

  it('gate shows the row only when a readable clearance status exists', () => {
    expect(shouldShowStudentFeeRow('cleared')).toBe(true);
    expect(shouldShowStudentFeeRow('partial')).toBe(true);
  });

  it('rendered StudentDetailPage exposes zero money content to a teacher', async () => {
    (learningIntelligenceService.getLongitudinalProfile as any).mockResolvedValue({
      fullName: 'Amari Kyomugisha',
      admissionNumber: '2026/0142',
      className: 'Stage 5 Blue',
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
    });
    render(
      <MemoryRouter initialEntries={['/students/stud-amari']}>
        <Routes>
          <Route path="/students/:studentId" element={<StudentDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Amari Kyomugisha')).toBeInTheDocument();
    });
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/UGX/);
    expect(body).not.toMatch(/fee balance/i);
    expect(body).not.toMatch(/payment history/i);
    expect(body).not.toMatch(/clearance/i);
    expect(body).not.toMatch(/arrears/i);
  });
});

describe('D10(d): payslip isolation — another employee id yields nothing', () => {
  it('mock env: requesting another employee id returns empty, never their slips', async () => {
    restoreMockEnv();
    const res = await payrollService.getMyPayslips('emp-other-1');
    expect(res).toEqual([]);
  });

  it('mock env: school-scoped read for a foreign school returns empty', async () => {
    restoreMockEnv();
    const res = await payrollService.getMyPayslips('emp-teacher-1', 'school-B');
    expect(res).toEqual([]);
  });

  it('mock env: own payslips still resolve for the matching employee', async () => {
    restoreMockEnv();
    const res = await payrollService.getMyPayslips('emp-teacher-1');
    expect(res.length).toBeGreaterThan(0);
    for (const slip of res) {
      expect(slip.employeeId).toBe('emp-teacher-1');
    }
  });

  it('production: cross-employee read denied by RLS throws, never rows', async () => {
    forceProductionEnv();
    mockFrom({ school_payroll_items: { data: null, error: RLS_DENY } });
    await expect(payrollService.getMyPayslips('emp-other-1', 'school-default')).rejects.toThrow();
  });
});

describe('D10(e): cleared-via-payment activity projection shows label, zero amounts', () => {
  it('paid-basis projection carries the operational label with no financial keys', () => {
    const p = toParticipantProjection({
      studentId: 'stud-aurora',
      studentName: 'Aurora Namukasa',
      className: 'Stage 7 Red',
      streamName: 'Red',
      activityId: 'act-swimming',
      activityName: 'Competitive Swimming Squad',
      status: 'cleared',
      basis: 'paid',
      validUntil: null,
      operationalNote: 'Term 1 sports fee verified by bursar',
    });
    expect(p.clearanceLabel).toBe('✓ Cleared • Paid');
    expect(p.clearanceStatus).toBe('cleared');
    expect(Object.keys(p).sort()).toEqual(
      [
        'studentId',
        'studentName',
        'className',
        'streamName',
        'activityId',
        'activityName',
        'clearanceStatus',
        'clearanceLabel',
        'validUntil',
        'operationalNote',
      ].sort()
    );
    const raw = JSON.stringify(p);
    expect(raw).not.toMatch(/UGX|[0-9]{5,}/);
    expect(raw).not.toMatch(/amount|balance|arrears|receipt/i);
  });
});

describe('D11(f): route-level money guard denies teacher, allows authorized roles', () => {
  const MONEY_PATHS = [
    '/fees',
    '/fees/import',
    '/expenses',
    '/payroll',
    '/dashboard/school',
    '/admin/overview',
    '/administration/payroll',
    '/administration/inventory',
    '/administration/audit',
  ];

  it('teacher is denied on every money/leadership path', () => {
    for (const path of MONEY_PATHS) {
      expect(canAccessPath('teacher', path)).toBe(false);
    }
  });

  it('authorized roles retain access mirroring navigation', () => {
    expect(canAccessPath('bursar', '/fees')).toBe(true);
    expect(canAccessPath('bursar', '/fees/import')).toBe(true);
    expect(canAccessPath('admin', '/payroll')).toBe(true);
    expect(canAccessPath('principal', '/expenses')).toBe(true);
    expect(canAccessPath('principal', '/dashboard/school')).toBe(true);
    expect(canAccessPath('admin', '/administration/audit')).toBe(true);
    expect(canAccessPath('admin', '/admin/overview')).toBe(true);
    expect(canAccessPath('principal', '/administration/inventory')).toBe(true);
    expect(canAccessPath('admin', '/administration/inventory')).toBe(true);
    expect(canAccessPath('teacher', '/admin/overview')).toBe(false);
    expect(canAccessPath('teacher', '/administration/inventory')).toBe(false);
    expect(canAccessPath('bursar', '/admin/overview')).toBe(false);
    expect(canAccessPath('principal', '/fees/import')).toBe(false);
  });

  it('teacher keeps academic + self-service paths', () => {
    for (const path of [
      '/teacher/today',
      '/students',
      '/teaching/assignments',
      '/activities',
      '/people/hr/payslips',
      '/people/hr/leave',
    ]) {
      expect(canAccessPath('teacher', path)).toBe(true);
    }
  });
});

describe('D11-fix3: RequireAccess router gate redirects by role (MemoryRouter)', () => {
  const LANDINGS = ['/teacher/today', '/dashboard/school', '/fees', '/admin/overview'];

  function renderGateAt(role: UserRole, initialPath: string, gatePath: string) {
    authState.role = role;
    expect(getRoleLandingRoute(role)).toBeDefined();
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path={gatePath.replace(/^\//, '')}
            element={
              <RequireAccess path={gatePath}>
                <div>ALLOWED:{gatePath}</div>
              </RequireAccess>
            }
          />
          {LANDINGS.map((lp) => (
            <Route key={lp} path={lp.replace(/^\//, '')} element={<div>LANDING:{lp}</div>} />
          ))}
        </Routes>
      </MemoryRouter>
    );
  }

  it('denied teacher on /fees lands on /teacher/today', async () => {
    renderGateAt('teacher', '/fees', '/fees');
    expect(await screen.findByText('LANDING:/teacher/today')).toBeInTheDocument();
    expect(screen.queryByText('ALLOWED:/fees')).not.toBeInTheDocument();
  });

  it('allowed bursar on /fees renders the page', () => {
    renderGateAt('bursar', '/fees', '/fees');
    expect(screen.getByText('ALLOWED:/fees')).toBeInTheDocument();
  });

  it('principal denied on /fees/import by longest-prefix (lands on school dashboard)', async () => {
    renderGateAt('principal', '/fees/import', '/fees/import');
    expect(await screen.findByText('LANDING:/dashboard/school')).toBeInTheDocument();
    expect(screen.queryByText('ALLOWED:/fees/import')).not.toBeInTheDocument();
  });

  it('bursar allowed on /fees/import (longest-prefix grants)', () => {
    renderGateAt('bursar', '/fees/import', '/fees/import');
    expect(screen.getByText('ALLOWED:/fees/import')).toBeInTheDocument();
  });

  it('teacher denied on /admin/overview and /administration/inventory', async () => {
    const first = renderGateAt('teacher', '/admin/overview', '/admin/overview');
    expect(await screen.findByText('LANDING:/teacher/today')).toBeInTheDocument();
    expect(screen.queryByText('ALLOWED:/admin/overview')).not.toBeInTheDocument();
    first.unmount();
    renderGateAt('teacher', '/administration/inventory', '/administration/inventory');
    expect(await screen.findByText('LANDING:/teacher/today')).toBeInTheDocument();
    expect(screen.queryByText('ALLOWED:/administration/inventory')).not.toBeInTheDocument();
  });

  it('admin renders /admin/overview; principal renders /administration/inventory', () => {
    const first = renderGateAt('admin', '/admin/overview', '/admin/overview');
    expect(screen.getByText('ALLOWED:/admin/overview')).toBeInTheDocument();
    first.unmount();
    renderGateAt('principal', '/administration/inventory', '/administration/inventory');
    expect(screen.getByText('ALLOWED:/administration/inventory')).toBeInTheDocument();
  });
});

describe('D10-fix4: every money/leadership App route is allowlisted (fail-closed)', () => {
  function appRoutePaths(): string[] {
    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const src = fs.readFileSync(appPath, 'utf8');
    const found = [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
    // App.tsx declares nested routes under "/" — normalize to absolute paths.
    return found.map((p) => (p === '*' ? '/*' : p.startsWith('/') ? p : `/${p}`));
  }

  it('App.tsx route extraction sees the known money routes (guards regex rot)', () => {
    const paths = appRoutePaths();
    for (const known of [
      '/fees',
      '/fees/import',
      '/expenses',
      '/payroll',
      '/dashboard/school',
      '/admin/overview',
      '/administration/payroll',
      '/administration/inventory',
      '/administration/audit',
    ]) {
      expect(paths).toContain(known);
    }
  });

  it('every money-pattern App path is teacher-denied or explicitly open self-service', () => {
    const paths = appRoutePaths();
    const MONEY_RE = /^\/(fees|payroll|expenses|finance|admin|dashboard|payslip)/;
    // Explicitly open by design: MyHRPage renders ONLY the viewer's own
    // rows (school-scoped services + RLS deny->throw); see the allowlist note.
    const EXPLICITLY_OPEN = new Set(['/administration/hr']);
    const moneyPaths = paths.filter((p) => MONEY_RE.test(p));
    expect(moneyPaths.length).toBeGreaterThan(0);
    for (const p of moneyPaths) {
      if (EXPLICITLY_OPEN.has(p)) continue;
      expect(canAccessPath('teacher', p)).toBe(false);
    }
  });
});

describe('D10-fix1: MyHRPage resolves the viewer’s own employee id', () => {
  function renderMyHR() {
    return render(
      <MemoryRouter initialEntries={['/people/hr/leave']}>
        <MyHRPage section="leave" />
      </MemoryRouter>
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mock env uses the explicit DEMO identity without calling the resolver', async () => {
    authState.fullName = 'Sarah Nabwire';
    renderMyHR();
    await screen.findByText('Staff HR Portal');
    expect(resolveMyEmployeeId).not.toHaveBeenCalled();
    expect(screen.getByText(/Sarah Nabwire/)).toBeInTheDocument();
  });

  it('live: viewer resolves to their OWN id (services called with it, never Sarah’s)', async () => {
    forceProductionEnv();
    authState.role = 'teacher';
    authState.schoolId = 'school-default';
    authState.fullName = 'Dana Teacher';
    (resolveMyEmployeeId as any).mockResolvedValue('emp-viewer-1');
    const effSpy = vi.spyOn(hrService, 'getEffectiveBalances').mockResolvedValue([]);
    const reqSpy = vi.spyOn(hrService, 'getMyLeaveRequests').mockResolvedValue([]);
    const advSpy = vi.spyOn(hrService, 'getMyAdvances').mockResolvedValue([]);
    const slipSpy = vi.spyOn(payrollService, 'getMyPayslips').mockResolvedValue([]);
    renderMyHR();
    await waitFor(() => {
      expect(resolveMyEmployeeId).toHaveBeenCalledWith('school-default');
    });
    await waitFor(() => {
      expect(effSpy).toHaveBeenCalledWith('school-default', 'emp-viewer-1');
    });
    expect(reqSpy).toHaveBeenCalledWith('emp-viewer-1');
    expect(advSpy).toHaveBeenCalledWith('emp-viewer-1');
    expect(slipSpy).toHaveBeenCalledWith('emp-viewer-1');
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/Sarah/);
    expect(body).toMatch(/Dana Teacher/);
  });

  it('live: unresolvable viewer sees an error, never another employee’s data', async () => {
    forceProductionEnv();
    (resolveMyEmployeeId as any).mockResolvedValue(null);
    const effSpy = vi.spyOn(hrService, 'getEffectiveBalances');
    renderMyHR();
    await screen.findByText('Could not resolve your employee record');
    expect(effSpy).not.toHaveBeenCalled();
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/Sarah/);
    expect(body).not.toMatch(/UGX/);
  });

  it('live: resolver throw also fails closed with the error state', async () => {
    forceProductionEnv();
    (resolveMyEmployeeId as any).mockRejectedValue(new Error('db down'));
    renderMyHR();
    await screen.findByText('Could not resolve your employee record');
    expect(document.body.textContent ?? '').not.toMatch(/Sarah/);
  });
});
