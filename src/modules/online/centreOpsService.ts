import { supabase } from '../../lib/supabase';

/**
 * Phase 9G Task 1 — centre operations dashboard service (read-only aggregates
 * + programme/offering catalogue management).
 *
 * Conventions (per feesService D1 hardening + 9A onlineCentreService):
 * - Mock env → honest empties (zeros / []), never mock data.
 * - Live DB error → throw. Empty table → zeros/[] (NO_DATA, success).
 * - School scoping on every query; app-side window/status filters back the
 *   DB filters as defence in depth (same precedent as pricing display modes).
 * - No new billing logic and no migrations: revenue reads existing
 *   student_charges rows; cost reads existing online_sessions ×
 *   online_teacher_engagements rates. This module never writes charges,
 *   payroll, attendance or finance rows.
 *
 * ROLE DECISIONS (locked):
 * - Money roles (amounts visible): admin (= director-level), principal,
 *   bursar. getCentreDay includes revenue/cost/margin keys ONLY for these
 *   roles; teacher results omit the keys entirely (never null/0 — absent).
 * - getProgrammeEconomics is a money-only surface: non-money roles throw.
 * - Teachers keep their existing operational day view (/teaching/online);
 *   the CentreOpsPage route (/online/centre) is gated to money roles.
 * - Catalogue reads: staff (teacher + money roles). Catalogue writes
 *   (create/edit programmes/offerings): money roles only — the centre is
 *   managed by director/principal/bursar, teachers are read-only.
 *
 * "APPROVED COMPLETED" DECISION: public.online_sessions carries no approval
 * column (verified against migration 20260914000000; no migrations allowed
 * here). The 9C completion flow requires a non-empty completion note to
 * reach COMPLETED, so COMPLETED is the approved terminal state: cost counts
 * COMPLETED sessions only. SCHEDULED/CONFIRMED/IN_PROGRESS (not yet
 * approved), CANCELLED and NO_SHOW are never costed.
 *
 * COST MODEL: one per_session rate per COMPLETED session. Rate resolution:
 * engagement (employee_id = session teacher, active preferred) →
 * assignment (offering_id = session offering) → compensation rule with
 * pay_model 'per_session' → rate × 1. pay_model 'none' (salaried-included,
 * rate 0) and 'monthly' are NOT session-driven → 0. No matching
 * engagement/assignment/rate → 0 (never throws, never guesses).
 *
 * REVENUE MODEL: student_charges for students holding an online enrolment,
 * with created_at inside the period window. Charges for non-enrolled
 * students are excluded (proves the online-enrolment linkage). Per-offering
 * attribution: each charge counts once, against the student's first
 * enrolment offering within the programme (students with a single
 * enrolment — the normal case — are unambiguous).
 */

export type CentreOpsViewerRole =
  | 'admin'
  | 'principal'
  | 'bursar'
  | 'teacher'
  | 'parent'
  | 'student'
  | 'learner'
  | 'guardian';

export interface CentreOpsViewer {
  role: CentreOpsViewerRole;
}

export interface CentreDayStats {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  pending: number;
  activeLearners: number;
  activeTeachers: number;
  teachingHours: number;
}

export interface CentreSessionItem {
  id: string;
  offeringId?: string;
  teacherId: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  durationHours: number;
}

export interface CentreDayResult {
  date: string;
  stats: CentreDayStats;
  sessions: CentreSessionItem[];
  /** Present ONLY for money roles (admin/principal/bursar). Absent for teachers. */
  revenue?: number;
  /** Present ONLY for money roles (admin/principal/bursar). Absent for teachers. */
  cost?: number;
  /** Present ONLY for money roles (admin/principal/bursar). Absent for teachers. */
  margin?: number;
}

export interface OfferingEconomics {
  offeringId: string;
  title: string;
  revenue: number;
  cost: number;
  margin: number;
  sessionsCompleted: number;
}

