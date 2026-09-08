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

      let enrolQuery = supabase
        .from('activity_enrolments')
        .select('student_id, student_name, class_name, stream_name')
        .eq('activity_id', activityId);
      if (schoolId) enrolQuery = enrolQuery.eq('school_id', schoolId);
      const { data: enrolRows, error: enrolError } = await enrolQuery;
      if (enrolError) throw enrolError;

      let clrQuery = supabase
        .from('activity_clearances')
        .select('student_id, status, basis, valid_until, operational_note')
        .eq('activity_id', activityId);
      if (schoolId) clrQuery = clrQuery.eq('school_id', schoolId);
      const { data: clrRows, error: clrError } = await clrQuery;
      if (clrError) throw clrError;

      return (enrolRows || []).map((enr: any) => {
        const clearance = (clrRows || []).find((c: any) => c.student_id === enr.student_id);
        return toParticipantProjection({
          studentId: enr.student_id,
          studentName: enr.student_name,
          className: enr.class_name,
          streamName: enr.stream_name,
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
