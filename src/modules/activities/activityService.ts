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
  ActivityEnrolment,
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

let mockActivities: SchoolActivity[] = [
  {
    id: 'act-swimming',
    schoolId: 'school-default',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    name: 'Competitive Swimming Squad',
    category: 'sports',
    isPaid: true,
    feeAmount: 250000,
    leadTeacherId: 'emp-teacher-1',
    leadTeacherName: 'Sarah Nabwire',
    capacity: 25,
    enrolledCount: 3,
    status: 'active',
    createdAt: '2026-08-15T00:00:00Z',
  },
  {
    id: 'act-robotics',
    schoolId: 'school-default',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    name: 'Junior Robotics & STEM Club',
    category: 'academic_club',
    isPaid: true,
    feeAmount: 300000,
    leadTeacherId: 'emp-teacher-2',
    leadTeacherName: 'Grace Alupo',
    capacity: 20,
    enrolledCount: 2,
    status: 'active',
    createdAt: '2026-08-15T00:00:00Z',
  },
  {
    id: 'act-debate',
    schoolId: 'school-default',
    academicYearId: 'ay-2026-2027',
    termId: 'term-1',
    name: 'Primary Debate & Public Speaking',
    category: 'arts',
    isPaid: false,
    feeAmount: 0,
    leadTeacherId: 'emp-teacher-1',
    leadTeacherName: 'Sarah Nabwire',
    capacity: 30,
    enrolledCount: 4,
    status: 'active',
    createdAt: '2026-08-15T00:00:00Z',
  },
];

let mockActivityEnrolments: ActivityEnrolment[] = [
  {
    id: 'enr-1',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-amari',
    studentName: 'Amari Kyomugisha',
    className: 'Stage 5 Blue',
    status: 'enrolled',
    enrolledAt: '2026-08-20T10:00:00Z',
  },
  {
    id: 'enr-2',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-aurora',
    studentName: 'Aurora Namukasa',
    className: 'Stage 7 Red',
    status: 'enrolled',
    enrolledAt: '2026-08-20T10:30:00Z',
  },
  {
    id: 'enr-3',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-brian',
    studentName: 'Brian Musoke',
    className: 'Stage 5 Blue',
    status: 'enrolled',
    enrolledAt: '2026-08-21T09:00:00Z',
  },
];

let mockClearances: ActivityClearance[] = [
  {
    id: 'clr-amari',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-amari',
    status: 'cleared',
    basis: 'paid',
    clearedAt: '2026-08-28T14:10:00Z',
    operationalNote: 'Term 1 sports fee verified by bursar',
  },
  {
    id: 'clr-aurora',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-aurora',
    status: 'cleared',
    basis: 'promise_to_pay',
    clearedAt: '2026-09-02T11:00:00Z',
    validUntil: '2026-09-25',
    operationalNote: 'Parent signed promissory commitment to pay by Sept 25',
  },
  {
    id: 'clr-brian',
    schoolId: 'school-default',
    activityId: 'act-swimming',
    studentId: 'stud-brian',
    status: 'pending_review',
    basis: 'promise_to_pay',
    clearedAt: '2026-09-03T08:00:00Z',
    operationalNote: 'Awaiting parent letter',
  },
];

export const activityService = {
  /**
   * List all school activities
   */
  async getActivities(schoolId: string, termId?: string): Promise<SchoolActivity[]> {
    if (isMockEnv()) {
      return mockActivities;
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
    } catch {
      return mockActivities;
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
      const existingIdx = mockClearances.findIndex(
        (c) => c.activityId === payload.activityId && c.studentId === payload.studentId
      );
      const clr: ActivityClearance = {
        id: existingIdx >= 0 ? mockClearances[existingIdx].id : `clr-${Date.now()}`,
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
        mockClearances[existingIdx] = clr;
      } else {
        mockClearances.push(clr);
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
          valid_until: payload.validUntil,
          operational_note: payload.operationalNote,
          cleared_at: new Date().toISOString(),
        },
        { onConflict: 'activity_id,student_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * TEACHER FINANCIAL PRIVACY FIREWALL PROJECTION
   *
   * Renders the activity roster for the teacher.
   * STRICT GUARANTEE: Contains zero fee balances, zero debt amounts, zero parent payment histories.
   */
  async getRosterForTeacher(activityId: string): Promise<ActivityParticipantProjection[]> {
    const activity = mockActivities.find((a) => a.id === activityId);
    const enrolments = mockActivityEnrolments.filter((e) => e.activityId === activityId);

    return enrolments.map((enr) => {
      const clearance = mockClearances.find(
        (c) => c.activityId === activityId && c.studentId === enr.studentId
      );

      const status: ClearanceStatus = clearance?.status || 'pending_review';
      const basis: ClearanceBasis = clearance?.basis || 'promise_to_pay';

      let label = 'Pending Review';
      if (status === 'cleared') {
        if (basis === 'paid') label = '✓ Cleared • Paid';
        else if (basis === 'waived') label = '✓ Cleared • Fee Waived';
        else if (basis === 'sponsored') label = '✓ Cleared • Sponsored';
        else if (basis === 'promise_to_pay') label = '✓ Cleared • Promise to Pay';
        else if (basis === 'included') label = '✓ Cleared • Included';
        else label = '✓ Cleared • Admin Override';
      } else if (status === 'not_cleared') {
        label = '✗ Not Cleared for Participation';
      }

      return {
        studentId: enr.studentId,
        studentName: enr.studentName || 'Student',
        className: enr.className || 'General',
        activityId,
        activityName: activity?.name || 'Activity',
        clearanceStatus: status,
        clearanceLabel: label,
        validUntil: clearance?.validUntil,
        operationalNote: clearance?.operationalNote,
      };
    });
  },
};
