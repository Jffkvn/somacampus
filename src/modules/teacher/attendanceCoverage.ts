import { supabase } from '../../lib/supabase';

export interface DailyAttendanceSession {
  id: string;
  class_teacher_id?: string | null;
  recorded_by_teacher_id?: string | null;
  recorded_at?: string | null;
  present_count?: number | null;
  absent_count?: number | null;
  late_count?: number | null;
  excused_count?: number | null;
  total_students?: number | null;
  [key: string]: unknown;
}

export interface DailyAttendanceCoverage {
  covered: boolean;
  session?: DailyAttendanceSession | null;
}

const COVERAGE_SELECT =
  'id, class_teacher_id, recorded_by_teacher_id, recorded_at, present_count, absent_count, late_count, excused_count, total_students';

/** Canonical covered-set key: `classId|streamId|date` (null stream -> ''). */
export function attendanceCoverageKey(
  classId: string | null | undefined,
  streamId: string | null | undefined,
  date: string | null | undefined,
): string {
  return `${classId ?? ''}|${streamId ?? ''}|${date ?? ''}`;
}

function streamKeyOf(v: unknown): string {
  return typeof v === 'string' && v ? v : '';
}

/**
 * Build an in-memory covered-set from already-fetched
 * `student_attendance_sessions` rows. Keyed `classId|streamId|date`.
 * Rows without class_id/date are ignored.
 */
export function buildAttendanceCoveredSet(rows: Array<any>, fallbackDate?: string): Set<string> {
  const covered = new Set<string>();
  for (const r of rows ?? []) {
    const classId = typeof r?.class_id === 'string' ? r.class_id : null;
    const date = typeof r?.date === 'string' ? r.date : fallbackDate;
    if (!classId || !date) continue;
    covered.add(attendanceCoverageKey(classId, streamKeyOf(r?.stream_id) || '', date));
  }
  return covered;
}

/**
 * Class-date coverage for one class/stream/date.
 * Student attendance is ONE session per class/stream/date (daily, normally
 * morning) — never keyed on timetable_entry_id.
 * Never throws: on any failure returns `{ covered: false }`.
 */
export async function getDailyAttendanceCoverage(
  schoolId: string,
  classId: string,
  streamIdOrNull: string | null | undefined,
  date: string,
): Promise<DailyAttendanceCoverage> {
  try {
    let query = supabase
      .from('student_attendance_sessions')
      .select(COVERAGE_SELECT)
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .eq('date', date);
    if (streamIdOrNull == null || streamIdOrNull === '') {
      query = query.is('stream_id', null);
    } else {
      query = query.eq('stream_id', streamIdOrNull);
    }
    const { data } = await query.maybeSingle();
    if (!data) return { covered: false, session: null };
    return { covered: true, session: data as DailyAttendanceSession };
  } catch {
    return { covered: false };
  }
}
