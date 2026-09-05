import { supabase } from '../../lib/supabase';

/**
 * Phase 9A Task 2 — online learning centre read services + finance hook.
 *
 * Conventions (per feesService D1 hardening):
 * - Mock env → honest empties ([]), never mock data.
 * - Live DB error → throw (DATABASE_ERROR). Empty table → [] (NO_DATA, success).
 * - School scoping on every query; RLS is the backstop, the service filters
 *   app-side as defence in depth (pricing display modes, engagement rates).
 *
 * Rate-visibility decision (documented): compensation rates are included ONLY
 * for finance roles (admin / principal / bursar, all rows) and for a teacher
 * viewing their OWN engagement rows (a teacher must see their own pay
 * arrangement). Teachers never see peers' rows; learners/guardians get [].
 */
export type OnlineCentreViewerRole =
  | 'learner'
  | 'guardian'
  | 'teacher'
  | 'admin'
  | 'principal'
  | 'bursar';

export type PricingDisplayMode = 'PUBLIC' | 'INTERNAL' | 'ENQUIRY_ONLY';

export interface OnlineProgramme {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  active: boolean;
}

export interface OnlineOffering {
  id: string;
  schoolId: string;
  programmeId?: string;
  title: string;
  deliveryFormat: string;
  active: boolean;
}

export interface OnlinePricingOption {
  id: string;
  schoolId: string;
  offeringId: string;
  feeCategoryId: string | null;
  billingModel: string;
  amount: number;
  currency: string;
  displayMode: PricingDisplayMode;
  active: boolean;
}

export interface OnlineEnrolment {
  id: string;
  schoolId: string;
  studentId: string;
  offeringId?: string;
  offeringTitle?: string;
  pricingOptionId?: string;
  status: string;
}

export interface OnlineSession {
  id: string;
  schoolId: string;
  offeringId?: string;
  teacherId: string;
  status: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface OnlineCompensation {
  id: string;
  payModel: string;
  rate: number;
  currency: string;
}

export interface OnlineEngagement {
  id: string;
  schoolId: string;
  employeeId: string;
  engagementType: string;
  status: string;
  assignmentId?: string;
  offeringId?: string;
  /** Present only for finance roles + owning teacher (see module doc). */
  compensation: OnlineCompensation[];
}

export interface OnlineSessionScope {
  teacherId?: string;
  studentId?: string;
}

export interface EngagementViewer {
  role: OnlineCentreViewerRole;
  employeeId?: string;
}

/**
 * student_charges insert payload produced by the finance hook. Column set
 * mirrors public.student_charges: fee_structure_id/created_by are nullable
 * and omitted here (resolved at charge creation in 9A-2).
 */
export interface OnlineChargePayload {
  school_id: string;
  student_id: string;
  academic_year_id: string;
  term_id: string;
  fee_category_id: string;
  description: string;
  amount: number;
  currency: string;
  due_date: string;
}

const STAFF_ROLES: ReadonlySet<OnlineCentreViewerRole> = new Set([
  'teacher',
  'admin',
  'principal',
  'bursar',
]);

const FINANCE_ROLES: ReadonlySet<OnlineCentreViewerRole> = new Set([
  'admin',
  'principal',
  'bursar',
]);

const VALID_DISPLAY_MODES: ReadonlySet<string> = new Set([
  'PUBLIC',
  'INTERNAL',
  'ENQUIRY_ONLY',
]);

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

function mapProgramme(row: any): OnlineProgramme {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    active: Boolean(row.active),
  };
}

function mapOffering(row: any): OnlineOffering {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    ...(row.programme_id ? { programmeId: String(row.programme_id) } : {}),
    title: String(row.title),
    deliveryFormat: String(row.delivery_format),
    active: Boolean(row.active),
  };
}

function mapPricing(row: any): OnlinePricingOption {
  const mode = String(row.display_mode);
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    offeringId: String(row.offering_id),
    feeCategoryId: row.fee_category_id ?? null,
    billingModel: String(row.billing_model),
    amount: Number(row.amount),
    currency: String(row.currency ?? 'UGX'),
    displayMode: (VALID_DISPLAY_MODES.has(mode) ? mode : 'INTERNAL') as PricingDisplayMode,
    active: Boolean(row.active),
  };
}

