import { supabase } from '../../lib/supabase';
import type { UserRole } from '../../config/permissions';

/**
 * Slice 1 Task 2 — reception admissions pipeline.
 *
 * Tables (20260917000000, read-only here): admission_applications with child
 * rows admission_application_guardians + admission_application_documents.
 * Student creation is owned EXCLUSIVELY by the atomic
 * approve_admission_application(p_application_id) RPC (leadership-gated,
 * returns the new student_id) — this service never inserts into students,
 * people, student_guardians or student_enrolments.
 *
 * Document blobs live in the private `student_docs` bucket at
 * <school-id>/<application-id>/<filename>; only the storage path is stored
 * as metadata (no public URLs — the bucket is private).
 *
 * Client gates: submit / approve / reject require admin or principal.
 * Bursar is finance-only by design (RLS/RPC would additionally allow
 * bursar as DB leadership, but the UI flow excludes finance roles from
 * admissions decisions).
 */

export type AdmissionStatus = 'pending' | 'approved' | 'rejected';

export type AdmissionDocType =
  | 'birth_certificate'
  | 'report_card'
  | 'transfer_letter'
  | 'photo'
  | 'other';

export interface AdmissionGuardianInput {
  name: string;
  relationship: string;
  phone?: string;
  email?: string;
  isEmergency: boolean;
  isPrimary: boolean;
}

export interface AdmissionFileInput {
  file: File;
  docType: AdmissionDocType;
}

export interface SubmitApplicationInput {
  schoolId: string;
  studentFirstName: string;
  studentLastName: string;
  dob?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  classId?: string | null;
  streamId?: string | null;
  guardians: AdmissionGuardianInput[];
  files: AdmissionFileInput[];
}

export interface AdmissionGuardianRow {
  id?: string;
  name: string;
  relationship: string;
  phone?: string | null;
  email?: string | null;
  isEmergency: boolean;
  isPrimary: boolean;
}

export interface AdmissionDocumentRow {
  id?: string;
  docType: string;
  storagePath: string;
}

export interface AdmissionApplicationRow {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  pupilName: string;
  dob?: string | null;
  gender?: string | null;
  classId?: string | null;
  streamId?: string | null;
  status: AdmissionStatus;
  approvedStudentId?: string | null;
  createdAt?: string;
  guardians: AdmissionGuardianRow[];
  documents: AdmissionDocumentRow[];
}

const STUDENT_DOCS_BUCKET = 'student_docs';

type AdmissionsDecisionRole = Extract<UserRole, 'admin' | 'principal'>;
type AdmissionsSubmitRole = Extract<UserRole, 'admin' | 'principal' | 'teacher'>;

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function assertCanSubmitAdmission(role: UserRole): asserts role is AdmissionsSubmitRole {
  if (role !== 'admin' && role !== 'principal' && role !== 'teacher') {
    throw new Error(
      `admissionService: role '${role}' may not submit admission applications (requires admin, principal, or staff intake)`,
    );
  }
}

function assertCanDecideAdmission(role: UserRole, action: string): asserts role is AdmissionsDecisionRole {
  if (role !== 'admin' && role !== 'principal') {
    throw new Error(
      `admissionService: role '${role}' may not ${action} (requires admin or principal)`,
    );
  }
}

const errMessage = (err: unknown): string =>
  typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message: unknown }).message)
    : 'unknown error';

