/**
 * Digital Learning Spine P1 — Learning Coach service.
 *
 * Charter §13: coach (parent/guardian) is configurable per school/stage —
 * never hard-coded hours. Capabilities are flags from learning_coach_settings.
 * Hours sign-off + offline-work verify are coach confirmations, not clocks.
 */
import { supabase } from '../../lib/supabase';

export interface LearningCoachSettings {
  id: string;
  schoolId: string;
  stageKey: string | null;
  isEnabled: boolean;
  timezone: string;
  weeklyHoursTarget: number | null;
  capabilities: {
    schedule: boolean;
    viewAssignments: boolean;
    viewOverdue: boolean;
    viewProgress: boolean;
    viewGrades: boolean;
    viewFeedback: boolean;
    receiveAlerts: boolean;
    verifyOfflineWork: boolean;
    signOffHours: boolean;
    chatTeachers: boolean;
  };
}

export interface LearningCoachAssignment {
  id: string;
  schoolId: string;
  studentId: string;
  coachPersonId: string;
  coachRole: 'parent' | 'guardian' | 'staff_coach';
  startsOn: string;
  endsOn: string | null;
  isActive: boolean;
}

export type CoachConfirmationKind = 'hours_sign_off' | 'offline_work_verify' | 'engagement_confirm';

export interface CoachConfirmationInput {
  schoolId: string;
  studentId: string;
  assignmentId: string;
  confirmationKind: CoachConfirmationKind;
  confirmedByPersonId: string;
  hours?: number | null;
  note?: string | null;
  learningActivityId?: string | null;
  confirmedOn?: string;
}

export interface CoachConfirmation {
  id: string;
  schoolId: string;
  studentId: string;
  assignmentId: string | null;
  confirmationKind: CoachConfirmationKind;
  confirmedOn: string;
  hours: number | null;
  note: string | null;
  learningActivityId: string | null;
  confirmedBy: string;
}

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapSettings(r: any): LearningCoachSettings {
  return {
    id: r.id,
    schoolId: r.school_id,
    stageKey: r.stage_key ?? null,
    isEnabled: Boolean(r.is_enabled),
    timezone: r.timezone || 'Africa/Kampala',
    weeklyHoursTarget: r.weekly_hours_target == null ? null : Number(r.weekly_hours_target),
    capabilities: {
      schedule: Boolean(r.can_schedule),
      viewAssignments: Boolean(r.can_view_assignments),
      viewOverdue: Boolean(r.can_view_overdue),
      viewProgress: Boolean(r.can_view_progress),
      viewGrades: Boolean(r.can_view_grades),
      viewFeedback: Boolean(r.can_view_feedback),
      receiveAlerts: Boolean(r.can_receive_alerts),
      verifyOfflineWork: Boolean(r.can_verify_offline_work),
      signOffHours: Boolean(r.can_sign_off_hours),
      chatTeachers: Boolean(r.can_chat_teachers),
    },
  };
}

function mapAssignment(r: any): LearningCoachAssignment {
  return {
    id: r.id,
    schoolId: r.school_id,
    studentId: r.student_id,
    coachPersonId: r.coach_person_id,
    coachRole: r.coach_role,
    startsOn: r.starts_on,
    endsOn: r.ends_on ?? null,
    isActive: Boolean(r.is_active),
  };
}

function mapConfirmation(r: any): CoachConfirmation {
  return {
    id: r.id,
    schoolId: r.school_id,
    studentId: r.student_id,
    assignmentId: r.assignment_id ?? null,
    confirmationKind: r.confirmation_kind,
    confirmedOn: r.confirmed_on,
    hours: r.hours == null ? null : Number(r.hours),
    note: r.note ?? null,
    learningActivityId: r.learning_activity_id ?? null,
    confirmedBy: r.confirmed_by,
  };
}

export function validateCoachConfirmation(input: CoachConfirmationInput): void {
  if (!input.schoolId) throw new Error('learningCoach: schoolId is required');
  if (!input.studentId) throw new Error('learningCoach: studentId is required');
  if (!input.assignmentId) throw new Error('learningCoach: assignmentId is required');
  if (!input.confirmedByPersonId) throw new Error('learningCoach: confirmedByPersonId is required');
  if (input.confirmationKind === 'hours_sign_off') {
    if (input.hours == null || Number(input.hours) < 0) {
      throw new Error('learningCoach: hours_sign_off requires non-negative hours');
    }
  }
}

