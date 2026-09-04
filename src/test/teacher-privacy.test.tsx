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

import { NAVIGATION_CONFIG } from '../config/navigation';
import { ROLE_PERMISSIONS, hasPermission, type UserRole } from '../config/permissions';
import {
  canAccessPath,
  canViewStudentFees,
  shouldShowStudentFeeRow,
} from '../lib/teacherPrivacy';
import { toParticipantProjection } from '../modules/activities/activityService';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { supabase } from '../lib/supabase';
import { payrollService } from '../modules/payroll/payrollService';
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
    'hr.staff.view',
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
    '/administration/payroll',
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