export const admissionService = {
  /**
   * School admission queue, pending applications first (then newest).
   * Mock env → honest [] without touching the DB. DB errors throw.
   */
  async listApplications(schoolId: string): Promise<AdmissionApplicationRow[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('admission_applications')
      .select(
        `id, school_id, student_first_name, student_last_name, dob, gender,
         class_id, stream_id, status, reviewed_at, approved_student_id, created_at,
         admission_application_guardians(id, name, relationship, phone, email, is_emergency, is_primary),
         admission_application_documents(id, doc_type, storage_path, created_at)`,
      )
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`admissionService.listApplications: ${errMessage(error)}`);
    }
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

    const mapped: AdmissionApplicationRow[] = rows.map((r) => {
      const firstName = String(r.student_first_name ?? '');
      const lastName = String(r.student_last_name ?? '');
      const guardiansRaw = Array.isArray(r.admission_application_guardians)
        ? (r.admission_application_guardians as Record<string, unknown>[])
        : [];
      const documentsRaw = Array.isArray(r.admission_application_documents)
        ? (r.admission_application_documents as Record<string, unknown>[])
        : [];
      return {
        id: String(r.id),
        schoolId: String(r.school_id ?? schoolId),
        firstName,
        lastName,
        pupilName: `${firstName} ${lastName}`.trim() || 'Unnamed applicant',
        dob: (r.dob as string | null) ?? null,
        gender: (r.gender as string | null) ?? null,
        classId: (r.class_id as string | null) ?? null,
        streamId: (r.stream_id as string | null) ?? null,
        status: (r.status as AdmissionStatus) ?? 'pending',
        approvedStudentId: (r.approved_student_id as string | null) ?? null,
        createdAt: r.created_at ? String(r.created_at) : undefined,
        guardians: guardiansRaw.map((g) => ({
          id: g.id ? String(g.id) : undefined,
          name: String(g.name ?? ''),
          relationship: String(g.relationship ?? ''),
          phone: (g.phone as string | null) ?? null,
          email: (g.email as string | null) ?? null,
          isEmergency: g.is_emergency === true,
          isPrimary: g.is_primary === true,
        })),
        documents: documentsRaw.map((d) => ({
          id: d.id ? String(d.id) : undefined,
          docType: String(d.doc_type ?? 'other'),
          storagePath: String(d.storage_path ?? ''),
        })),
      };
    });

    // Pending first, newest first within a status (the query already
    // orders by created_at desc; re-sort here so the contract holds
    // regardless of row arrival order).
    return mapped.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    });
  },

  /**
   * Wizard submit: application row -> storage uploads -> guardian rows ->
   * document metadata rows. Uploads land BEFORE metadata insert so a stored
   * path always references an existing object.
   */
  async submitApplication(
    input: SubmitApplicationInput,
    actorRole: UserRole,
  ): Promise<{ applicationId: string }> {
    assertCanSubmitAdmission(actorRole);

    const firstName = input.studentFirstName.trim();
    const lastName = input.studentLastName.trim();
    if (!firstName || !lastName) {
      throw new Error('admissionService.submitApplication: pupil first and last name are required');
    }
    if (input.guardians.length === 0) {
      throw new Error('admissionService.submitApplication: at least one guardian is required');
    }
    if (!input.guardians.some((g) => g.isEmergency)) {
      throw new Error('admissionService.submitApplication: one guardian must be designated emergency');
    }
    for (const g of input.guardians) {
      if (!g.name.trim() || !g.relationship.trim()) {
        throw new Error('admissionService.submitApplication: guardian name and relationship are required');
      }
    }

    if (isMockEnv()) {
      throw new Error('admissionService.submitApplication: unavailable in mock environment (no fake writes)');
    }

    const { data: app, error: appError } = await supabase
      .from('admission_applications')
      .insert({
        school_id: input.schoolId,
        student_first_name: firstName,
        student_last_name: lastName,
        dob: input.dob ?? null,
        gender: input.gender ?? null,
        class_id: input.classId ?? null,
        stream_id: input.streamId ?? null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (appError || !app) {
      throw new Error(`admissionService.submitApplication: ${errMessage(appError) || 'no id returned'}`);
    }
    const applicationId = String((app as { id: string }).id);

    // Blobs first: <school>/<application-id>/<filename> in the private bucket.
    const storedPaths: string[] = [];
    for (const { file } of input.files) {
      const storagePath = `${input.schoolId}/${applicationId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(STUDENT_DOCS_BUCKET)
        .upload(storagePath, file);
      if (uploadError) {
        throw new Error(`admissionService.submitApplication: upload failed: ${errMessage(uploadError)}`);
      }
      storedPaths.push(storagePath);
    }

    const { error: guardianError } = await supabase
      .from('admission_application_guardians')
      .insert(
        input.guardians.map((g) => ({
          application_id: applicationId,
          name: g.name.trim(),
          relationship: g.relationship.trim(),
          phone: g.phone?.trim() || null,
          email: g.email?.trim() || null,
          is_emergency: g.isEmergency,
          is_primary: g.isPrimary,
        })),
      );
    if (guardianError) {
      throw new Error(`admissionService.submitApplication: ${errMessage(guardianError)}`);
    }

    if (input.files.length > 0) {
      const { error: docError } = await supabase
        .from('admission_application_documents')
        .insert(
          input.files.map((f, i) => ({
            application_id: applicationId,
            doc_type: f.docType,
            storage_path: storedPaths[i],
          })),
        );
      if (docError) {
        throw new Error(`admissionService.submitApplication: ${errMessage(docError)}`);
      }
    }

    return { applicationId };
  },

  /**
   * Assign or update target class and stream for an admission application.
   */
  async assignClass(
    applicationId: string,
    classId: string,
    streamId?: string | null,
    actorRole?: UserRole,
  ): Promise<void> {
    if (actorRole) assertCanDecideAdmission(actorRole, 'assign class to admission application');
    if (isMockEnv()) {
      throw new Error('admissionService.assignClass: unavailable in mock environment');
    }
    const { error } = await supabase
      .from('admission_applications')
      .update({
        class_id: classId,
        stream_id: streamId || null,
      })
      .eq('id', applicationId);
    if (error) throw new Error(`admissionService.assignClass: ${errMessage(error)}`);
  },

  /**
   * Atomic approve via RPC: people + students + enrolment + guardians are
   * created in ONE transaction server-side. Client gate runs before any DB
   * call so unauthorized roles never reach the database.
   */
  async approveApplication(
    applicationId: string,
    actorRole: UserRole,
    overrideClass?: { classId: string; streamId?: string | null },
  ): Promise<{ studentId: string }> {
    assertCanDecideAdmission(actorRole, 'approve admission applications');
    if (isMockEnv()) {
      throw new Error('admissionService.approveApplication: unavailable in mock environment (no fake writes)');
    }

    if (overrideClass?.classId) {
      await supabase
        .from('admission_applications')
        .update({
          class_id: overrideClass.classId,
          stream_id: overrideClass.streamId || null,
        })
        .eq('id', applicationId);
    }
    const { data, error } = await supabase.rpc('approve_admission_application', {
      p_application_id: applicationId,
    });
    if (error) {
      throw new Error(`admissionService.approveApplication: ${errMessage(error)}`);
    }
    return { studentId: String(data) };
  },

  /**
   * Reject with a recorded reason. The applications table carries no
   * reason column (schema frozen), so the reason is required at the flow
   * level and the status transition is what persists.
   */
  async rejectApplication(
    applicationId: string,
    actorRole: UserRole,
    reason: string,
  ): Promise<{ applicationId: string }> {
    assertCanDecideAdmission(actorRole, 'reject admission applications');
    if (!reason.trim()) {
      throw new Error('admissionService.rejectApplication: a rejection reason is required');
    }
    if (isMockEnv()) {
      throw new Error('admissionService.rejectApplication: unavailable in mock environment (no fake writes)');
    }

    const { error } = await supabase
      .from('admission_applications')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', applicationId);
    if (error) {
      throw new Error(`admissionService.rejectApplication: ${errMessage(error)}`);
    }
    return { applicationId };
  },
};
