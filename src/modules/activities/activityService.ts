/**
 * Native School Activities & Clearance Service — SomaCampus Phase 7
 *
 * Implements:
 * 1. School activities and club offerings
 * 2. Activity enrollment and financial obligation linkage
 * 3. Decoupled operational clearance ledger (Payment != Participation)
 * 4. Teacher Financial Privacy Firewall projection:
 *    Teachers see ONLY operational clearance status (e.g. "✓ Cleared • Promise to Pay")
 *    with strictly ZERO monetary amounts or debt history.
 */

import { supabase } from '../../lib/supabase';
import {
  SchoolActivity,
  ActivityClearance,
  ActivityParticipantProjection,
  ClearanceStatus,
  ClearanceBasis,
} from '../../types/domain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

import { activityFixtureStore } from './fixtures/activityFixtures';

/** Latest/first active class enrolment for a student embed (array or object form). */
function firstEnrolment(embedded: unknown): any {
  const arr = Array.isArray(embedded) ? embedded : embedded ? [embedded] : [];
  return arr[0] ?? null;
}

/**
 * Server-side allowlist constructor for the Teacher Financial Privacy Firewall.
 * ONLY operational fields are emitted. Financial settlement data (amounts,
 * balances, charge/payment IDs) lives in separate tables/columns and is NEVER
 * read here — operational permission stays decoupled from financial settlement.
 */
export function toParticipantProjection(input: {
  studentId: string;
  studentName?: string | null;
  className?: string | null;
  streamName?: string | null;
  activityId: string;
  activityName?: string | null;
  status: ClearanceStatus;
  basis: ClearanceBasis;
  validUntil?: string | null;
  operationalNote?: string | null;
}): ActivityParticipantProjection {
  let label = 'Pending Review';
  if (input.status === 'cleared') {
    if (input.basis === 'paid') label = '✓ Cleared • Paid';
    else if (input.basis === 'waived') label = '✓ Cleared • Fee Waived';
    else if (input.basis === 'sponsored') label = '✓ Cleared • Sponsored';
    else if (input.basis === 'promise_to_pay') label = '✓ Cleared • Promise to Pay';
    else if (input.basis === 'included') label = '✓ Cleared • Included';
    else label = '✓ Cleared • Admin Override';
  } else if (input.status === 'not_cleared') {
    label = '✗ Not Cleared for Participation';
  }

  return {
    studentId: input.studentId,
    studentName: input.studentName || 'Student',
    className: input.className || 'General',
    streamName: input.streamName ?? null,
    activityId: input.activityId,
    activityName: input.activityName || 'Activity',
    clearanceStatus: input.status,
    clearanceLabel: label,
    validUntil: input.validUntil ?? null,
    operationalNote: input.operationalNote ?? null,
  };
}

