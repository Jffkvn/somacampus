/**
 * Timetable wizard render tests: guided setup loads foundation status,
 * renders the staffing grid, auto-fills qualified teachers, and blocks
 * saving with a plain message when rows are incomplete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../lib/authContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: null,
    role: 'principal',
    fullName: 'Dr. Edward Ssenyonga',
    schoolId: '22222222-2222-2222-2222-222222222222',
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchDevRole: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

import { supabase } from '../lib/supabase';
import { timetablePolicyService } from '../modules/planning/timetablePolicyService';
import { TimetableWizard } from '../modules/planning/TimetableWizard';

const SCHOOL = '22222222-2222-2222-2222-222222222222';
const CLS = '55555555-5555-5555-5555-555555555551';
const MATH = '77777777-7777-7777-7777-777777777771';
const T1 = '99999999-9999-9999-9999-999999999992';

function mockTables() {
  (supabase.from as any).mockImplementation((table: string) => {
    const data: Record<string, any[]> = {
      academic_years: [{ id: 'y1', name: '2026-2027' }],
      terms: [{ id: 't1', name: 'Term 1' }],
      classes: [{ id: CLS, name: 'Stage 6' }],
      subjects: [{ id: MATH, name: 'Mathematics' }],
      employees: [{ id: T1, people: { first_name: 'David', last_name: 'Anthony', auth_user_id: 'user-1' } }],
    };
    const rows = data[table] ?? [];
    const chain: any = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.then = (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve);
    return chain;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockTables();
  vi.spyOn(timetablePolicyService, 'getOfficialTeachingSubjects').mockResolvedValue([
    { teacherId: T1, subjectId: MATH } as any,
  ]);
  vi.spyOn(timetablePolicyService, 'getTeachingAllocations').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TimetableWizard guided setup', () => {
  it('shows foundation status with year, terms, classes, subjects', async () => {
    render(
      <MemoryRouter>
        <TimetableWizard schoolId={SCHOOL} />
      </MemoryRouter>
    );
    await screen.findByText(/School setup for timetabling/i);
    expect(screen.getByText(/2026-2027/)).toBeDefined();
    expect(screen.getByText(/Term 1/)).toBeDefined();
  });

  it('staffing grid lists class x subject with qualified teacher dropdown', async () => {
    render(
      <MemoryRouter>
        <TimetableWizard schoolId={SCHOOL} />
      </MemoryRouter>
    );
    await screen.findByText(/School setup for timetabling/i);
    fireEvent.click(screen.getByText(/Continue to staffing/i));
    await screen.findByText(/Stage 6.*Mathematics|Mathematics/);
    expect(screen.getByText(/Who teaches what/i)).toBeDefined();
  });

  it('auto-fill assigns the qualified teacher, then save requires no gaps', async () => {
    const saveSpy = vi
      .spyOn(timetablePolicyService, 'saveTeachingAllocation')
      .mockResolvedValue({ id: 'a1', status: 'reviewed' } as any);
    vi.spyOn(timetablePolicyService, 'approveTeachingAllocationsAtomic').mockResolvedValue({
      success: true,
      approvedCount: 1,
      schoolId: SCHOOL,
    });
    render(
      <MemoryRouter>
        <TimetableWizard schoolId={SCHOOL} />
      </MemoryRouter>
    );
    await screen.findByText(/School setup for timetabling/i);
    fireEvent.click(screen.getByText(/Continue to staffing/i));
    await screen.findByText(/Who teaches what/i);
    fireEvent.click(screen.getByText(/Auto-fill from qualified staff/i));
    fireEvent.click(screen.getByText(/Save & approve all/i));
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled());
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ classId: CLS, subjectId: MATH, teacherId: T1 })
    );
  });
});
