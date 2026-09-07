/**
 * Slice 1 Task 2 — admission flow (RED): wizard submit + queue approve.
 *
 * Contract under test (src/modules/admissions/admissionService):
 * - listApplications: pending-first queue for a school.
 * - submitApplication: wizard payload -> admission_applications row +
 *   admission_application_guardians rows + storage uploads to the private
 *   `student_docs` bucket (<school>/<app-id>/<file>) + document metadata
 *   rows (path only, never a public URL). NEVER inserts directly into
 *   students / people / student_guardians / student_enrolments.
 * - approveApplication: principal/admin client gate, then the atomic
 *   `approve_admission_application(p_application_id)` RPC (no direct
 *   student inserts). Non-principal roles throw BEFORE any DB call.
 * - Mock env is honest (no fake reads/writes); DB errors throw (never
 *   masked to empties on write paths).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockRpc, mockUpload, mockStorageFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockUpload: vi.fn(),
  mockStorageFrom: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc, storage: { from: mockStorageFrom } },
}));

import { admissionService } from '../modules/admissions/admissionService';

describe('Admissions flow (Slice 1 Task 2)', () => {
  let tableResponses: Record<string, unknown> = {};
  let captured: { table: string; filters: Array<[string, unknown]> }[] = [];

  const builderFor = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    captured.push({ table, filters });
    const respond = () => {
      const r: unknown = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn((col: string, val: unknown) => {
      filters.push([col, val]);
      return b;
    });
    b.order = vi.fn(() => b);
    b.insert = vi.fn(() => b);
    b.update = vi.fn(() => b);
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
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockUpload.mockResolvedValue({ data: { path: 'x' }, error: null });
    mockStorageFrom.mockReturnValue({ upload: mockUpload });
    tableResponses = {};
    captured = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function seedApplications() {
    tableResponses.admission_applications = {
      data: [
        {
          id: 'app-approved',
          school_id: 'school-1',
          student_first_name: 'Approved',
          student_last_name: 'Pupil',
          dob: '2018-01-01',
          gender: 'female',
          class_id: null,
          stream_id: null,
          status: 'approved',
          reviewed_at: '2026-09-01T00:00:00Z',
          approved_student_id: 'student-1',
          created_at: '2026-08-01T00:00:00Z',
          admission_application_guardians: [],
          admission_application_documents: [],
        },
        {
          id: 'app-pending-old',
          school_id: 'school-1',
          student_first_name: 'Pending',
          student_last_name: 'Old',
          dob: '2019-05-05',
          gender: 'male',
          class_id: null,
          stream_id: null,
          status: 'pending',
          reviewed_at: null,
          approved_student_id: null,
          created_at: '2026-08-02T00:00:00Z',
          admission_application_guardians: [
            {
              id: 'g-1',
              name: 'Jane Old',
              relationship: 'mother',
              phone: '0700000001',
              email: null,
              is_emergency: true,
              is_primary: true,
            },
          ],
          admission_application_documents: [],
        },
        {
          id: 'app-pending-new',
          school_id: 'school-1',
          student_first_name: 'Pending',
          student_last_name: 'New',
          dob: null,
          gender: null,
          class_id: null,
          stream_id: null,
          status: 'pending',
          reviewed_at: null,
          approved_student_id: null,
          created_at: '2026-08-10T00:00:00Z',
          admission_application_guardians: [],
          admission_application_documents: [
            { id: 'd-1', doc_type: 'photo', storage_path: 'school-1/app-x/photo.jpg' },
          ],
        },
      ],
      error: null,
    };
  }

  function wizardPayload() {
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
      files: [
        {
          file: new File(['birth-cert-bytes'], 'birth-cert.pdf', { type: 'application/pdf' }),
          docType: 'birth_certificate' as const,
        },
      ],
    };
  }

  it('(a) application list query returns the school queue pending-first', async () => {
    seedApplications();
    const rows = await admissionService.listApplications('school-1');

    expect(rows.map((r) => r.id)).toEqual(['app-pending-new', 'app-pending-old', 'app-approved']);
    expect(mockFrom).toHaveBeenCalledWith('admission_applications');
    expect(captured.find((c) => c.table === 'admission_applications')?.filters).toContainEqual([
      'school_id',
      'school-1',
    ]);
    const pending = rows[0];
    expect(pending.pupilName).toMatch(/Pending/);
    expect(pending.guardians).toHaveLength(0);
    expect(pending.documents).toHaveLength(1);
    expect(rows[1].guardians[0]).toMatchObject({ name: 'Jane Old', isEmergency: true });
  });

  it('(b) submit creates application + guardians + document rows, never direct student inserts', async () => {
    tableResponses.admission_applications = { data: { id: 'app-1' }, error: null };
    tableResponses.admission_application_guardians = { data: [], error: null };
    tableResponses.admission_application_documents = { data: [], error: null };

    const res = await admissionService.submitApplication(wizardPayload(), 'admin');

    expect(res.applicationId).toBe('app-1');

    // Application row payload.
    type BuilderWithInsert = Record<string, ReturnType<typeof vi.fn>>;
    const builders = mockFrom.mock.results.map(
      (r: { value: unknown }) => r.value as BuilderWithInsert,
    );
    const appBuilder = builders
      .find((b) => (b.insert as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
        (c[0] as Record<string, unknown>).school_id === 'school-1'))!;
    const appInsertArg = (appBuilder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(appInsertArg).toMatchObject({
      school_id: 'school-1',
      student_first_name: 'Amina',
      student_last_name: 'Kato',
      status: 'pending',
    });

    // Guardians payload carries the new application id + emergency flag.
    expect(mockFrom).toHaveBeenCalledWith('admission_application_guardians');
    const guardianBuilder = builders
      .find((b) => (b.insert as ReturnType<typeof vi.fn>).mock.calls.length > 0
        && JSON.stringify((b.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]).includes('Sarah Kato'))!;
    const guardianRows = (guardianBuilder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(guardianRows).toEqual([
      expect.objectContaining({
        application_id: 'app-1',
        name: 'Sarah Kato',
        relationship: 'mother',
        is_emergency: true,
        is_primary: true,
      }),
    ]);

    // Upload hits the private student_docs bucket BEFORE metadata insert,
    // keyed <school>/<app-id>/<file>; metadata stores the path only.
    expect(mockStorageFrom).toHaveBeenCalledWith('student_docs');
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [uploadPath] = mockUpload.mock.calls[0];
    expect(uploadPath).toBe('school-1/app-1/birth-cert.pdf');
    const docBuilder = builders
      .find((b) => (b.insert as ReturnType<typeof vi.fn>).mock.calls.length > 0
        && JSON.stringify((b.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]).includes('birth_certificate'))!;
    const docRows = (docBuilder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(docRows).toEqual([
      expect.objectContaining({
        application_id: 'app-1',
        doc_type: 'birth_certificate',
        storage_path: 'school-1/app-1/birth-cert.pdf',
      }),
    ]);
    expect(String(docRows[0].storage_path)).not.toMatch(/^https?:\/\//);

    // The atomic approve RPC owns student creation — submit must never
    // insert directly into identity/enrolment tables.
    for (const forbidden of ['students', 'people', 'student_guardians', 'student_enrolments']) {
      expect(mockFrom).not.toHaveBeenCalledWith(forbidden);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('(b2) teacher / school staff can submit admission application', async () => {
    tableResponses.admission_applications = { data: { id: 'app-teacher-1' }, error: null };
    tableResponses.admission_application_guardians = { data: [], error: null };
    tableResponses.admission_application_documents = { data: [], error: null };

    const res = await admissionService.submitApplication(wizardPayload(), 'teacher');
    expect(res.applicationId).toBe('app-teacher-1');
  });

  it('(b3) bursar, parent, and student cannot submit admission application', async () => {
    for (const role of ['bursar', 'parent', 'student'] as const) {
      await expect(admissionService.submitApplication(wizardPayload(), role)).rejects.toThrow(
        'requires admin, principal, or staff intake',
      );
    }
  });

  it('(c) approve calls the atomic RPC, not direct inserts', async () => {
    mockRpc.mockResolvedValue({ data: 'student-9', error: null });

    const res = await admissionService.approveApplication('app-1', 'principal');

    expect(res.studentId).toBe('student-9');
    expect(mockRpc).toHaveBeenCalledWith('approve_admission_application', {
      p_application_id: 'app-1',
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('(c2) approve with class placement updates application before calling RPC', async () => {
    mockRpc.mockResolvedValue({ data: 'student-10', error: null });

    const res = await admissionService.approveApplication('app-2', 'principal', {
      classId: 'class-p5',
      streamId: 'stream-p5a',
    });

    expect(res.studentId).toBe('student-10');
    expect(mockFrom).toHaveBeenCalledWith('admission_applications');
    expect(mockRpc).toHaveBeenCalledWith('approve_admission_application', {
      p_application_id: 'app-2',
    });
  });

  it('(d) non-principal approve throws before touching the DB', async () => {
    for (const role of ['teacher', 'bursar', 'parent', 'student'] as const) {
      await expect(admissionService.approveApplication('app-1', role)).rejects.toThrow();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockStorageFrom).not.toHaveBeenCalled();
      vi.clearAllMocks();
      mockFrom.mockImplementation((table: string) => builderFor(table));
    }
  });

  it('(e) mock env is honest: empty queue without DB, submit/approve refuse without DB', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');

    await expect(admissionService.listApplications('school-1')).resolves.toEqual([]);
    await expect(admissionService.submitApplication(wizardPayload(), 'admin')).rejects.toThrow();
    await expect(admissionService.approveApplication('app-1', 'principal')).rejects.toThrow();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('(f) DB errors throw (denials are never masked)', async () => {
    tableResponses.admission_applications = {
      data: null,
      error: { code: '42501', message: 'permission denied for table admission_applications' },
    };
    await expect(admissionService.listApplications('school-1')).rejects.toThrow('permission denied');

    tableResponses.admission_applications = {
      data: null,
      error: { code: '500', message: 'insert boom' },
    };
    await expect(admissionService.submitApplication(wizardPayload(), 'admin')).rejects.toThrow(
      'insert boom',
    );

    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'rpc denied' } });
    await expect(admissionService.approveApplication('app-1', 'principal')).rejects.toThrow(
      'rpc denied',
    );
  });
});
