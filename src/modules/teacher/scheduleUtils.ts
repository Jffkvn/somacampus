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