export interface ProgrammeEconomics {
  programmeId: string;
  period: { from: string; to: string };
  offerings: OfferingEconomics[];
  totals: { revenue: number; cost: number; margin: number };
}

export interface CentreProgramme {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  active: boolean;
}

export interface CentreOffering {
  id: string;
  schoolId: string;
  programmeId?: string;
  title: string;
  deliveryFormat: string;
  active: boolean;
}

export interface ProgrammeInput {
  name: string;
  description?: string;
  active?: boolean;
}

export interface ProgrammePatch {
  name?: string;
  description?: string;
  active?: boolean;
}

export interface OfferingInput {
  programmeId?: string;
  title: string;
  deliveryFormat: string;
  active?: boolean;
}

export interface OfferingPatch {
  programmeId?: string;
  title?: string;
  deliveryFormat?: string;
  active?: boolean;
}

const MONEY_ROLES: ReadonlySet<string> = new Set(['admin', 'principal', 'bursar']);
const STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'principal', 'bursar', 'teacher']);

const VALID_DELIVERY_FORMATS: ReadonlySet<string> = new Set([
  'one_to_one',
  'small_group',
  'group',
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function assertDate(date: string, field: string): void {
  if (!DATE_RE.test(date)) {
    throw new Error(`centreOpsService: invalid ${field} ${JSON.stringify(date)} (expected YYYY-MM-DD)`);
  }
}

function dayWindow(date: string): { start: string; end: string } {
  assertDate(date, 'date');
  const d = new Date(`${date}T00:00:00Z`);
  const end = new Date(d.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { start: `${date}T00:00:00Z`, end: `${end}T00:00:00Z` };
}

function periodWindow(period: { from: string; to: string }): { start: string; end: string } {
  assertDate(period.from, 'from');
  assertDate(period.to, 'to');
  if (period.to < period.from) {
    throw new Error(
      `centreOpsService: invalid period ${period.from}..${period.to} (to must be >= from)`,
    );
  }
  const d = new Date(`${period.to}T00:00:00Z`);
  const dayAfter = new Date(d.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { start: `${period.from}T00:00:00Z`, end: `${dayAfter}T00:00:00Z` };
}

const inWindow = (iso: string, start: string, end: string): boolean =>
  typeof iso === 'string' && iso >= start && iso < end;

function durationHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3600000) * 100) / 100;
}

function mapSession(row: any): CentreSessionItem {
  const start = String(row.scheduled_start);
  const end = String(row.scheduled_end);
  return {
    id: String(row.id),
    ...(row.offering_id ? { offeringId: String(row.offering_id) } : {}),
    teacherId: String(row.teacher_id),
    status: String(row.status),
    scheduledStart: start,
    scheduledEnd: end,
    durationHours: durationHours(start, end),
  };
}

function mapProgramme(row: any): CentreProgramme {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    active: Boolean(row.active),
  };
}

function mapOffering(row: any): CentreOffering {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    ...(row.programme_id ? { programmeId: String(row.programme_id) } : {}),
    title: String(row.title),
    deliveryFormat: String(row.delivery_format),
    active: Boolean(row.active),
  };
}

interface EngagementRate {
  employeeId: string;
  offeringId?: string;
  perSessionRate: number;
}

function flattenRates(rows: any[]): EngagementRate[] {
  const out: EngagementRate[] = [];
  for (const row of rows ?? []) {
    const rawAssignments = Array.isArray(row.assignments)
      ? row.assignments
      : row.assignments
        ? [row.assignments]
        : [];
    for (const a of rawAssignments.filter((x: any) => x != null)) {
      const compRows = Array.isArray(a?.compensation)
        ? a.compensation
        : a?.compensation
          ? [a.compensation]
          : [];
      // Active engagement preferred, but a rate row is a rate row: keep all,
      // first match wins at lookup (active rows sort first below).
      const perSession = compRows.find((c: any) => String(c.pay_model) === 'per_session');
      out.push({
        employeeId: String(row.employee_id),
        ...(a?.offering_id ? { offeringId: String(a.offering_id) } : {}),
        perSessionRate: perSession ? Number(perSession.rate) || 0 : 0,
      });
    }
  }
  return out;
}

