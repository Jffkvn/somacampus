import type { DailyAttendanceCoverage } from '../teacher/attendanceCoverage';
import { toHHMM } from '../teacher/scheduleUtils';

export type CockpitAttendanceStrip =
  | {
      state: 'recorded';
      recorderName: string;
      recordedAt: string;
      sessionId: string;
      isByViewer: boolean;
    }
  | { state: 'pending' };

/**
 * Pure strip model for the lesson cockpit daily-attendance card.
 * Single source of truth is class-date coverage (never the viewer's
 * Today responsibilities, which are empty for subject teachers).
 * Recorder name preference: explicit session name → classTeacherName
 * param → 'the class teacher'.
 */
export function resolveCockpitAttendanceStrip(
  viewerTeacherId: string,
  classTeacherName: string | null | undefined,
  coverage: DailyAttendanceCoverage,
): CockpitAttendanceStrip {
  const session = coverage?.session;
  if (!coverage?.covered || !session?.id) return { state: 'pending' };
  const sessionName =
    typeof session.recordedByName === 'string' && session.recordedByName.trim()
      ? session.recordedByName.trim()
      : null;
  const name =
    sessionName ?? (classTeacherName?.trim() ? classTeacherName.trim() : 'the class teacher');
  const recordedAt = typeof session.recorded_at === 'string' ? session.recorded_at : '';
  const recorderId = session.recorded_by_teacher_id ?? null;
  return {
    state: 'recorded',
    recorderName: name,
    recordedAt,
    sessionId: session.id,
    isByViewer: recorderId != null && recorderId === viewerTeacherId,
  };
}

/**
 * Display sentence for the cockpit strip. Viewers see "you"; a missing
 * recorded_at omits the time (never a trailing "at .").
 */
export function formatCockpitStripMessage(strip: CockpitAttendanceStrip): string {
  if (strip.state !== 'recorded') {
    return 'Daily morning attendance has not been recorded yet.';
  }
  const who = strip.isByViewer ? 'you' : strip.recorderName;
  const hhmm =
    toHHMM(strip.recordedAt) ?? (strip.recordedAt ? strip.recordedAt.slice(0, 5) : '');
  return hhmm
    ? `Daily morning attendance recorded by ${who} at ${hhmm}.`
    : `Daily morning attendance recorded by ${who}.`;
}