export const learningCoachService = {
  async getSettings(schoolId: string, stageKey?: string | null): Promise<LearningCoachSettings | null> {
    if (isMockEnv()) return null;
    let query = supabase
      .from('learning_coach_settings')
      .select('*')
      .eq('school_id', schoolId);
    query = stageKey ? query.eq('stage_key', stageKey) : query.is('stage_key', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`learningCoach.getSettings: ${error.message}`);
    return data ? mapSettings(data) : null;
  },

  async upsertSettings(input: {
    schoolId: string;
    stageKey?: string | null;
    isEnabled: boolean;
    timezone?: string;
    weeklyHoursTarget?: number | null;
    capabilities?: Partial<LearningCoachSettings['capabilities']>;
  }): Promise<LearningCoachSettings> {
    if (isMockEnv()) throw new Error('learningCoach.upsertSettings: unavailable without live database');
    const caps = input.capabilities ?? {};
    const payload = {
      school_id: input.schoolId,
      stage_key: input.stageKey ?? null,
      is_enabled: input.isEnabled,
      timezone: input.timezone ?? 'Africa/Kampala',
      weekly_hours_target: input.weeklyHoursTarget ?? null,
      can_schedule: caps.schedule ?? true,
      can_view_assignments: caps.viewAssignments ?? true,
      can_view_overdue: caps.viewOverdue ?? true,
      can_view_progress: caps.viewProgress ?? true,
      can_view_grades: caps.viewGrades ?? true,
      can_view_feedback: caps.viewFeedback ?? true,
      can_receive_alerts: caps.receiveAlerts ?? true,
      can_verify_offline_work: caps.verifyOfflineWork ?? true,
      can_sign_off_hours: caps.signOffHours ?? true,
      can_chat_teachers: caps.chatTeachers ?? true,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('learning_coach_settings')
      .upsert(payload, { onConflict: 'school_id,stage_key' })
      .select('*')
      .single();
    if (error || !data) throw new Error(`learningCoach.upsertSettings: ${error?.message ?? 'no row'}`);
    return mapSettings(data);
  },

  async assignCoach(input: {
    schoolId: string;
    studentId: string;
    coachPersonId: string;
    coachRole?: LearningCoachAssignment['coachRole'];
    startsOn?: string;
    endsOn?: string | null;
  }): Promise<LearningCoachAssignment> {
    if (isMockEnv()) throw new Error('learningCoach.assignCoach: unavailable without live database');
    if (!input.schoolId || !input.studentId || !input.coachPersonId) {
      throw new Error('learningCoach.assignCoach: schoolId, studentId, coachPersonId are required');
    }
    const { data, error } = await supabase
      .from('learning_coach_assignments')
      .insert({
        school_id: input.schoolId,
        student_id: input.studentId,
        coach_person_id: input.coachPersonId,
        coach_role: input.coachRole ?? 'guardian',
        starts_on: input.startsOn ?? new Date().toISOString().slice(0, 10),
        ends_on: input.endsOn ?? null,
        is_active: true,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`learningCoach.assignCoach: ${error?.message ?? 'no row'}`);
    return mapAssignment(data);
  },

  async listAssignmentsForStudent(studentId: string): Promise<LearningCoachAssignment[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('learning_coach_assignments')
      .select('*')
      .eq('student_id', studentId)
      .eq('is_active', true)
      .order('starts_on', { ascending: false });
    if (error) throw new Error(`learningCoach.listAssignmentsForStudent: ${error.message}`);
    return (data ?? []).map(mapAssignment);
  },

  async recordConfirmation(input: CoachConfirmationInput): Promise<CoachConfirmation> {
    validateCoachConfirmation(input);
    if (isMockEnv()) throw new Error('learningCoach.recordConfirmation: unavailable without live database');
    const { data, error } = await supabase
      .from('learning_coach_confirmations')
      .insert({
        school_id: input.schoolId,
        student_id: input.studentId,
        assignment_id: input.assignmentId,
        confirmation_kind: input.confirmationKind,
        confirmed_on: input.confirmedOn ?? new Date().toISOString().slice(0, 10),
        hours: input.confirmationKind === 'hours_sign_off' ? input.hours : (input.hours ?? null),
        note: input.note?.trim() || null,
        learning_activity_id: input.learningActivityId ?? null,
        confirmed_by: input.confirmedByPersonId,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`learningCoach.recordConfirmation: ${error?.message ?? 'no row'}`);
    return mapConfirmation(data);
  },

  async listConfirmationsForStudent(studentId: string): Promise<CoachConfirmation[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('learning_coach_confirmations')
      .select('*')
      .eq('student_id', studentId)
      .order('confirmed_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(`learningCoach.listConfirmationsForStudent: ${error.message}`);
    return (data ?? []).map(mapConfirmation);
  },

  /**
   * Hours signed off in a date window (for the weekly target strip).
   * Deterministic sum of coach hours_sign_off rows — never inferred.
   */
  sumSignedHours(confirmations: CoachConfirmation[], fromIso: string, toIso: string): number {
    return confirmations
      .filter((c) => c.confirmationKind === 'hours_sign_off' && c.confirmedOn >= fromIso && c.confirmedOn <= toIso)
      .reduce((sum, c) => sum + (Number(c.hours) || 0), 0);
  },
};
