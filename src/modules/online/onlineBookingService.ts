import { supabase } from '../../lib/supabase';

/**
 * Phase 9B Task 2 — online admissions flow (offer acceptance) + booking
 * confirmation + teacher conflict checker.
 *
 * Conventions (per feesService D1 hardening + 9A onlineCentreService):
 * - Mock env → honest no-ops (null for writes, false for the conflict
 *   check), never mock data.
 * - Live DB error → throw. Empty table → no conflict (false) / success.
 *
 * Documented decisions:
 * 1. acceptOffer(offerId, studentId): the offer must be in `sent` status with
 *    valid_until today-or-later (DATE comparison; equal counts as valid).
 *    Flow: offer → `accepted`, INSERT online_enrolments (active), enquiry →
 *    `enrolled` (commercial close `accepted` is folded into fulfilment close
 *    `enrolled` — the migration keeps both statuses but the service advances
 *    straight to `enrolled` since an enrolment row now exists). studentId is
 *    an explicit argument: online_enquiries carries only a student NAME
 *    (no student_id FK), so student provisioning/matching happens upstream
 *    and the caller passes the resolved students.id (NOT NULL on enrolments).
 * 2. checkTeacherConflict: physical load comes from timetable_entries
 *    (day_of_week Mon1..Sun7 + TIME range, half-open overlap: adjacent
 *    slots sharing an endpoint do NOT conflict). Online load comes from
 *    online_sessions concrete TIMESTAMPTZ ranges. Blocking statuses:
 *    SCHEDULED / CONFIRMED / IN_PROGRESS. COMPLETED / CANCELLED / NO_SHOW
 *    never block (history and no-shows free the teacher).
 * 3. confirmBooking(bookingId, teacherId): online_bookings carries no
 *    teacher FK, so the caller supplies the assigned teacher (resolved from
 *    the slot template's default_teacher_id or the teaching assignment).
 *    Booking date+TIME is interpreted as UTC for overlap comparison.
 *    Conflict check runs FIRST; on conflict the function throws and nothing
 *    is written (status stays `requested`).
 */

export interface AcceptedEnrolment {
  id: string;
  schoolId: string;
  studentId: string;
  offeringId?: string;
  status: string;
}

export interface ConfirmedBooking {
  id: string;
  schoolId: string;
  studentId: string;
  scheduledDate: string;
  status: string;
}

/** Online session statuses that occupy the teacher (block new bookings). */
const BLOCKING_SESSION_STATUSES: ReadonlySet<string> = new Set([
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
]);

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

/** "HH:MM[:SS]" → seconds since midnight; throws on unparseable input. */
function timeToSeconds(v: unknown): number {
  const m = String(v ?? '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) throw new Error(`onlineBookingService: unparseable TIME value ${JSON.stringify(v)}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? '0');
}

/** Half-open TIME overlap: [aStart, aEnd) vs [bStart, bEnd). */
function timeOverlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function toDate(v: string | Date, label: string): Date {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`onlineBookingService: invalid ${label} ${JSON.stringify(v)}`);
  return d;
}

