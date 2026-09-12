/**
 * Session 10: allocation pair upsert + auto-bill trigger contracts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { timetablePolicyService } from '../modules/planning/timetablePolicyService';

const REAL_URL = 'https://prod-real-db.supabase.co';
const origNodeEnv = process.env.NODE_ENV;
const origViteUrl = (import.meta.env as any).VITE_SUPABASE_URL;
function forceProductionEnv() {
  process.env.NODE_ENV = 'production';
  (import.meta.env as any).VITE_SUPABASE_URL = REAL_URL;
}
function restoreEnv() {
  process.env.NODE_ENV = origNodeEnv;
  (import.meta.env as any).VITE_SUPABASE_URL = origViteUrl;
}

const SCHOOL = '22222222-2222-2222-2222-222222222222';
const YEAR = '33333333-3333-3333-3333-333333333333';
const CLS = '55555555-5555-5555-5555-555555555551';
const SUB = '77777777-7777-7777-7777-777777777771';
const TCH = '23e55c50-494c-47ea-b5b5-9d34a27a27d5';

function chain(result: { data: unknown; error: unknown }) {
  const c: any = {};
  c.select = vi.fn().mockReturnValue(c);
  c.insert = vi.fn().mockReturnValue(c);
  c.update = vi.fn().mockReturnValue(c);
  c.eq = vi.fn().mockReturnValue(c);
  c.neq = vi.fn().mockReturnValue(c);
  c.order = vi.fn().mockReturnValue(c);
  c.limit = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.single = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
function migration(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
}

describe('allocation pair upsert', () => {
  const base = {
    schoolId: SCHOOL,
    academicYearId: YEAR,
    classId: CLS,
    subjectId: SUB,
    teacherId: TCH,
    periodsPerWeek: 4,
  };
  const row = (over: any = {}) => ({
    data: {
      id: 'alloc-1', school_id: SCHOOL, academic_year_id: YEAR, class_id: CLS,
      subject_id: SUB, teacher_id: TCH, periods_per_week: 4, status: 'reviewed',
      allocation_source: 'human', proposal_reason: null, effective_from: '2026-09-12',
      effective_to: null, classes: { name: 'Stage 5' }, subjects: { name: 'Mathematics' },
      employees: { people: { first_name: 'Anthony', last_name: 'Mabirizi' } },
      ...over,
    },
    error: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    forceProductionEnv();
  });
  afterEach(() => restoreEnv());

  it('updates the existing live row instead of inserting a duplicate', async () => {
    const ops: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'teacher_official_subjects') return chain({ data: { id: 'os-1' }, error: null });
      if (table === 'teaching_allocations') {
        const c: any = chain(row());
        const inner = { ...c };
        (c as any).insert = vi.fn(() => {
          ops.push('insert');
          return inner;
        });
        (c as any).update = vi.fn(() => {
          ops.push('update');
          return inner;
        });
        return c;
      }
      return chain({ data: null, error: null });
    });
    // existing pair lookup returns a row -> update path; insert must not run
    const res = await timetablePolicyService.saveTeachingAllocation(base as any);
    expect(ops).toContain('update');
    expect(ops).not.toContain('insert');
    expect(res.id).toBe('alloc-1');
  });

  it('inserts when no live row exists for the pair', async () => {
    const ops: string[] = [];
    let calls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'teacher_official_subjects') return chain({ data: { id: 'os-1' }, error: null });
      if (table === 'teaching_allocations') {
        calls++;
        if (calls === 1) {
          // pair lookup: nothing
          return chain({ data: null, error: null });
        }
        const c: any = chain(row());
        const inner = { ...c };
        (c as any).insert = vi.fn(() => {
          ops.push('insert');
          return inner;
        });
        return c;
      }
      return chain({ data: null, error: null });
    });
    await timetablePolicyService.saveTeachingAllocation(base as any);
    expect(ops).toContain('insert');
  });
});

describe('auto-bill trigger contract', () => {
  it('bills only approved structures with categories; never breaks enrolment', () => {
    const sql = migration('20260922000017_auto_bill_new_enrolments.sql');
    expect(sql).toMatch(/approval_status = 'approved'/);
    expect(sql).toMatch(/fee_category_id IS NOT NULL/);
    expect(sql).toMatch(/WHEN OTHERS THEN/);
    expect(sql).toMatch(/ON CONFLICT \(student_id, fee_structure_id\)/);
    expect(sql).toMatch(/AFTER INSERT ON public\.student_enrolments/);
  });

  it('allocation uniqueness: repair + partial unique index', () => {
    const sql = migration('20260922000018_allocation_pair_uniqueness.sql');
    expect(sql).toMatch(/status <> 'archived'/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX teaching_allocations_pair_unique/);
    expect(sql).toMatch(/SET status = 'archived'/);
  });
});
