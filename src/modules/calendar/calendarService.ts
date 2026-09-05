/**
 * School Calendar Service — SomaCampus Phase 8E Task 1 (read-only view).
 *
 * Tables (migration 20260903000000, RLS opened in 8A):
 * - school_calendars: school-scoped reads (staff of the school + guardians of
 *   enrolled children). NEVER queried without the school_id filter.
 * - calendar_events: authenticated read-all; the school scoping here is the
 *   school_calendar_id IN (...) filter derived from this school's calendars,
 *   and the audience scoping below is client-side defense-in-depth.
 *
 * Audience matrix (event.target_audience):
 * - school   -> every role (term dates, holidays).
 * - teachers -> teacher, admin, principal (staff-only; parents never see).
 * - parents  -> parent + staff (teacher, admin, principal).
 * - students -> student + parent + staff (parents act on pupil events).
 * - class    -> staff see all classes; parent/student see ONLY events whose
 *   class id is in the viewer's class set, fail-closed when the event carries
 *   no class id (no cross-class leak).
 * - bursar holds calendar.view but has no teaching/pastoral scope, so bursar
 *   sees school-wide rows only. Unknown audiences fail closed.
 *
 * Class targeting note: the base schema carries no target_class_id column on
 * calendar_events (staff manage events via a future admin surface). The
 * mapper reads row.target_class_id opportunistically so class scoping
 * activates the moment class-targeted rows exist; until then class-audience
 * rows carry null and stay staff-only.
 *
 * Conventions: mock-env guard returns honest [] (never touches the DB);
 * DB/RLS errors THROW (D1 rule) — never silent [] and never leaked rows.
 * No AI, no writes (read-only by lock).
 */

import { supabase } from '../../lib/supabase';
import { resolveMyChildIds } from '../auth/parentIdentity';
import type { UserRole } from '../../config/permissions';

export type CalendarAudience = 'school' | 'teachers' | 'parents' | 'students' | 'class';

export type CalendarEventType =
  | 'assembly'
  | 'sports'
  | 'exam'
  | 'meeting'
  | 'holiday'
  | 'trip'
  | 'ceremony'
  | 'custom';

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  eventType: CalendarEventType;
  startDatetime: string;
  endDatetime: string;
  allDay: boolean;
  location: string | null;
  audience: CalendarAudience;
  /** Class id for class-audience rows; null when untargeted/unknown. */
  targetClassId: string | null;
}

export interface CalendarViewer {
  role: UserRole;
  /** Reserved for future per-person scoping; RLS + audience filter arbitrate today. */
  personId?: string;
  /** Child (or own) class ids used to scope class-audience rows. */
  childClassIds?: string[];
}

const STAFF_ROLES: UserRole[] = ['teacher', 'admin', 'principal'];

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

export function toCalendarEventView(row: any): CalendarEvent {
  return {
    id: row.id,
    calendarId: row.school_calendar_id,
    title: row.title,
    description: row.description ?? null,
    eventType: row.event_type ?? 'custom',
    startDatetime: row.start_datetime,
    endDatetime: row.end_datetime,
    allDay: row.all_day ?? false,
    location: row.location ?? null,
    audience: row.target_audience ?? 'school',
    targetClassId: row.target_class_id ?? null,
  };
}

export function isAudienceVisible(
  audience: CalendarAudience,
  role: UserRole,
  childClassIds: string[],
  targetClassId: string | null
): boolean {
  switch (audience) {
    case 'school':
      return true;
    case 'teachers':
      return STAFF_ROLES.includes(role);
    case 'parents':
      return role === 'parent' || STAFF_ROLES.includes(role);
    case 'students':
      return role === 'student' || role === 'parent' || STAFF_ROLES.includes(role);
    case 'class':
      if (STAFF_ROLES.includes(role)) return true;
      if ((role === 'parent' || role === 'student') && targetClassId) {
        return childClassIds.includes(targetClassId);
      }
      return false;
    default:
      return false;
  }
}

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export const calendarService = {
  /**
   * Upcoming events for a school, ascending by start. School scoping flows
   * through the school's own calendars; audience + class scoping is applied
   * client-side (see matrix above) because calendar_events RLS is read-all.
   */
  async getCalendarEvents(schoolId: string, viewer: CalendarViewer): Promise<CalendarEvent[]> {
    if (isMockEnv()) return [];
    if (!schoolId) throw new Error('getCalendarEvents requires a schoolId.');

    const { data: calendars, error: calError } = await supabase
      .from('school_calendars')
      .select('id')
      .eq('school_id', schoolId);
    if (calError) throw calError;

    const calendarIds = [...new Set(((calendars as any[]) ?? []).map((c) => c?.id).filter(Boolean))];
    if (calendarIds.length === 0) return [];

    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .in('school_calendar_id', calendarIds)
      .gte('start_datetime', startOfTodayUtc().toISOString())
      .order('start_datetime', { ascending: true });
    if (error) throw error;

    const todayStart = startOfTodayUtc().getTime();
    const classIds = viewer.childClassIds ?? [];
    return ((data as any[]) ?? [])
      .map(toCalendarEventView)
      .filter((e) => new Date(e.startDatetime).getTime() >= todayStart)
      .filter((e) => isAudienceVisible(e.audience, viewer.role, classIds, e.targetClassId))
      .sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime());
  },

  /**
   * Class ids that scope class-audience rows for family roles: the viewer's
   * children's active enrolment classes. Staff need no scoping (see all), so
   * this returns [] without touching the DB for staff roles.
   */
  async resolveViewerClassIds(schoolId: string, role: UserRole): Promise<string[]> {
    if (isMockEnv()) return [];
    if (role !== 'parent' && role !== 'student') return [];

    const childIds = await resolveMyChildIds(schoolId);
    if (childIds.length === 0) return [];

    const { data, error } = await supabase
      .from('student_enrolments')
      .select('student_id, class_id')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .in('student_id', childIds);
    if (error) throw error;
    return [...new Set(((data as any[]) ?? []).map((e) => e?.class_id).filter(Boolean))];
  },
};