/** JS Date → day_of_week Mon1..Sun7 (timetable_entries contract). */
function dayOfWeekUTC(d: Date): number {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

function todayYYYYMMDD(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Accept a sent offer: offer → accepted, enrolment row created, enquiry →
 * enrolled. Throws unless the offer is `sent` and unexpired.
 */
export async function acceptOffer(offerId: string, studentId: string): Promise<AcceptedEnrolment | null> {
  if (isMockEnv()) return null;
  if (!studentId) throw new Error('onlineBookingService.acceptOffer requires studentId (enquiries carry a name, not a student FK)');

  const { data: offer, error: offerError } = await supabase
    .from('online_offers')
    .select('id, school_id, enquiry_id, offering_id, pricing_option_id, status, valid_until')
    .eq('id', offerId)
    .maybeSingle();
  if (offerError) throw offerError;
  if (!offer) throw new Error(`onlineBookingService.acceptOffer: offer ${offerId} not found`);
  if (offer.status !== 'sent') {
    throw new Error(`onlineBookingService.acceptOffer: offer ${offerId} is ${offer.status}, must be sent`);
  }
  if (offer.valid_until && String(offer.valid_until).slice(0, 10) < todayYYYYMMDD()) {
    throw new Error(`onlineBookingService.acceptOffer: offer ${offerId} expired (valid_until ${offer.valid_until})`);
  }

  const { error: acceptError } = await supabase
    .from('online_offers')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', offerId);
  if (acceptError) throw acceptError;

  const { data: enrolment, error: enrolError } = await supabase
    .from('online_enrolments')
    .insert({
      school_id: offer.school_id,
      student_id: studentId,
      offering_id: offer.offering_id,
      pricing_option_id: offer.pricing_option_id ?? null,
      status: 'active',
    })
    .select('id, school_id, student_id, offering_id, status')
    .single();
  if (enrolError || !enrolment) throw enrolError ?? new Error('onlineBookingService.acceptOffer: enrolment insert returned no row');

  const { error: enquiryError } = await supabase
    .from('online_enquiries')
    .update({ status: 'enrolled', updated_at: new Date().toISOString() })
    .eq('id', offer.enquiry_id);
  if (enquiryError) throw enquiryError;

  return {
    id: String(enrolment.id),
    schoolId: String(enrolment.school_id),
    studentId: String(enrolment.student_id),
    ...(enrolment.offering_id ? { offeringId: String(enrolment.offering_id) } : {}),
    status: String(enrolment.status),
  };
}

/**
 * True when the teacher is busy during [start, end): physical timetable
 * overlap on the matching day_of_week, or an overlapping blocking online
 * session. Half-open intervals: back-to-back slots do NOT conflict.
 */
export async function checkTeacherConflict(
  teacherId: string,
  start: string | Date,
  end: string | Date,
): Promise<boolean> {
  if (isMockEnv()) return false;
  const startDate = toDate(start, 'start');
  const endDate = toDate(end, 'end');
  if (endDate.getTime() <= startDate.getTime()) {
    throw new Error('onlineBookingService.checkTeacherConflict: end must be after start');
  }

  const { data: entries, error: ttError } = await supabase
    .from('timetable_entries')
    .select('id, day_of_week, start_time, end_time')
    .eq('teacher_id', teacherId);
  if (ttError) throw ttError;

  const dow = dayOfWeekUTC(startDate);
  const reqStart = startDate.getUTCHours() * 3600 + startDate.getUTCMinutes() * 60 + startDate.getUTCSeconds();
  const reqEnd = endDate.getUTCHours() * 3600 + endDate.getUTCMinutes() * 60 + endDate.getUTCSeconds();
  for (const e of ((entries ?? []) as any[])) {
    if (Number(e.day_of_week) !== dow) continue;
    if (timeOverlaps(reqStart, reqEnd, timeToSeconds(e.start_time), timeToSeconds(e.end_time))) return true;
  }

  const { data: sessions, error: sessError } = await supabase
    .from('online_sessions')
    .select('id, status, scheduled_start, scheduled_end')
    .eq('teacher_id', teacherId);
  if (sessError) throw sessError;

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  for (const s of ((sessions ?? []) as any[])) {
    if (!BLOCKING_SESSION_STATUSES.has(String(s.status))) continue;
    const sStart = toDate(s.scheduled_start, 'scheduled_start').getTime();
    const sEnd = toDate(s.scheduled_end, 'scheduled_end').getTime();
    if (sStart < endMs && startMs < sEnd) return true;
  }
  return false;
}

/**
 * Confirm a requested booking after a clean conflict check. Conflicting →
 * throws with nothing written. Non-`requested` bookings throw.
 */
export async function confirmBooking(bookingId: string, teacherId: string): Promise<ConfirmedBooking | null> {
  if (isMockEnv()) return null;

  const { data: booking, error: readError } = await supabase
    .from('online_bookings')
    .select('id, school_id, student_id, offering_id, scheduled_date, start_time, end_time, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (readError) throw readError;
  if (!booking) throw new Error(`onlineBookingService.confirmBooking: booking ${bookingId} not found`);
  if (booking.status !== 'requested') {
    throw new Error(`onlineBookingService.confirmBooking: booking ${bookingId} is ${booking.status}, must be requested`);
  }

  const start = new Date(`${booking.scheduled_date}T${String(booking.start_time).slice(0, 8)}Z`);
  const end = new Date(`${booking.scheduled_date}T${String(booking.end_time).slice(0, 8)}Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`onlineBookingService.confirmBooking: booking ${bookingId} has unparseable date/time`);
  }
  if (await checkTeacherConflict(teacherId, start, end)) {
    throw new Error(`onlineBookingService.confirmBooking: teacher ${teacherId} has a conflicting session`);
  }

  const { data: updated, error: updateError } = await supabase
    .from('online_bookings')
    .update({ status: 'confirmed' })
    .eq('id', bookingId)
    .select('id, school_id, student_id, scheduled_date, status')
    .single();
  if (updateError || !updated) throw updateError ?? new Error('onlineBookingService.confirmBooking: confirm update returned no row');

  return {
    id: String(updated.id),
    schoolId: String(updated.school_id),
    studentId: String(updated.student_id),
    scheduledDate: String(updated.scheduled_date),
    status: String(updated.status),
  };
}