function mapEnrolment(row: any): OnlineEnrolment {
  const offering = one(row.offering);
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    studentId: String(row.student_id),
    ...(row.offering_id ? { offeringId: String(row.offering_id) } : {}),
    ...(offering?.title ? { offeringTitle: String(offering.title) } : {}),
    ...(row.pricing_option_id ? { pricingOptionId: String(row.pricing_option_id) } : {}),
    status: String(row.status),
  };
}

function mapSession(row: any): OnlineSession {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    ...(row.offering_id ? { offeringId: String(row.offering_id) } : {}),
    teacherId: String(row.teacher_id),
    status: String(row.status),
    ...(row.scheduled_start ? { scheduledStart: String(row.scheduled_start) } : {}),
    ...(row.scheduled_end ? { scheduledEnd: String(row.scheduled_end) } : {}),
  };
}

function mapEngagement(row: any): OnlineEngagement {
  const assignment = one(row.assignment);
  const compRows = Array.isArray(row.compensation) ? row.compensation : row.compensation ? [row.compensation] : [];
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    employeeId: String(row.employee_id),
    engagementType: String(row.engagement_type),
    status: String(row.status),
    ...(assignment?.id ? { assignmentId: String(assignment.id) } : {}),
    ...(assignment?.offering_id ? { offeringId: String(assignment.offering_id) } : {}),
    compensation: compRows.map((c: any) => ({
      id: String(c.id),
      payModel: String(c.pay_model),
      rate: Number(c.rate),
      currency: String(c.currency ?? 'UGX'),
    })),
  };
}