function sortEngagementsActiveFirst(rows: any[]): any[] {
  return [...(rows ?? [])].sort((a, b) => {
    const aActive = String(a.status) === 'active' ? 0 : 1;
    const bActive = String(b.status) === 'active' ? 0 : 1;
    return aActive - bActive;
  });
}

/** Rate × 1 for a COMPLETED session; 0 when no per_session rate matches. */
function costForSession(session: CentreSessionItem, rates: EngagementRate[]): number {
  if (session.status !== 'COMPLETED') return 0;
  const match = rates.find(
    (r) => r.employeeId === session.teacherId && r.offeringId === session.offeringId,
  );
  if (!match) return 0;
  return match.perSessionRate > 0 ? match.perSessionRate : 0;
}

const SESSION_SELECT =
  'id, school_id, offering_id, teacher_id, status, scheduled_start, scheduled_end';

const ENGAGEMENT_SELECT =
  'id, school_id, employee_id, engagement_type, status, assignments:online_teaching_assignments(id, offering_id, compensation:online_compensation_rules(id, pay_model, rate, currency))';

const emptyStats = (): CentreDayStats => ({
  total: 0,
  scheduled: 0,
  completed: 0,
  cancelled: 0,
  pending: 0,
  activeLearners: 0,
  activeTeachers: 0,
  teachingHours: 0,
});

function assertStaff(viewer: CentreOpsViewer, action: string): void {
  if (!STAFF_ROLES.has(viewer.role)) {
    throw new Error(`centreOpsService.${action}: role ${viewer.role} is not centre staff`);
  }
}

function assertMoneyRole(viewer: CentreOpsViewer, action: string): void {
  if (!MONEY_ROLES.has(viewer.role)) {
    throw new Error(
      `centreOpsService.${action}: role ${viewer.role} may not view centre money (director/principal/bursar only)`,
    );
  }
}

