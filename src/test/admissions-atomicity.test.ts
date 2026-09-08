/**
 * Batch B Task 3 (RED) — admissions finalize-path atomicity.
 *
 * Ground truth (verified 2026-09-08 against this tree):
 * - There is NO `finalizeAdmission` function and NO enrol + fee-schedule
 *   separate-await pair anywhere. The enrol writes (people + students +
 *   student_enrolments + guardians) already happen atomically INSIDE the
 *   server-side `approve_admission_application` plpgsql RPC (one implicit
 *   Postgres transaction — any RAISE rolls everything back). supabase-js /
 *   PostgREST exposes no client-side multi-statement transaction, so the RPC
 *   is the only real-transaction mechanism available; no migration may add a
 *   new one (scope freeze).
 * - The genuinely non-atomic multi-await paths in admissionService.ts are:
 *   (a) submitApplication: application insert -> storage uploads ->
 *       guardian insert -> document insert. A child-step failure leaves an
 *       orphan application row (partial admission) with NO compensation.
 *   (b) approveApplication with overrideClass: the class-placement update
 *       error is swallowed (unchecked) and the RPC runs anyway.
 *
 * Contract under test:
 * - submit child-step failure -> best-effort compensating rollback
 *   (remove uploaded blobs; delete document/guardian/application rows) +
 *   an explicit error naming the cause AND the rollback outcome.
 * - Rollback failures are surfaced, never silent.
 * - Placement-update failure -> throw BEFORE the approve RPC runs.
 * - RPC failure after a placement update -> error names the RPC cause and
 *   states explicitly that the placement update persists (pre-step, outside
 *   the atomic RPC).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockRpc, mockUpload, mockRemove, mockStorageFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
  mockStorageFrom: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc, storage: { from: mockStorageFrom } },
}));

import { admissionService } from '../modules/admissions/admissionService';

describe('Admissions finalize-path atomicity (Batch B Task 3)', () => {
  let tableResponses: Record<string, unknown> = {};
  let deleteErrors: Record<string, { message: string }> = {};
  let captured: { table: string; op: string; filters: Array<[string, unknown]> }[] = [];

  const builderFor = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let op = 'select';
    const respond = () => {
      captured.push({ table, op, filters: [...filters] });
      if (op === 'delete' && deleteErrors[table]) {
        return Promise.resolve({ data: null, error: deleteErrors[table] });
      }
      const r: unknown = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => { op = 'select'; return b; });
    b.eq = vi.fn((col: string, val: unknown) => {
      filters.push([col, val]);
      return b;
    });
    b.order = vi.fn(() => b);
    b.insert = vi.fn(() => { op = 'insert'; return b; });
    b.update = vi.fn(() => { op = 'update'; return b; });
    b.delete = vi.fn(() => { op = 'delete'; return b; });
    b.single = vi.fn(() => respond());
    b.maybeSingle = vi.fn(() => respond());
    (b as { then: unknown }).then = (res: unknown, rej: unknown) =>
      respond().then(res as never, rej as never);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    mockRpc.mockResolvedValue({ data: 'student-1', error: null });
    mockUpload.mockResolvedValue({ data: { path: 'x' }, error: null });
    mockRemove.mockResolvedValue({ data: [], error: null });
    mockStorageFrom.mockReturnValue({ upload: mockUpload, remove: mockRemove });
    tableResponses = {};
    deleteErrors = {};
    captured = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function payload(fileCount = 1) {
    return {
      schoolId: 'school-1',
      studentFirstName: 'Amina',
      studentLastName: 'Kato',
      dob: '2019-03-04',
      gender: 'female' as const,
      classId: null as string | null,
      streamId: null as string | null,
      guardians: [
        {
          name: 'Sarah Kato',
          relationship: 'mother',
          phone: '0700000002',
          email: 'sarah@example.com',
          isEmergency: true,
          isPrimary: true,
        },
      ],
      files: Array.from({ length: fileCount }, (_, i) => ({
        file: new File([`bytes-${i}`], `doc-${i}.pdf`, { type: 'application/pdf' }),
        docType: 'birth_certificate' as const,
      })),
    };
  }

  function deletesFor(table: string) {
    return captured.filter((c) => c.table === table && c.op === 'delete');
  }

  it('(1) all-succeed submit performs no compensating deletes', async () => {
    tableResponses.admission_applications = { data: { id: 'app-1' }, error: null };
    tableResponses.admission_application_guardians = { data: [], error: null };
    tableResponses.admission_application_documents = { data: [], error: null };

    const res = await admissionService.submitApplication(payload(), 'admin');

    expect(res.applicationId).toBe('app-1');
    expect(captured.some((c) => c.op === 'delete')).toBe(false);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('(2) guardian-insert failure triggers compensating rollback + explicit error', async () => {
    tableResponses.admission_applications = { data: { id: 'app-9' }, error: null };
    tableResponses.admission_application_guardians = {
      data: null,
      error: { message: 'guardian boom' },
    };
    tableResponses.admission_application_documents = { data: [], error: null };

    await expect(admissionService.submitApplication(payload(), 'admin')).rejects.toThrow(
      /guardian boom/,
    );

    // Best-effort compensation attempted against the orphan rows.
    expect(deletesFor('admission_application_documents').length).toBeGreaterThanOrEqual(1);
    expect(deletesFor('admission_application_guardians').length).toBeGreaterThanOrEqual(1);
    const appDeletes = deletesFor('admission_applications');
    expect(appDeletes.length).toBeGreaterThanOrEqual(1);
    expect(appDeletes[0].filters).toContainEqual(['id', 'app-9']);

    await expect(admissionService.submitApplication(payload(), 'admin')).rejects.toThrow(
      /rollback/i,
    );
  });

  it('(3) document-insert failure triggers compensating rollback', async () => {
    tableResponses.admission_applications = { data: { id: 'app-7' }, error: null };
    tableResponses.admission_application_guardians = { data: [], error: null };
    tableResponses.admission_application_documents = {
      data: null,
      error: { message: 'doc boom' },
    };

    await expect(admissionService.submitApplication(payload(), 'admin')).rejects.toThrow(
      /doc boom/,
    );
    expect(deletesFor('admission_applications').length).toBeGreaterThanOrEqual(1);
    await expect(admissionService.submitApplication(payload(), 'admin')).rejects.toThrow(
      /rollback/i,
    );
  });

  it('(4) rollback failures are surfaced explicitly, never silent', async () => {
    tableResponses.admission_applications = { data: { id: 'app-5' }, error: null };
    tableResponses.admission_application_guardians = {
      data: null,
      error: { message: 'guardian boom' },
    };
    deleteErrors = {
      admission_applications: { message: 'rls denies delete' },
    };

    await expect(admissionService.submitApplication(payload(), 'admin')).rejects.toThrow(
      /guardian boom/,
    );
    await expect(admissionService.submitApplication(payload(), 'admin')).rejects.toThrow(
      /rollback failed|orphan/i,
    );
  });

  it('(5) mid-upload failure removes already-uploaded blobs + deletes the application row', async () => {
    tableResponses.admission_applications = { data: { id: 'app-3' }, error: null };
    mockUpload
      .mockResolvedValueOnce({ data: { path: 'school-1/app-3/doc-0.pdf' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'storage boom' } });

    await expect(admissionService.submitApplication(payload(2), 'admin')).rejects.toThrow(
      /storage boom|upload failed/,
    );
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove.mock.calls[0][0]).toEqual(['school-1/app-3/doc-0.pdf']);
    expect(deletesFor('admission_applications').length).toBeGreaterThanOrEqual(1);
  });

  it('(6) placement-update failure throws BEFORE the atomic approve RPC runs', async () => {
    tableResponses.admission_applications = {
      data: null,
      error: { message: 'placement boom' },
    };

    await expect(
      admissionService.approveApplication('app-2', 'principal', {
        classId: 'class-p5',
        streamId: 'stream-p5a',
      }),
    ).rejects.toThrow(/placement.*not attempted|placement boom/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('(7) RPC failure after placement update names the cause + states placement persists', async () => {
    tableResponses.admission_applications = { data: [], error: null };
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc denied' } });

    await expect(
      admissionService.approveApplication('app-2', 'principal', {
        classId: 'class-p5',
        streamId: null,
      }),
    ).rejects.toThrow(/rpc denied/);
    await expect(
      admissionService.approveApplication('app-2', 'principal', {
        classId: 'class-p5',
        streamId: null,
      }),
    ).rejects.toThrow(/placement.*persist/i);
  });

  it('(8) all-succeed approve with placement calls RPC once and returns the student id', async () => {
    tableResponses.admission_applications = { data: [], error: null };
    mockRpc.mockResolvedValue({ data: 'student-10', error: null });

    const res = await admissionService.approveApplication('app-2', 'principal', {
      classId: 'class-p5',
      streamId: 'stream-p5a',
    });

    expect(res.studentId).toBe('student-10');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('approve_admission_application', {
      p_application_id: 'app-2',
    });
  });
});
