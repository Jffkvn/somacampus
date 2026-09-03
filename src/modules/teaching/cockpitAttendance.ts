import type { DailyAttendanceCoverage } from '../teacher/attendanceCoverage';

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
 * Falls back to 'the class teacher' when no class-teacher name is known.
 */
export function resolveCockpitAttendanceStrip(
  viewerTeacherId: string,
  classTeacherName: string | null | undefined,
  coverage: DailyAttendanceCoverage,
): CockpitAttendanceStrip {
  const session = coverage?.session;
  if (!coverage?.covered || !session?.id) return { state: 'pending' };
  const name = classTeacherName?.trim() ? classTeacherName.trim() : 'the class teacher';
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