export const centreOpsService = {
  /**
   * Centre day view: session counts by status bucket, active learners /
   * teachers, teaching hours, session list. Money roles additionally get
   * revenue/cost/margin for the day; teachers get NO money keys.
   *
   * Status buckets (every session lands in exactly one):
   * - scheduled: SCHEDULED + CONFIRMED
   * - completed: COMPLETED (the approved terminal state — see module doc)
   * - cancelled: CANCELLED
   * - pending: IN_PROGRESS + NO_SHOW (in flight / unresolved)
   */
  async getCentreDay(
    schoolId: string,
    date: string,
    viewer: CentreOpsViewer,
  ): Promise<CentreDayResult> {
    const isMoney = MONEY_ROLES.has(viewer.role);
    if (isMockEnv()) {
      const base: CentreDayResult = { date, stats: emptyStats(), sessions: [] };
      return isMoney ? { ...base, revenue: 0, cost: 0, margin: 0 } : base;
    }
    const { start, end } = dayWindow(date);

    const { data: sessionRows, error: sessError } = await supabase
      .from('online_sessions')
      .select(SESSION_SELECT)
      .eq('school_id', schoolId)
      .gte('scheduled_start', start)
      .lt('scheduled_start', end)
      .order('scheduled_start');
    if (sessError) throw sessError;
    const sessions = ((sessionRows ?? []) as any[])
      .filter((r) => inWindow(String(r.scheduled_start), start, end))
      .map(mapSession);

    const sessionIds = sessions.map((s) => s.id);
    let participantRows: any[] = [];
    if (sessionIds.length > 0) {
      const { data: parts, error: partError } = await supabase
        .from('online_session_participants')
        .select('session_id, student_id, participation_status')
        .in('session_id', sessionIds);
      if (partError) throw partError;
      participantRows = ((parts ?? []) as any[]).filter((p) =>
        sessionIds.includes(String(p.session_id)),
      );
    }

    let scheduled = 0;
    let completed = 0;
    let cancelled = 0;
    let pending = 0;
    let teachingHours = 0;
    for (const s of sessions) {
      if (s.status === 'COMPLETED') {
        completed += 1;
        teachingHours = Math.round((teachingHours + s.durationHours) * 100) / 100;
      } else if (s.status === 'CANCELLED') {
        cancelled += 1;
      } else if (s.status === 'SCHEDULED' || s.status === 'CONFIRMED') {
        scheduled += 1;
      } else {
        pending += 1;
      }
    }

    const stats: CentreDayStats = {
      total: sessions.length,
      scheduled,
      completed,
      cancelled,
      pending,
      activeLearners: new Set(participantRows.map((p) => String(p.student_id))).size,
      activeTeachers: new Set(sessions.map((s) => s.teacherId)).size,
      teachingHours,
    };

    const base: CentreDayResult = { date, stats, sessions };
    if (!isMoney) return base;

    // Money path (director/principal/bursar only): revenue from
    // student_charges of enrolled students created in the day window; cost
    // from COMPLETED sessions × per_session rates.
    const { data: enrolRows, error: enrolError } = await supabase
      .from('online_enrolments')
      .select('id, school_id, student_id, offering_id, status')
      .eq('school_id', schoolId);
    if (enrolError) throw enrolError;
    const enrolledStudents = new Set(
      ((enrolRows ?? []) as any[]).map((e) => String(e.student_id)),
    );

    const { data: chargeRows, error: chargeError } = await supabase
      .from('student_charges')
      .select('id, school_id, student_id, amount, created_at')
      .eq('school_id', schoolId)
      .gte('created_at', start)
      .lt('created_at', end);
    if (chargeError) throw chargeError;
    const revenue = ((chargeRows ?? []) as any[])
      .filter(
        (c) =>
          enrolledStudents.has(String(c.student_id)) &&
          inWindow(String(c.created_at), start, end),
      )
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    const { data: engRows, error: engError } = await supabase
      .from('online_teacher_engagements')
      .select(ENGAGEMENT_SELECT)
      .eq('school_id', schoolId);
    if (engError) throw engError;
    const rates = flattenRates(sortEngagementsActiveFirst((engRows ?? []) as any[]));
    const cost = sessions.reduce((sum, s) => sum + costForSession(s, rates), 0);

    return { ...base, revenue, cost, margin: revenue - cost };
  },

  /**
   * Programme economics for a period (inclusive YYYY-MM-DD range):
   * revenue/cost/margin per offering plus totals. Money roles only.
   * Reads existing charges/sessions/engagements; no billing logic added.
   */
  async getProgrammeEconomics(
    schoolId: string,
    programmeId: string,
    period: { from: string; to: string },
    viewer: CentreOpsViewer,
  ): Promise<ProgrammeEconomics> {
    assertMoneyRole(viewer, 'getProgrammeEconomics');
    if (isMockEnv()) {
      return { programmeId, period, offerings: [], totals: { revenue: 0, cost: 0, margin: 0 } };
    }
    const { start, end } = periodWindow(period);

    const { data: offeringRows, error: offError } = await supabase
      .from('online_offerings')
      .select('id, school_id, programme_id, title, delivery_format, active')
      .eq('school_id', schoolId)
      .eq('programme_id', programmeId)
      .order('title');
    if (offError) throw offError;
    const offerings = ((offeringRows ?? []) as any[])
      .filter((r) => String(r.programme_id) === programmeId)
      .map(mapOffering);
    const offeringIds = new Set(offerings.map((o) => o.id));

    const { data: enrolRows, error: enrolError } = await supabase
      .from('online_enrolments')
      .select('id, school_id, student_id, offering_id, status')
      .eq('school_id', schoolId);
    if (enrolError) throw enrolError;
    // First enrolment wins per student (single-enrolment is the normal case).
    const studentOffering = new Map<string, string>();
    for (const e of (enrolRows ?? []) as any[]) {
      if (!e.offering_id || !offeringIds.has(String(e.offering_id))) continue;
      const key = String(e.student_id);
      if (!studentOffering.has(key)) studentOffering.set(key, String(e.offering_id));
    }

    const { data: chargeRows, error: chargeError } = await supabase
      .from('student_charges')
      .select('id, school_id, student_id, amount, created_at')
      .eq('school_id', schoolId)
      .gte('created_at', start)
      .lt('created_at', end);
    if (chargeError) throw chargeError;
    const revenueByOffering = new Map<string, number>();
    for (const c of (chargeRows ?? []) as any[]) {
      if (!inWindow(String(c.created_at), start, end)) continue;
      const offeringId = studentOffering.get(String(c.student_id));
      if (!offeringId) continue;
      revenueByOffering.set(offeringId, (revenueByOffering.get(offeringId) ?? 0) + (Number(c.amount) || 0));
    }

    const { data: sessionRows, error: sessError } = await supabase
      .from('online_sessions')
      .select(SESSION_SELECT)
      .eq('school_id', schoolId)
      .gte('scheduled_start', start)
      .lt('scheduled_start', end)
      .order('scheduled_start');
    if (sessError) throw sessError;
    const sessions = ((sessionRows ?? []) as any[])
      .filter(
        (r) =>
          inWindow(String(r.scheduled_start), start, end) &&
          r.offering_id &&
          offeringIds.has(String(r.offering_id)),
      )
      .map(mapSession);

    const { data: engRows, error: engError } = await supabase
      .from('online_teacher_engagements')
      .select(ENGAGEMENT_SELECT)
      .eq('school_id', schoolId);
    if (engError) throw engError;
    const rates = flattenRates(sortEngagementsActiveFirst((engRows ?? []) as any[]));

    const econOfferings: OfferingEconomics[] = offerings.map((o) => {
      const revenue = revenueByOffering.get(o.id) ?? 0;
      const completedSessions = sessions.filter(
        (s) => s.offeringId === o.id && s.status === 'COMPLETED',
      );
      const cost = completedSessions.reduce((sum, s) => sum + costForSession(s, rates), 0);
      return {
        offeringId: o.id,
        title: o.title,
        revenue,
        cost,
        margin: revenue - cost,
        sessionsCompleted: completedSessions.length,
      };
    });

    const totals = econOfferings.reduce(
      (acc, o) => ({
        revenue: acc.revenue + o.revenue,
        cost: acc.cost + o.cost,
        margin: acc.margin + o.margin,
      }),
      { revenue: 0, cost: 0, margin: 0 },
    );

    return { programmeId, period, offerings: econOfferings, totals };
  },

  /** Catalogue: active programmes for a school. Staff only. Mock → []. */
  async listProgrammes(schoolId: string, viewer: CentreOpsViewer): Promise<CentreProgramme[]> {
    assertStaff(viewer, 'listProgrammes');
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

  /** Offerings for a programme (or all school offerings when omitted). Staff only. Mock → []. */
  async listOfferings(
    schoolId: string,
    viewer: CentreOpsViewer,
    programmeId?: string,
  ): Promise<CentreOffering[]> {
    assertStaff(viewer, 'listOfferings');
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
   * Create a programme (minimal: name + optional description/active).
   * Money roles only (centre managed by director/principal/bursar).
   * Mock → null. Returns the created row.
   */
  async createProgramme(
    schoolId: string,
    input: ProgrammeInput,
    viewer: CentreOpsViewer,
  ): Promise<CentreProgramme | null> {
    assertMoneyRole(viewer, 'createProgramme');
    const name = input.name?.trim() ?? '';
    if (name.length < 2) {
      throw new Error('centreOpsService.createProgramme: name must be at least 2 characters');
    }
    if (isMockEnv()) return null;
    const { data, error } = await supabase
      .from('online_programmes')
      .insert({
        school_id: schoolId,
        name,
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        active: input.active ?? true,
      })
      .select('id, school_id, name, description, active')
      .single();
    if (error || !data) {
      throw error ?? new Error('centreOpsService.createProgramme: insert returned no row');
    }
    return mapProgramme(data);
  },

  /** Edit a programme (name/description/active). Money roles only. Mock → null. */
  async updateProgramme(
    schoolId: string,
    programmeId: string,
    patch: ProgrammePatch,
    viewer: CentreOpsViewer,
  ): Promise<CentreProgramme | null> {
    assertMoneyRole(viewer, 'updateProgramme');
    if (patch.name !== undefined && patch.name.trim().length < 2) {
      throw new Error('centreOpsService.updateProgramme: name must be at least 2 characters');
    }
    if (isMockEnv()) return null;
    const { data, error } = await supabase
      .from('online_programmes')
      .update({
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      })
      .eq('id', programmeId)
      .eq('school_id', schoolId)
      .select('id, school_id, name, description, active')
      .single();
    if (error || !data) {
      throw error ?? new Error('centreOpsService.updateProgramme: update returned no row');
    }
    return mapProgramme(data);
  },

  /** Create an offering (minimal). Money roles only. Mock → null. */
  async createOffering(
    schoolId: string,
    input: OfferingInput,
    viewer: CentreOpsViewer,
  ): Promise<CentreOffering | null> {
    assertMoneyRole(viewer, 'createOffering');
    const title = input.title?.trim() ?? '';
    if (title.length < 2) {
      throw new Error('centreOpsService.createOffering: title must be at least 2 characters');
    }
    if (!VALID_DELIVERY_FORMATS.has(input.deliveryFormat)) {
      throw new Error(
        `centreOpsService.createOffering: invalid delivery format ${JSON.stringify(input.deliveryFormat)} (expected one_to_one/small_group/group)`,
      );
    }
    if (isMockEnv()) return null;
    const { data, error } = await supabase
      .from('online_offerings')
      .insert({
        school_id: schoolId,
        ...(input.programmeId ? { programme_id: input.programmeId } : {}),
        title,
        delivery_format: input.deliveryFormat,
        active: input.active ?? true,
      })
      .select('id, school_id, programme_id, title, delivery_format, active')
      .single();
    if (error || !data) {
      throw error ?? new Error('centreOpsService.createOffering: insert returned no row');
    }
    return mapOffering(data);
  },

  /** Edit an offering (programme/title/format/active). Money roles only. Mock → null. */
  async updateOffering(
    schoolId: string,
    offeringId: string,
    patch: OfferingPatch,
    viewer: CentreOpsViewer,
  ): Promise<CentreOffering | null> {
    assertMoneyRole(viewer, 'updateOffering');
    if (patch.title !== undefined && patch.title.trim().length < 2) {
      throw new Error('centreOpsService.updateOffering: title must be at least 2 characters');
    }
    if (patch.deliveryFormat !== undefined && !VALID_DELIVERY_FORMATS.has(patch.deliveryFormat)) {
      throw new Error(
        `centreOpsService.updateOffering: invalid delivery format ${JSON.stringify(patch.deliveryFormat)}`,
      );
    }
    if (isMockEnv()) return null;
    const { data, error } = await supabase
      .from('online_offerings')
      .update({
        ...(patch.programmeId !== undefined ? { programme_id: patch.programmeId || null } : {}),
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.deliveryFormat !== undefined ? { delivery_format: patch.deliveryFormat } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      })
      .eq('id', offeringId)
      .eq('school_id', schoolId)
      .select('id, school_id, programme_id, title, delivery_format, active')
      .single();
    if (error || !data) {
      throw error ?? new Error('centreOpsService.updateOffering: update returned no row');
    }
    return mapOffering(data);
  },
};