export const activityService = {
  /**
   * Create a new school activity (club). Leadership/finance only — RLS
   * enforces has_school_finance_access for writes; the teacher firewall means
   * the UI never shows the form to teachers.
   */
  async createActivity(payload: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    name: string;
    category: 'sports' | 'arts' | 'academic_club' | 'excursion' | 'special_service';
    isPaid: boolean;
    feeAmount: number;
    capacity?: number | null;
  }): Promise<SchoolActivity> {
    if (isMockEnv()) {
      throw new Error('Activity creation requires a live connection.');
    }
    const { data, error } = await supabase
      .from('school_activities')
      .insert({
        school_id: payload.schoolId,
        academic_year_id: payload.academicYearId,
        term_id: payload.termId,
        name: payload.name.trim(),
        category: payload.category,
        is_paid: payload.isPaid,
        fee_amount: payload.isPaid ? payload.feeAmount : 0,
        capacity: payload.capacity ?? null,
        status: 'active',
      })
      .select('*')
      .single();
    if (error) throw error;
    const a: any = data;
    return {
      id: a.id,
      schoolId: a.school_id,
      academicYearId: a.academic_year_id,
      termId: a.term_id,
      name: a.name,
      category: a.category,
      isPaid: a.is_paid,
      feeAmount: Number(a.fee_amount),
      leadTeacherId: a.lead_teacher_id,
      capacity: a.capacity,
      status: a.status,
      createdAt: a.created_at,
    };
  },

  /**
   * Bulk-enrol pupils into an activity. Paid activities are billed through
   * the fees platform by enroll_students_in_activity (one charge per pupil
   * per club; re-running never double-bills). Returns the server's counts.
   */
  async enrollStudents(
    schoolId: string,
    activityId: string,
    studentIds: string[],
  ): Promise<{ enrolled: number; billed: number; already_billed: number }> {
    if (isMockEnv()) {
      throw new Error('Enrolment requires a live connection.');
    }
    const { data, error } = await supabase.rpc('enroll_students_in_activity', {
      p_school_id: schoolId,
      p_activity_id: activityId,
      p_student_ids: studentIds,
    });
    if (error) throw error;
    return data as { enrolled: number; billed: number; already_billed: number };
  },

  /**
   * List all school activities
   */
  async getActivities(schoolId: string, termId?: string): Promise<SchoolActivity[]> {
    if (isMockEnv()) {
      return activityFixtureStore.activities;
    }
    try {
      let query = supabase.from('school_activities').select('*').eq('school_id', schoolId);
      if (termId) query = query.eq('term_id', termId);
      const { data, error } = await query;
      if (error) throw error;
      const ids = (data || []).map((a: any) => a.id);
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: enrolRows, error: enrolErr } = await supabase
          .from('activity_enrolments')
          .select('activity_id')
          .in('activity_id', ids)
          .eq('status', 'enrolled');
        if (!enrolErr) {
          for (const row of (enrolRows || []) as any[]) {
            counts.set(row.activity_id, (counts.get(row.activity_id) ?? 0) + 1);
          }
        }
      }
      return (data || []).map((a: any) => ({
        id: a.id,
        schoolId: a.school_id,
        academicYearId: a.academic_year_id,
        termId: a.term_id,
        name: a.name,
        category: a.category,
        isPaid: a.is_paid,
        feeAmount: Number(a.fee_amount),
        leadTeacherId: a.lead_teacher_id,
        capacity: a.capacity,
        status: a.status,
        createdAt: a.created_at,
        enrolledCount: counts.get(a.id) ?? 0,
      }));
    } catch (err) {
      throw new Error('Failed to fetch school activities', { cause: err });
    }
  },

  /**
   * Set or update operational clearance for an enrolled student
   */
  async setOperationalClearance(payload: {
    schoolId: string;
    activityId: string;
    studentId: string;
    status: ClearanceStatus;
    basis: ClearanceBasis;
    validUntil?: string | null;
    operationalNote?: string | null;
  }): Promise<ActivityClearance> {
    if (isMockEnv()) {
      const existingIdx = activityFixtureStore.clearances.findIndex(
        (c) => c.activityId === payload.activityId && c.studentId === payload.studentId
      );
      const clr: ActivityClearance = {
        id: existingIdx >= 0 ? activityFixtureStore.clearances[existingIdx].id : `clr-${Date.now()}`,
        schoolId: payload.schoolId,
        activityId: payload.activityId,
        studentId: payload.studentId,
        status: payload.status,
        basis: payload.basis,
        validUntil: payload.validUntil,
        operationalNote: payload.operationalNote,
        clearedAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        activityFixtureStore.clearances[existingIdx] = clr;
      } else {
        activityFixtureStore.clearances.push(clr);
      }
      return clr;
    }

    const { data, error } = await supabase
      .from('activity_clearances')
      .upsert(
        {
          school_id: payload.schoolId,
          activity_id: payload.activityId,
          student_id: payload.studentId,
          status: payload.status,
          basis: payload.basis,
          valid_until: payload.validUntil || null,
          operational_note: payload.operationalNote || null,
        },
        { onConflict: 'activity_id,student_id' }
      )
      .select()
      .single();

    if (error) throw new Error(`Failed to set clearance: ${error.message}`);
    return {
      id: data.id,
      schoolId: data.school_id,
      activityId: data.activity_id,
      studentId: data.student_id,
      status: data.status,
      basis: data.basis,
      validUntil: data.valid_until,
      operationalNote: data.operational_note,
      clearedAt: data.cleared_at,
    };
  },

  /**
   * Primary consumer query for teachers and coaches. Emits exclusively operational
   * projection records, completely separated from financial collection rows.
   *
   * In non-mock environments, queries live Supabase and fails closed on DB errors —
   * they are never masked with mock data.
   */
  async getRosterForTeacher(
    activityId: string,
    schoolId?: string
  ): Promise<ActivityParticipantProjection[]> {
    if (!isMockEnv()) {
      const { data: activityRow, error: actError } = await supabase
        .from('school_activities')
        .select('name, school_id')
        .eq('id', activityId)
        .maybeSingle();
      if (actError) throw actError;
      if (!activityRow) return [];
      if (schoolId && activityRow.school_id !== schoolId) return [];

      // activity_enrolments carries only institutional columns (student_id,
      // charge_id, status); names come from students/people. The previous
      // query selected student_name/class_name/stream_name - columns that do
      // not exist on the live table (same phantom-column class as F2).
      const enrolQuery = supabase
        .from('activity_enrolments')
        .select('student_id, status')
        .eq('activity_id', activityId);
      if (schoolId) enrolQuery.eq('school_id', schoolId);
      const { data: enrolRows, error: enrolError } = await enrolQuery;
      if (enrolError) throw enrolError;
      const enrolList = (enrolRows || []) as any[];

      const clrQuery = supabase
        .from('activity_clearances')
        .select('student_id, status, basis, valid_until, operational_note')
        .eq('activity_id', activityId);
      if (schoolId) clrQuery.eq('school_id', schoolId);
      const { data: clrRows, error: clrError } = await clrQuery;
      if (clrError) throw clrError;

      const studentIds = [...new Set(enrolList.map((e) => String(e.student_id)))];
      let nameByStudent = new Map<string, { name: string; className: string }>();
      if (studentIds.length > 0) {
        const { data: studentRows, error: studentError } = await supabase
          .from('students')
          .select('id, admission_number, person:people!students_person_id_fkey(first_name, last_name), student_enrolments(class_id, classes(id, name))')
          .in('id', studentIds)
          .eq('student_enrolments.status', 'active');
        if (studentError) throw studentError;
        for (const s of (studentRows || []) as any[]) {
          const person = Array.isArray(s.person) ? s.person[0] : s.person;
          const name = person ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() : s.admission_number ?? 'Student';
          const enrol = firstEnrolment(s.student_enrolments);
          const cls = enrol ? (Array.isArray(enrol.classes) ? enrol.classes[0] : enrol.classes) : null;
          nameByStudent.set(String(s.id), { name: name || 'Student', className: cls?.name ?? 'General' });
        }
      }

      return enrolList.map((enr: any) => {
        const clearance = (clrRows || []).find((c: any) => c.student_id === enr.student_id);
        const names = nameByStudent.get(String(enr.student_id));
        return toParticipantProjection({
          studentId: enr.student_id,
          studentName: names?.name,
          className: names?.className,
          activityId,
          activityName: (activityRow as any)?.name,
          status: clearance?.status || 'pending_review',
          basis: clearance?.basis || 'promise_to_pay',
          validUntil: clearance?.valid_until,
          operationalNote: clearance?.operational_note,
        });
      });
    }

    const activity = activityFixtureStore.activities.find((a) => a.id === activityId);
    if (schoolId && activity && activity.schoolId !== schoolId) return [];
    const enrolments = activityFixtureStore.enrolments.filter(
      (e) => e.activityId === activityId && (!schoolId || e.schoolId === schoolId)
    );

    return enrolments.map((enr) => {
      const clearance = activityFixtureStore.clearances.find(
        (c) => c.activityId === activityId && c.studentId === enr.studentId
      );

      return toParticipantProjection({
        studentId: enr.studentId,
        studentName: enr.studentName,
        className: enr.className,
        streamName: enr.streamName,
        activityId,
        activityName: activity?.name,
        status: clearance?.status || 'pending_review',
        basis: clearance?.basis || 'promise_to_pay',
        validUntil: clearance?.validUntil,
        operationalNote: clearance?.operationalNote,
      });
    });
  },
};
