/**
 * Pure schedule helpers for the teacher live timetable (Task 3).
 *
 * DB contract: timetable_entries.day_of_week is 1-7 (Mon=1 .. Sun=7),
 * start_time/end_time are TIME columns ("HH:MM:SS").
 */

/** Map an ISO date (YYYY-MM-DD) to day_of_week Mon1..Sun7. */
export function toDayOfWeek(date: string): number {
  const day = new Date(`${date}T12:00:00`).getDay(); // 0=Sun .. 6=Sat
  return ((day + 6) % 7) + 1; // Mon=1 .. Sun=7
}

/** Extract "HH:MM" from a TIME value ("HH:MM:SS" or "HH:MM"). */
export function toHHMM(v: unknown): string | null {
  const m = String(v ?? '').match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Local YYYY-MM-DD for a Date (getFullYear/getMonth/getDate, padded). */
export function toLocalYYYYMMDD(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Extract the first name for greeting, skipping leading honorific titles.
 * Strips Mrs/Mr/Ms/Miss/Dr/Prof (with or without period, case-insensitive),
 * returns the first remaining token, or "Teacher" when nothing is left.
 */
export function greetFirstName(fullName: string): string {
  const tokens = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const titles = new Set(['mrs', 'mr', 'ms', 'miss', 'dr', 'prof']);
  while (tokens.length > 0) {
    const normalized = tokens[0].replace(/\.+$/, '').toLowerCase();
    if (!titles.has(normalized)) break;
    tokens.shift();
  }
  return tokens[0] ?? 'Teacher';
}

/**
 * Derive the attendance recorder role from relationships (display-only, never persisted).
 * - same id as class teacher → 'class_teacher'
 * - different id present in today's schedule teacherIds → 'subject_teacher'
 * - otherwise → 'substitute'
 */
export function deriveRecorderRole(
  recordedById: string | undefined,
  classTeacherId: string,
  scheduleTeacherIds: string[]
): 'class_teacher' | 'subject_teacher' | 'substitute' {
  if (recordedById && recordedById === classTeacherId) return 'class_teacher';
  if (recordedById && scheduleTeacherIds.includes(recordedById)) return 'subject_teacher';
  return 'substitute';
}
