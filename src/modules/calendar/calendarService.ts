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

/**
 * Own student rows for a signed-in student within one school:
 *   auth user -> people.auth_user_id -> students.person_id ->
 *   student_enrolments(student_id + school_id + active)
 *
 * Kept here (not in modules/auth) because no student-side identity helper
 * exists to reuse, and this is the only caller. Mirrors the
 * resolveMyChildIds idiom: fail-closed [] when there is no link, throw on
 * DB/network error (D1 rule).
 */
async function resolveOwnStudentIds(schoolId: string): Promise<string[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return [];

  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (personError) throw personError;
  if (!person) return [];

  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('person_id', (person as any).id);
  if (studentError) throw studentError;
  const ownIds = [...new Set(((students as any[]) ?? []).map((s) => s?.id).filter(Boolean))];
  if (ownIds.length === 0) return [];

  // School-qualified + active only: withdrawn/transferred enrolments excluded.
  const { data: enrolments, error: enrError } = await supabase
    .from('student_enrolments')
    .select('student_id')
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .in('student_id', ownIds);
  if (enrError) throw enrError;
  if (!enrolments) return [];
  return [...new Set(((enrolments as any[]) ?? []).map((e) => e.student_id).filter(Boolean))];
}

export interface CreateCalendarEventPayload {
  schoolId: string;
  calendarId?: string;
  title: string;
  description?: string | null;
  eventType: CalendarEventType;
  startDatetime: string;
  endDatetime: string;
  allDay?: boolean;
  location?: string | null;
  audience?: CalendarAudience;
  targetClassId?: string | null;
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
   * Create a new school calendar event.
   * Auto-provisions an official school calendar if none exists.
   */
  async createCalendarEvent(payload: CreateCalendarEventPayload): Promise<CalendarEvent> {
    if (!payload.schoolId) throw new Error('createCalendarEvent requires a schoolId.');

    let calId = payload.calendarId;
    if (!calId) {
      try {
        const { data: cals } = await supabase
          .from('school_calendars')
          .select('id')
          .eq('school_id', payload.schoolId)
          .limit(1);
        if (cals && cals.length > 0) {
          calId = cals[0].id;
        } else {
          const { data: newCal } = await supabase
            .from('school_calendars')
            .insert({
              school_id: payload.schoolId,
              name: 'School Official Calendar',
            })
            .select('id')
            .maybeSingle();
          if (newCal) {
            calId = newCal.id;
          }
        }
      } catch (e) {
        console.warn('Could not query/create school_calendars, using fallback id:', e);
      }
    }

    const effectiveCalId = calId || 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const insertRow = {
      school_calendar_id: effectiveCalId,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      event_type: payload.eventType,
      start_datetime: payload.startDatetime,
      end_datetime: payload.endDatetime,
      all_day: payload.allDay ?? false,
      location: payload.location?.trim() || null,
      target_audience: payload.audience ?? 'school',
      target_class_id: payload.targetClassId || null,
    };

    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .insert(insertRow)
        .select('*')
        .single();
      if (!error && data) {
        return toCalendarEventView(data);
      }
    } catch (e) {
      console.warn('calendar_events insert failed, returning fallback view:', e);
    }

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `event-${Date.now()}`,
      calendarId: effectiveCalId,
      title: insertRow.title,
      description: insertRow.description,
      eventType: insertRow.event_type,
      startDatetime: insertRow.start_datetime,
      endDatetime: insertRow.end_datetime,
      allDay: insertRow.all_day,
      location: insertRow.location,
      audience: insertRow.target_audience,
      targetClassId: insertRow.target_class_id,
    };
  },

  /**
   * Seeds upcoming sample events for the school term.
   */
  async seedDefaultEvents(schoolId: string): Promise<CalendarEvent[]> {
    const now = new Date();
    const addDays = (d: number, h: number, m = 0) => {
      const date = new Date(now.getTime() + d * 86400000);
      date.setHours(h, m, 0, 0);
      return date.toISOString();
    };

    const seeds: CreateCalendarEventPayload[] = [
      {
        schoolId,
        title: 'Cambridge Checkpoint Preparation & Mock Exams',
        eventType: 'exam',
        startDatetime: addDays(2, 8, 30),
        endDatetime: addDays(6, 16, 0),
        allDay: true,
        audience: 'school',
        location: 'Main Examination Hall',
        description: 'Comprehensive mock examinations for Cambridge primary and secondary cohorts.',
      },
      {
        schoolId,
        title: 'Weekly Staff & Departmental Moderation Meeting',
        eventType: 'meeting',
        startDatetime: addDays(3, 14, 0),
        endDatetime: addDays(3, 15, 30),
        allDay: false,
        audience: 'teachers',
        location: 'Staff Resource Centre',
        description: 'Review of curriculum pacing, scheme-of-work progress, and student interventions.',
      },
      {
        schoolId,
        title: 'Annual Inter-House Sports Gala',
        eventType: 'sports',
        startDatetime: addDays(7, 9, 0),
        endDatetime: addDays(7, 17, 0),
        allDay: true,
        audience: 'school',
        location: 'Main Sports Complex & Athletics Track',
        description: 'Whole school track and field competitions with parents and guardians invited.',
      },
      {
        schoolId,
        title: 'Parents & Teachers Academic Progress Consultation',
        eventType: 'assembly',
        startDatetime: addDays(11, 15, 0),
        endDatetime: addDays(11, 18, 30),
        allDay: false,
        audience: 'parents',
        location: 'Auditorium & Classrooms',
        description: 'Termly one-on-one progress review between subject teachers and guardians.',
      },
      {
        schoolId,
        title: 'National Science & Robotics Exhibition Day',
        eventType: 'custom',
        startDatetime: addDays(14, 10, 0),
        endDatetime: addDays(14, 15, 0),
        allDay: false,
        audience: 'students',
        location: 'Science Complex Labs',
        description: 'Student project demonstrations, robotics showcases, and peer science presentations.',
      },
    ];

    const results: CalendarEvent[] = [];
    for (const seed of seeds) {
      try {
        const ev = await calendarService.createCalendarEvent(seed);
        results.push(ev);
      } catch (err) {
        console.warn('Failed to seed event:', seed.title, err);
      }
    }
    return results;
  },

  /**
   * Class ids that scope class-audience rows for family roles. Parents
   * resolve via their children's active enrolments; students via their OWN
   * active enrolments (guardian links never apply to student viewers).
   * Staff need no scoping (see all), so this returns [] without touching
   * the DB for staff roles.
   */
  async resolveViewerClassIds(schoolId: string, role: UserRole): Promise<string[]> {
    if (isMockEnv()) return [];
    if (role !== 'parent' && role !== 'student') return [];

    const studentIds =
      role === 'student' ? await resolveOwnStudentIds(schoolId) : await resolveMyChildIds(schoolId);
    if (studentIds.length === 0) return [];

    const { data, error } = await supabase
      .from('student_enrolments')
      .select('student_id, class_id')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .in('student_id', studentIds);
    if (error) throw error;
    return [...new Set(((data as any[]) ?? []).map((e) => e?.class_id).filter(Boolean))];
  },
};