export const onlineCentreService = {
  /** Catalogue: active programmes for a school. Mock → []. Throws on DB error. */
  async getProgrammes(schoolId: string): Promise<OnlineProgramme[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('online_programmes')
      .select('id, school_id, name, description, active')
      .eq('school_id', schoolId)
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return ((data ?? []) as any[]).map(mapProgramme);
  },

  /** Offerings for a programme (or all school offerings when omitted). */
  async getOfferings(schoolId: string, programmeId?: string): Promise<OnlineOffering[]> {
    if (isMockEnv()) return [];
    let query = supabase
      .from('online_offerings')
      .select('id, school_id, programme_id, title, delivery_format, active')
      .eq('school_id', schoolId)
      .eq('active', true);
    if (programmeId) query = query.eq('programme_id', programmeId);
    const { data, error } = await query.order('title');
    if (error) throw error;
    return ((data ?? []) as any[]).map(mapOffering);
  },

  /**
   * Pricing for an offering, scoped by viewer role. PUBLIC-only for
   * learners/guardians (app-side filter backs the RLS policy); staff see
   * INTERNAL + ENQUIRY_ONLY too.
   */
  async getPricing(
    schoolId: string,
    offeringId: string,
    viewerRole: OnlineCentreViewerRole,
  ): Promise<OnlinePricingOption[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('online_pricing_options')
      .select('id, school_id, offering_id, fee_category_id, billing_model, amount, currency, display_mode, active')
      .eq('school_id', schoolId)
      .eq('offering_id', offeringId)
      .eq('active', true);
    if (error) throw error;
    const rows = ((data ?? []) as any[]).map(mapPricing);
    if (STAFF_ROLES.has(viewerRole)) return rows;
    return rows.filter((p) => p.displayMode === 'PUBLIC');
  },

  /** Enrolments for one student, resolved to offering titles. */
  async getEnrolments(schoolId: string, studentId: string): Promise<OnlineEnrolment[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('online_enrolments')
      .select('id, school_id, student_id, offering_id, pricing_option_id, status, offering:online_offerings(id, title)')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map(mapEnrolment);
  },

  /**
   * Sessions scoped to exactly one party: a teacher sees sessions for their
   * assignments (teacher_id); a student sees only sessions they participate
   * in (via online_session_participants). Unscoped reads throw — a broad
   * session list must never be returned silently.
   */
  async getSessions(schoolId: string, scope: OnlineSessionScope): Promise<OnlineSession[]> {
    if (isMockEnv()) return [];
    if (scope.teacherId) {
      const { data, error } = await supabase
        .from('online_sessions')
        .select('id, school_id, offering_id, teacher_id, status, scheduled_start, scheduled_end')
        .eq('school_id', schoolId)
        .eq('teacher_id', scope.teacherId)
        .order('scheduled_start');
      if (error) throw error;
      return ((data ?? []) as any[]).map(mapSession);
    }
    if (scope.studentId) {
      const { data: partRows, error: partError } = await supabase
        .from('online_session_participants')
        .select('session_id')
        .eq('student_id', scope.studentId);
      if (partError) throw partError;
      const sessionIds = [...new Set(((partRows ?? []) as any[]).map((p) => p.session_id).filter(Boolean))];
      if (sessionIds.length === 0) return [];
      const { data, error } = await supabase
        .from('online_sessions')
        .select('id, school_id, offering_id, teacher_id, status, scheduled_start, scheduled_end')
        .eq('school_id', schoolId)
        .in('id', sessionIds)
        .order('scheduled_start');
      if (error) throw error;
      return ((data ?? []) as any[]).map(mapSession);
    }
    throw new Error('onlineCentreService.getSessions requires teacherId or studentId scope');
  },

  /**
   * Teacher engagements + assignments + compensation. Staff-only:
   * learners/guardians get []. Finance roles see all rows with rates;
   * teachers see only their own rows (rates included for own rows).
   */
  async getEngagements(schoolId: string, viewer: EngagementViewer): Promise<OnlineEngagement[]> {
    if (isMockEnv()) return [];
    if (!STAFF_ROLES.has(viewer.role)) return [];
    const { data, error } = await supabase
      .from('online_teacher_engagements')
      .select('id, school_id, employee_id, engagement_type, status, assignment:online_teaching_assignments(id, offering_id), compensation:online_compensation_rules!inner(id, pay_model, rate, currency)')
      .eq('school_id', schoolId);
    if (error) throw error;
    const rows = ((data ?? []) as any[]).map(mapEngagement);
    if (FINANCE_ROLES.has(viewer.role)) return rows;
    // Owning teacher: own rows only (rates included for own arrangement).
    return rows.filter((r) => (viewer.employeeId ? r.employeeId === viewer.employeeId : false));
  },
};

/**
 * Finance hook PROOF — pure mapper, no DB.
 *
 * Maps (pricing option + enrolment) to a valid public.student_charges row.
 * Year/term decision: online charges reference the centre's ACTIVE term row,
 * so the caller supplies the active academic_year_id + term_id (resolved
 * from the centre's active term, exactly like feesService.getFeesDashboard
 * takes an explicit termId). fee_structure_id/created_by stay null and are
 * resolved at charge creation in 9A-2.
 *
 * Throws when the pricing option carries no fee_category_id (charge wiring
 * unresolved — a charge row requires a category) or the amount is not
 * positive (student_charges CHECK amount > 0).
 */
export function buildChargeFromPricing(
  pricing: OnlinePricingOption,
  enrolment: OnlineEnrolment,
  term: { academicYearId: string; termId: string; description?: string; dueDate?: string },
): OnlineChargePayload {
  if (!pricing.feeCategoryId) {
    throw new Error('buildChargeFromPricing: pricing option has no fee_category_id (charge wiring unresolved)');
  }
  if (!(pricing.amount > 0)) {
    throw new Error('buildChargeFromPricing: amount must be positive (student_charges CHECK amount > 0)');
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    school_id: enrolment.schoolId,
    student_id: enrolment.studentId,
    academic_year_id: term.academicYearId,
    term_id: term.termId,
    fee_category_id: pricing.feeCategoryId,
    description:
      term.description ??
      `Online centre: ${enrolment.offeringTitle ?? enrolment.offeringId ?? 'enrolment'} (${pricing.billingModel})`,
    amount: pricing.amount,
    currency: pricing.currency,
    due_date: term.dueDate ?? today,
  };
}
